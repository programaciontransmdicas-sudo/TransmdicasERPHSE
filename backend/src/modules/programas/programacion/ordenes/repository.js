import { pool } from '../../../../config/database.js';

// ==========================================
// ORDENES DE TRABAJO (TI-PR-01)
// SQL contra el modelo 013-016. Parametrizado, columnas explícitas.
// ==========================================
//
// Sin lógica de negocio y sin HTTP: aquí solo se consulta y se escribe.
//
// NO SE EXPONE NI SE ESCRIBE NINGUNA COLUMNA QUE RETIREN 20261001_900 NI 901. La OT no
// tiene ninguna; las que se leen de otras tablas son las que sobreviven. En particular
// `nivel_programado` sale de programacion_mantenimiento_equipos.nivel_mantenimiento, que es
// justo donde 900 deja el nivel -«El nivel pasa al detalle por equipo»-, no de la columna
// homónima de la cabecera de la visita, que 900 elimina.
//
// ordenes_trabajo NO tiene programa_id: la pertenencia al programa se comprueba SIEMPRE
// uniendo contra programacion_mantenimiento, nunca confiando en el parámetro de la ruta.
//
// NO HAY NINGUN DELETE EN ESTE ARCHIVO. La regla R1 de 20260928_016 prohíbe borrar una OT
// en cualquier estado, y el borrado de un detalle lo bloquea su trigger: una OT creada por
// error se anula, y eso es trabajo de la etapa 4.3.
//
// Cada función acepta un cliente opcional para poder correr dentro de una transacción.

// Las 14 columnas reales de la cabecera. Fechas con sello horario: se devuelven tal cual.
const COLUMNAS = `
  o.id,
  o.programacion_id,
  o.tecnico_id,
  o.abierta_por_id,
  o.cerrada_por_id,
  o.fecha_apertura,
  o.fecha_cierre,
  o.estado,
  o.motivo_anulacion,
  o.minutos,
  o.evidencias,
  o.observaciones,
  o.created_at,
  o.updated_at,

  -- F5.1 · NOMBRES RESUELTOS POR RELACION MAESTRA. En ordenes_trabajo NO se almacena ningun
  -- nombre: solo los dos id. Estas tres son SUBCONSULTAS CORRELACIONADAS y no JOIN a
  -- proposito: las tres consultas de lectura de este archivo comparten COLUMNAS, y un JOIN
  -- mas podria multiplicar filas si alguna relacion dejara de ser 1:1. Con subconsulta cada
  -- una devuelve un valor o NULL, y el recuento de filas no cambia.
  --
  -- tecnico_id -> personal(id). cerrada_por_id -> usuarios(id), y de ahi, SI la cuenta tiene
  -- persona ligada, a su nombre real. Cuando no la tiene el nombre es NULL y el username es
  -- la unica identidad disponible: no se inventa nada.
  (SELECT pe.nombre_completo
     FROM personal pe
    WHERE pe.id = o.tecnico_id)                       AS tecnico_nombre,
  (SELECT us.username
     FROM usuarios us
    WHERE us.id = o.cerrada_por_id)                   AS cerrada_por_username,
  (SELECT pe.nombre_completo
     FROM usuarios us
     JOIN personal pe ON pe.id = us.persona_id
    WHERE us.id = o.cerrada_por_id)                   AS cerrada_por_nombre`;

// La unidad viaja con la OT porque es lo que un operador necesita para identificarla.
const UNIDAD = `
  p.programa_unidad_id,
  u.placa,
  p.quincena_efectiva::text AS quincena_efectiva`;

// ------------------------------------------------------------------------------------
// APERTURA
// ------------------------------------------------------------------------------------

// FOR UPDATE OF p: bloquea la fila de la VISITA, y solo esa, hasta el final de la
// transacción. No es un adorno. El índice uq_ot_programacion_activa ya serializa dos
// aperturas simultáneas, pero no protege frente a que otra transacción reprograme, cancele
// o promueva la visita entre el momento en que se comprueba su estado y el INSERT de la OT.
// Medido en la etapa 4.0: sin este cerrojo las dos operaciones no se serializan.
//
// `OF p` evita bloquear además la fila de la unidad, que nadie va a cambiar aquí.
export const obtenerProgramacionParaApertura = async (
  programaId,
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT p.id,
            p.programa_id,
            p.programa_unidad_id,
            p.estado,
            p.quincena_programada::text   AS quincena_programada,
            p.quincena_reprogramada::text AS quincena_reprogramada,
            p.quincena_efectiva::text     AS quincena_efectiva,
            u.placa
       FROM programacion_mantenimiento p
       JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
      WHERE p.programa_id = $1
        AND p.id = $2
      FOR UPDATE OF p`,
    [programaId, programacionId]
  );

  return result.rows[0] ?? null;
};

// El alcance previsto es la fuente de verdad de lo que la OT tendrá que resolver. Una
// visita sin previstos no es ejecutable y su OT no podría cerrarse nunca.
export const contarEquiposPrevistos = async (
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT count(*)::int AS total
       FROM programacion_mantenimiento_equipos
      WHERE programacion_id = $1`,
    [programacionId]
  );

  return result.rows[0].total;
};

// Espejo de uq_ot_programacion_activa, para contestar un 409 legible en vez de dejar que la
// base responda con un 23505. El índice sigue siendo la defensa estructural final.
export const contarOrdenesActivas = async (
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT count(*)::int AS total
       FROM ordenes_trabajo
      WHERE programacion_id = $1
        AND estado <> 'ANULADA'`,
    [programacionId]
  );

  return result.rows[0].total;
};

// estado no se escribe: nace ABIERTA por defecto y validar_apertura_ot exige que sea así.
// fecha_apertura, evidencias, created_at y updated_at los pone la base.
export const insertarOrden = async (
  programacionId,
  tecnicoId,
  abiertaPorId,
  cliente = pool
) => {
  const result = await cliente.query(
    `INSERT INTO ordenes_trabajo (
       programacion_id,
       tecnico_id,
       abierta_por_id
     )
     VALUES ($1, $2, $3)
     RETURNING id`,
    [programacionId, tecnicoId, abiertaPorId]
  );

  return result.rows[0].id;
};

// UNA sola sentencia, no un bucle: el conjunto de detalles es exactamente el de los equipos
// previstos, y así la correspondencia 1:1 la garantiza la propia consulta.
//
// nivel_completado va NULL y estado PENDIENTE porque nada se ha ejecutado todavía:
// chk_otd_presencia exige justamente esa combinación. evidencias no se menciona para que
// aplique su DEFAULT '[]'::jsonb y no haya dos sitios que definan el valor inicial.
//
// programacion_id se copia del previsto, no del parámetro: así las dos FK compuestas de la
// tabla quedan pinchadas por el mismo valor y un detalle no puede apuntar al equipo
// previsto de otra visita.
export const materializarDetalles = async (
  otId,
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `INSERT INTO ordenes_trabajo_detalle (
       orden_trabajo_id,
       programacion_id,
       programacion_equipo_id,
       nivel_completado,
       estado
     )
     SELECT $1,
            e.programacion_id,
            e.id,
            NULL,
            'PENDIENTE'
       FROM programacion_mantenimiento_equipos e
      WHERE e.programacion_id = $2`,
    [otId, programacionId]
  );

  return result.rowCount;
};

// ------------------------------------------------------------------------------------
// CIERRE Y ANULACION (etapa 4.3)
// ------------------------------------------------------------------------------------

// EL CIERRE NO SE IMPLEMENTA AQUI. cerrar_orden_trabajo() hace todo el trabajo en una
// sola sentencia -fija la fecha fisica en la visita, propaga los ciclos con la jerarquia
// acumulativa, deriva el resultado y cierra la OT- y devuelve el resultado derivado y el
// numero de ciclos realmente escritos. Reimplementar cualquier parte de eso en JavaScript
// seria una segunda definicion de las mismas reglas.
//
// Se invoca con el MISMO cliente de la transaccion, de modo que su trabajo y la auditoria
// se confirman o se revierten juntos.
//
// Los dos parametros opcionales se pasan siempre explicitos: la funcion los declara con
// DEFAULT NULL y COALESCE conserva el valor anterior cuando llegan nulos.
// F5.1 · ASIGNAR EL TECNICO, UNA SOLA VEZ Y SOLO SI NO TENIA.
//
// Va en una sentencia aparte y ANTES de cerrar_orden_trabajo() porque esa funcion no recibe
// el tecnico -su firma es (p_ot_id, p_cerrada_por, p_fecha_ejecucion, p_minutos,
// p_observaciones)- y porque el trigger impedir_modificar_ot_cerrada bloquea cualquier
// UPDATE sobre una OT que ya este CERRADA. Mientras esta ABIERTA, escribir tecnico_id esta
// permitido. Las dos sentencias comparten transaccion, asi que o entran las dos o ninguna.
//
// LAS DOS GUARDAS DEL WHERE SON LA REGLA, no una optimizacion:
//   estado = 'ABIERTA'      no se asigna tecnico a una orden ya cerrada o anulada
//   tecnico_id IS NULL      NUNCA se sobreescribe un tecnico existente, cierre quien cierre
//
// Devuelve si escribio. Un false con el cerrojo ya tomado significa que el estado cambio
// bajo los pies, y el controller lo trata como conflicto en vez de seguir cerrando.
export const asignarTecnicoAlCerrar = async (
  otId,
  tecnicoId,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE ordenes_trabajo o
     SET tecnico_id = $2
     WHERE o.id = $1
       AND o.estado = 'ABIERTA'
       AND o.tecnico_id IS NULL
     RETURNING o.id`,
    [otId, tecnicoId]
  );

  return result.rowCount > 0;
};

export const cerrarOrden = async (
  otId,
  cerradaPorId,
  fechaEjecucion,
  minutos,
  observaciones,
  cliente = pool
) => {
  const result = await cliente.query(
    'SELECT estado_programacion, ciclos_afectados'
    + ' FROM cerrar_orden_trabajo($1, $2, $3::date, $4, $5)',
    [otId, cerradaPorId, fechaEjecucion, minutos, observaciones]
  );

  return result.rows[0];
};

// Anular NO es borrar: la fila permanece con su motivo y con todo lo registrado. Se
// escriben los cuatro campos juntos porque chk_ot_cierre exige fecha_cierre y
// cerrada_por_id para cualquier estado distinto de ABIERTA, aunque sus nombres hablen de
// cierre; y chk_ot_anulacion exige que motivo_anulacion exista exactamente cuando el
// estado es ANULADA.
//
// La guarda de estado va en el propio WHERE: con el cerrojo de la cabecera ya tomado no
// deberia poder cambiar, pero asi la escritura y su permiso son la misma operacion.
//
// NO se tocan tecnico_id, minutos, observaciones, evidencias ni ningun detalle.
export const anularOrden = async (
  otId,
  motivo,
  cerradaPorId,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE ordenes_trabajo
        SET estado           = 'ANULADA',
            motivo_anulacion = $2,
            fecha_cierre     = CURRENT_TIMESTAMP,
            cerrada_por_id   = $3
      WHERE id = $1
        AND estado = 'ABIERTA'
      RETURNING id`,
    [otId, motivo, cerradaPorId]
  );

  return result.rowCount;
};

// El resultado que el cierre deja en la VISITA. Se lee antes y despues para auditar el
// cambio, y para responder sin que el cliente tenga que pedir la programacion aparte.
//
// quincena_efectiva es GENERATED ALWAYS: se lee, nunca se escribe. Las tres quincenas
// viajan como texto porque date -> Date de JavaScript desplaza la zona horaria.
export const obtenerResultadoDeVisita = async (
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT p.id,
            p.estado,
            p.fecha_ejecucion::text       AS fecha_ejecucion,
            p.quincena_programada::text   AS quincena_programada,
            p.quincena_reprogramada::text AS quincena_reprogramada,
            p.quincena_efectiva::text     AS quincena_efectiva
       FROM programacion_mantenimiento p
      WHERE p.id = $1`,
    [programacionId]
  );

  return result.rows[0] ?? null;
};

// ------------------------------------------------------------------------------------
// LECTURA
// ------------------------------------------------------------------------------------

// Solo para distinguir un 404 de un listado vacío: si la visita no existe en ese programa
// es 404; si existe y no tiene ninguna OT, es un listado vacío. No toma cerrojo, porque no
// decide nada: la apertura usa obtenerProgramacionParaApertura, que sí bloquea.
export const existeVisitaEnPrograma = async (
  programaId,
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT 1 AS existe
       FROM programacion_mantenimiento p
      WHERE p.programa_id = $1
        AND p.id = $2`,
    [programaId, programacionId]
  );

  return result.rowCount > 0;
};

// Histórico completo, anuladas incluidas. El orden pone primero la más reciente; el id
// desempata para que dos aperturas del mismo instante tengan un orden estable.
export const obtenerOrdenes = async (
  programaId,
  programacionId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${UNIDAD}
       FROM ordenes_trabajo o
       JOIN programacion_mantenimiento p
         ON p.id = o.programacion_id
       JOIN programa_mantenimiento_unidades u
         ON u.id = p.programa_unidad_id
      WHERE p.programa_id = $1
        AND o.programacion_id = $2
      ORDER BY o.fecha_apertura DESC, o.id DESC`,
    [programaId, programacionId]
  );

  return result.rows;
};

// Las tres condiciones van juntas en el WHERE: una OT de otro programa o de otra visita no
// se filtra, simplemente no existe para esta ruta.
export const obtenerOrdenPorId = async (
  programaId,
  programacionId,
  otId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${UNIDAD}
       FROM ordenes_trabajo o
       JOIN programacion_mantenimiento p
         ON p.id = o.programacion_id
       JOIN programa_mantenimiento_unidades u
         ON u.id = p.programa_unidad_id
      WHERE p.programa_id = $1
        AND o.programacion_id = $2
        AND o.id = $3`,
    [programaId, programacionId, otId]
  );

  return result.rows[0] ?? null;
};

// ------------------------------------------------------------------------------------
// ESCRITURA (etapa 4.2)
// ------------------------------------------------------------------------------------

// EL CERROJO DE TODA OPERACION DE ESCRITURA SOBRE LA OT Y SUS DETALLES.
//
// Se bloquea la CABECERA, y se bloquea PRIMERO. cerrar_orden_trabajo() hace exactamente lo
// mismo -SELECT ... FROM ordenes_trabajo WHERE id = ... FOR UPDATE como su paso 1-, asi que
// los dos flujos adquieren los cerrojos en el MISMO orden: cabecera y despues detalle.
// Invertirlo -tomar el detalle primero- crearia ordenes de bloqueo opuestos y con ellos la
// posibilidad de un interbloqueo.
//
// Y cierra el hueco medido en la etapa 4.0: sin este cerrojo, un detalle podia modificarse
// mientras otra transaccion estaba cerrando la OT, porque el trigger del detalle lee la
// cabecera SIN bloquearla.
//
// Las tres condiciones van juntas: una OT de otra visita o de otro programa no existe para
// esta ruta.
export const obtenerOrdenParaEscritura = async (
  programaId,
  programacionId,
  otId,
  cliente = pool
) => {
  // Mismo orden de bloqueo que los ajustes de planificación: unidad antes de orden.
  await cliente.query(`SELECT u.id FROM programa_mantenimiento_unidades u
    JOIN programacion_mantenimiento p ON p.programa_unidad_id=u.id
    JOIN ordenes_trabajo o ON o.programacion_id=p.id
    WHERE p.programa_id=$1 AND p.id=$2 AND o.id=$3 FOR UPDATE OF u`,
    [programaId, programacionId, otId]);
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${UNIDAD},
            EXISTS (SELECT 1 FROM programacion_mantenimiento_ajustes a
              WHERE a.programa_unidad_id=u.id) AS planificacion_unidad_ajustada
       FROM ordenes_trabajo o
       JOIN programacion_mantenimiento p
         ON p.id = o.programacion_id
       JOIN programa_mantenimiento_unidades u
         ON u.id = p.programa_unidad_id
      WHERE p.programa_id = $1
        AND o.programacion_id = $2
        AND o.id = $3
      FOR UPDATE OF o`,
    [programaId, programacionId, otId]
  );

  return result.rows[0] ?? null;
};

// Un detalle concreto de una OT concreta, con lo previsto por JOIN. tipo_equipo y
// nivel_programado son del equipo previsto: el detalle no los duplica.
export const obtenerDetalleDeOrden = async (
  otId,
  detalleId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT d.id,
            d.orden_trabajo_id,
            d.programacion_id,
            d.programacion_equipo_id,
            e.tipo_equipo,
            e.nivel_mantenimiento AS nivel_programado,
            d.estado,
            d.nivel_completado,
            d.observaciones,
            d.enlace_video,
            d.evidencias,
            d.created_at,
            d.updated_at
       FROM ordenes_trabajo_detalle d
       JOIN programacion_mantenimiento_equipos e
         ON e.id = d.programacion_equipo_id
      WHERE d.orden_trabajo_id = $1
        AND d.id = $2`,
    [otId, detalleId]
  );

  return result.rows[0] ?? null;
};

// F5.2 · aqui vivian sonIgualesLasEvidencias y sus dos envoltorios,
// evidenciasIgualesEnOrden y evidenciasIgualesEnDetalle, que comparaban el jsonb
// evidencias para no reescribirlo cuando llegaba igual. Se RETIRAN: desde
// 20261010_018 la evidencia fotografica vive en ordenes_trabajo_evidencias, el campo
// salio de las dos listas blancas y el controller ya no tiene la rama que las llamaba.
// Quedarian como un camino para volver a escribir una fuente de verdad paralela.

// Lista blanca con su cast, igual que actualizarUnidad: campos ya viene filtrada por el
// service y aqui se vuelve a restringir, de modo que ningun nombre llega a la sentencia sin
// pasar por ella. estado de la OT, fechas y usuarios no estan: no son editables.
const asignacionesDe = (
  campos,
  data,
  permitidos
) => {
  const asignaciones = [];
  const valores = [];

  for (const campo of campos) {
    const permitido = permitidos[campo];

    if (!permitido) {
      continue;
    }

    valores.push(
      permitido.cast === '::jsonb'
        ? JSON.stringify(data[campo])
        : data[campo]
    );

    asignaciones.push(
      `${campo} = $${valores.length}${permitido.cast}`
    );
  }

  return { asignaciones, valores };
};

// F5.1 · tecnico_id SALIO de aqui tambien, no solo del service. Es la segunda puerta: esta
// lista blanca es lo que decide que columnas puede tocar el UPDATE de la cabecera, y la
// unica escritura de tecnico_id que existe ahora es asignarTecnicoAlCerrar(), que tiene sus
// propias guardas -estado ABIERTA y tecnico_id IS NULL-. Que el campo ya no llegue desde el
// service no es razon para dejarlo abierto aqui.
// F5.2 · evidencias SALIO de aqui. Desde 20261010_018 la evidencia fotografica vive en
// ordenes_trabajo_evidencias y las dos columnas jsonb dejan de escribirse: ni desde el
// service -salieron de CAMPOS_EDITABLES_CABECERA- ni desde esta lista blanca, que es la
// que decide que columnas puede tocar el UPDATE. Que el campo ya no llegue no es razon
// para dejar la puerta abierta.
const PERMITIDOS_CABECERA = {
  minutos: { cast: '::int' },
  observaciones: { cast: '' }
};

const PERMITIDOS_DETALLE = {
  estado: { cast: '' },
  nivel_completado: { cast: '' },
  observaciones: { cast: '' },
  enlace_video: { cast: '' }
};

// La guarda de estado va en el propio WHERE: con el cerrojo de la cabecera ya tomado no
// deberia poder cambiar, pero asi la escritura y su permiso son la misma operacion.
export const actualizarOrden = async (
  otId,
  campos,
  data,
  cliente = pool
) => {
  const {
    asignaciones,
    valores
  } = asignacionesDe(campos, data, PERMITIDOS_CABECERA);

  if (asignaciones.length === 0) {
    return 0;
  }

  const result = await cliente.query(
    `UPDATE ordenes_trabajo
        SET ${asignaciones.join(', ')}
      WHERE id = $${valores.length + 1}
        AND estado = 'ABIERTA'
      RETURNING id`,
    [...valores, otId]
  );

  return result.rowCount;
};

export const actualizarDetalle = async (
  detalleId,
  campos,
  data,
  cliente = pool
) => {
  const {
    asignaciones,
    valores
  } = asignacionesDe(campos, data, PERMITIDOS_DETALLE);

  if (asignaciones.length === 0) {
    return 0;
  }

  const result = await cliente.query(
    `UPDATE ordenes_trabajo_detalle d
        SET ${asignaciones.join(', ')}
      WHERE d.id = $${valores.length + 1}
        AND EXISTS (
          SELECT 1
            FROM ordenes_trabajo o
           WHERE o.id = d.orden_trabajo_id
             AND o.estado = 'ABIERTA'
        )
      RETURNING d.id`,
    [...valores, detalleId]
  );

  return result.rowCount;
};

// SIN N+1: los detalles de TODAS las OT pedidas en una sola consulta, agrupados en memoria.
//
// tipo_equipo y nivel_programado se obtienen por JOIN contra el equipo previsto, que es la
// única fuente de verdad de lo previsto. ordenes_trabajo_detalle no los duplica a propósito.
export const obtenerDetallesDeOrdenes = async (
  otIds,
  cliente = pool
) => {
  if (otIds.length === 0) {
    return new Map();
  }

  const result = await cliente.query(
    `SELECT d.id,
            d.orden_trabajo_id,
            d.programacion_equipo_id,
            e.tipo_equipo,
            e.nivel_mantenimiento AS nivel_programado,
            d.estado,
            d.nivel_completado,
            d.observaciones,
            d.enlace_video,
            d.evidencias,
            d.created_at,
            d.updated_at
       FROM ordenes_trabajo_detalle d
       JOIN programacion_mantenimiento_equipos e
         ON e.id = d.programacion_equipo_id
      WHERE d.orden_trabajo_id = ANY($1::int[])
      ORDER BY d.orden_trabajo_id ASC, e.tipo_equipo ASC`,
    [otIds]
  );

  const porOrden = new Map(
    otIds.map(id => [id, []])
  );

  for (const detalle of result.rows) {
    porOrden
      .get(detalle.orden_trabajo_id)
      .push(detalle);
  }

  return porOrden;
};

// =====================================================================================
// EVIDENCIA FOTOGRAFICA · F5.2 · ordenes_trabajo_evidencias (20261010_018)
// =====================================================================================
// NINGUN DELETE, igual que en el resto de este archivo: retirar una evidencia es un UPDATE
// a estado RETIRADA, y chk_ote_retiro exige en la base el autor, la fecha y el motivo.
//
// LA FAMILIA NO SE ALMACENA EN LA EVIDENCIA. Sale por JOIN a
// programacion_mantenimiento_equipos.tipo_equipo a traves del detalle, que es su unica
// fuente. Duplicarla seria poder contradecirla.
//
// EL ORDEN DE CERROJOS ES OBLIGATORIO Y ES EL MISMO QUE EL DEL CIERRE:
//   1. ordenes_trabajo          FOR UPDATE   <- obtenerOrdenParaEscritura, ya existente
//   2. ordenes_trabajo_detalle  FOR UPDATE   <- bloquearDetalleParaEvidencia
// Respetarlo es lo que serializa una carga contra un cierre concurrente en vez de
// provocar un abrazo mortal entre los dos.

// Las columnas de la evidencia, con los nombres resueltos por relacion maestra. El
// public_id NO se expone al cliente: lo usa el backend para firmar la URL y nada mas, asi
// que se lee aqui pero el presenter del service no lo publica.
const COLUMNAS_EVIDENCIA = `
  ev.id,
  ev.orden_trabajo_id,
  ev.detalle_id,
  ev.cloudinary_public_id,
  ev.formato,
  ev.bytes,
  ev.ancho,
  ev.alto,
  ev.estado,
  ev.subida_por_id,
  ev.retirada_por_id,
  ev.retirada_en,
  ev.motivo_retiro,
  ev.created_at,
  ev.updated_at,
  e.tipo_equipo,
  d.estado AS detalle_estado,
  (SELECT us.username FROM usuarios us WHERE us.id = ev.subida_por_id)
    AS subida_por_username,
  (SELECT pe.nombre_completo
     FROM usuarios us JOIN personal pe ON pe.id = us.persona_id
    WHERE us.id = ev.subida_por_id)
    AS subida_por_nombre`;

const DE_EVIDENCIA = `
  FROM ordenes_trabajo_evidencias ev
  JOIN ordenes_trabajo_detalle d ON d.id = ev.detalle_id
  JOIN programacion_mantenimiento_equipos e ON e.id = d.programacion_equipo_id`;

// Las columnas que las reglas de la evidencia necesitan del detalle. Identicas en la
// lectura de prevalidacion y en la que bloquea: la unica diferencia entre las dos es el
// FOR UPDATE, y compartir la lista evita que una vea un campo que la otra no.
const COLUMNAS_DETALLE_EVIDENCIA = `
       d.id,
       d.orden_trabajo_id,
       d.estado,
       d.observaciones,
       e.tipo_equipo,
       e.nivel_mantenimiento AS nivel_programado
  FROM ordenes_trabajo_detalle d
  JOIN programacion_mantenimiento_equipos e ON e.id = d.programacion_equipo_id`;

// LECTURA DE PREVALIDACION · SIN CERROJO Y SIN TRANSACCION.
// Sirve para rechazar lo que ya se sabe mal -detalle de otra orden, familia que no admite
// fotografia, apartado lleno- ANTES de subir nada a Cloudinary. Su resultado es
// orientativo por definicion: entre esta lectura y el INSERT puede cambiar todo, y por eso
// las mismas reglas se vuelven a comprobar con la fila bloqueada. Aqui solo se ahorra una
// subida inutil.
export const obtenerDetalleParaEvidencia = async (
  otId,
  detalleId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_DETALLE_EVIDENCIA}
     WHERE d.id = $2
       AND d.orden_trabajo_id = $1`,
    [otId, detalleId]
  );

  return result.rows[0] ?? null;
};

// PASO 2 DEL CERROJO. Bloquea la fila del DETALLE y trae su familia y su resultado, que es
// todo lo que las reglas necesitan. El WHERE comprueba la pertenencia a la orden: un
// detalle de otra OT simplemente no aparece, y el controller contesta 404 sin revelar que
// existe en otra parte.
//
// ESTA es la lectura que decide. La de prevalidacion de arriba no decide nada.
//
// FOR UPDATE OF d: solo la fila del detalle. El equipo previsto se une para leer la familia
// y nadie lo va a cambiar -R2 de 016 lo congela-, asi que bloquearlo seria contencion
// gratuita.
export const bloquearDetalleParaEvidencia = async (
  otId,
  detalleId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_DETALLE_EVIDENCIA}
     WHERE d.id = $2
       AND d.orden_trabajo_id = $1
     FOR UPDATE OF d`,
    [otId, detalleId]
  );

  return result.rows[0] ?? null;
};

// EL RECUENTO QUE DECIDE EL TOPE DE 4. Se ejecuta con la fila del detalle ya bloqueada, asi
// que dos cargas simultaneas del mismo apartado se serializan y la segunda ve el recuento
// real. Sin ese cerrojo las dos leerian 3 y entrarian las dos.
export const contarEvidenciasActivas = async (
  detalleId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT count(*)::int AS activas
     FROM ordenes_trabajo_evidencias
     WHERE detalle_id = $1
       AND estado = 'ACTIVA'`,
    [detalleId]
  );

  return result.rows[0].activas;
};

// El INSERT. No se menciona `estado`: nace ACTIVA por DEFAULT, y validar_evidencia_ot_abierta
// exige que sea asi. Tampoco created_at ni updated_at, que los pone la base.
export const insertarEvidencia = async (
  {
    ordenTrabajoId,
    detalleId,
    publicId,
    formato,
    bytes,
    ancho,
    alto,
    subidaPorId
  },
  cliente = pool
) => {
  const result = await cliente.query(
    `INSERT INTO ordenes_trabajo_evidencias
       (orden_trabajo_id, detalle_id, cloudinary_public_id,
        formato, bytes, ancho, alto, subida_por_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      ordenTrabajoId,
      detalleId,
      publicId,
      formato,
      bytes,
      ancho,
      alto,
      subidaPorId
    ]
  );

  return result.rows[0].id;
};

// La galeria de una orden: SOLO las activas. Una retirada no aparece, que es justo lo que
// el negocio pide, y su traza sigue en la fila para quien consulte la base.
//
// El orden es por apartado y luego por antiguedad: asi la UI puede agrupar sin reordenar.
export const obtenerEvidenciasActivasDeOrden = async (
  otId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_EVIDENCIA}
     ${DE_EVIDENCIA}
     WHERE ev.orden_trabajo_id = $1
       AND ev.estado = 'ACTIVA'
     ORDER BY e.tipo_equipo ASC, ev.created_at ASC, ev.id ASC`,
    [otId]
  );

  return result.rows;
};

// Una evidencia concreta DE ESA ORDEN. El filtro por orden_trabajo_id es la comprobacion de
// pertenencia: pedir la evidencia de otra OT devuelve null y el controller contesta 404.
// Sin FOR UPDATE: lo usa la lectura de la imagen, que no escribe.
export const obtenerEvidenciaDeOrden = async (
  otId,
  evidenciaId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_EVIDENCIA}
     ${DE_EVIDENCIA}
     WHERE ev.id = $2
       AND ev.orden_trabajo_id = $1`,
    [otId, evidenciaId]
  );

  return result.rows[0] ?? null;
};

// La misma lectura, con la fila de la evidencia bloqueada, para el retiro. FOR UPDATE OF ev:
// el detalle ya lo bloqueo bloquearDetalleParaEvidencia en el paso anterior.
export const obtenerEvidenciaParaRetiro = async (
  otId,
  evidenciaId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_EVIDENCIA}
     ${DE_EVIDENCIA}
     WHERE ev.id = $2
       AND ev.orden_trabajo_id = $1
     FOR UPDATE OF ev`,
    [otId, evidenciaId]
  );

  return result.rows[0] ?? null;
};

// EL RETIRO. Las cuatro columnas van juntas porque chk_ote_retiro exige exactamente esa
// combinacion; escribir solo el estado daria un 23514.
//
// La guarda estado = 'ACTIVA' en el propio WHERE hace que la escritura y su permiso sean la
// misma operacion: retirar dos veces no reescribe el motivo ni la fecha del primer retiro.
// Si no entra, rowCount es 0 y el controller lo traduce.
//
// NO se destruye el asset de Cloudinary: la trazabilidad manda sobre el almacenamiento, y
// una evidencia retirada tiene que poder demostrar que existio.
export const retirarEvidencia = async (
  evidenciaId,
  motivo,
  retiradaPorId,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE ordenes_trabajo_evidencias ev
     SET estado = 'RETIRADA',
         retirada_por_id = $3,
         retirada_en = CURRENT_TIMESTAMP,
         motivo_retiro = $2
     WHERE ev.id = $1
       AND ev.estado = 'ACTIVA'
     RETURNING ev.id`,
    [evidenciaId, motivo, retiradaPorId]
  );

  return result.rowCount > 0;
};

// LO QUE NECESITA LA VALIDACION DEL CIERRE, en UNA sola consulta: cada detalle con su
// familia, su resultado, sus observaciones y el recuento de evidencias ACTIVAS.
//
// La fuente de verdad del recuento es ordenes_trabajo_evidencias, no el cliente. La
// subconsulta correlacionada evita el GROUP BY y deja 0 cuando no hay ninguna, que es
// exactamente el caso que hay que detectar.
export const obtenerDetallesParaValidarCierre = async (
  otId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT d.id,
            d.estado,
            d.observaciones,
            d.enlace_video,
            e.tipo_equipo,
            e.nivel_mantenimiento AS nivel_programado,
            (SELECT count(*)::int
               FROM ordenes_trabajo_evidencias ev
              WHERE ev.detalle_id = d.id
                AND ev.estado = 'ACTIVA') AS evidencias_activas
     FROM ordenes_trabajo_detalle d
     JOIN programacion_mantenimiento_equipos e ON e.id = d.programacion_equipo_id
     WHERE d.orden_trabajo_id = $1
     ORDER BY e.tipo_equipo ASC, d.id ASC`,
    [otId]
  );

  return result.rows;
};
