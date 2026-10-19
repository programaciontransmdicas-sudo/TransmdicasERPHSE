import { pool } from '../../../config/database.js';

import {
  ESTADO_CANCELADO,
  ESTADO_REPROGRAMADO,
  ESTADO_PROGRAMADO,
  ESTADOS_REPROGRAMABLES,
  ESTADOS_CANCELABLES,
  ESTADOS_PROGRAMABLES,
  TIPO_NOTA
} from './service.js';

// ==========================================
// PROGRAMACION DE MANTENIMIENTO (TI-PR-01)
// SQL contra el modelo 013-016. Parametrizado, columnas explícitas.
// ==========================================
//
// LAS COLUMNAS QUE RETIRABA EL 20261001_900 YA NO EXISTEN: fecha_programada,
// fecha_reprogramada y nivel_mantenimiento de la cabecera. Medido el 2026-10-09 en
// db-refactor contra information_schema.columns: programacion_mantenimiento tiene 12
// columnas y ninguna de las tres está entre ellas, así que el cleanup está aplicado aunque
// el fichero siga en migrations/pending_cleanup/. Este archivo nunca las expuso ni las
// escribió, de modo que el contrato de la API no cambió al desaparecer.
//
// El nivel real de cada equipo vive en programacion_mantenimiento_equipos.
//
// quincena_efectiva es GENERATED ALWAYS, así que nunca aparece en un INSERT ni en un SET:
// se lee y se deja que la calcule la base.
//
// NO HAY NINGUN INSERT NI DELETE EN ESTE ARCHIVO. Crear programación es trabajo del
// generador; borrarla no es una operación del negocio -la base la aceptaría, y
// programacion_mantenimiento_equipos tiene ON DELETE CASCADE, así que un DELETE se
// llevaría en silencio la evidencia del alcance materializado-.
//
// Cada función acepta un cliente opcional para poder ejecutarse dentro de una transacción
// de prueba con ROLLBACK.

// Fechas como texto: date -> Date de JavaScript desplaza la zona horaria.
const COLUMNAS = `
  p.id,
  p.programa_id,
  p.programa_unidad_id,
  u.placa,
  (SELECT v.operacion FROM vehiculos v WHERE v.placa = u.placa) AS operacion,
  p.estado,
  p.quincena_programada::text   AS quincena_programada,
  p.quincena_reprogramada::text AS quincena_reprogramada,
  p.quincena_efectiva::text     AS quincena_efectiva,
  p.fecha_ejecucion::text       AS fecha_ejecucion,
  p.version_programa_id,
  p.observaciones,
  p.nivel_regular_forzado,
  p.planificacion_ajustada,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', a.id, 'tipo', a.tipo, 'origen', a.quincena_anterior::text,
    'destino', a.quincena_destino::text, 'motivo', a.motivo, 'fecha', a.fecha
  ) ORDER BY a.id) FROM programacion_mantenimiento_ajustes a WHERE a.programacion_id=p.id), '[]'::jsonb) AS ajustes,
  p.created_at,
  p.updated_at`;

// Existencia de OT, no su contenido: es lo único que hace falta para saber si una
// operación está bloqueada. Abrir, detallar y cerrar OT es otra etapa.
const OT = `
  (SELECT count(*)::int FROM ordenes_trabajo o
    WHERE o.programacion_id = p.id) AS ot_total,
  (SELECT count(*)::int FROM ordenes_trabajo o
    WHERE o.programacion_id = p.id AND o.estado = 'ABIERTA') AS ot_abiertas,
  (SELECT count(*)::int FROM ordenes_trabajo o
    WHERE o.programacion_id = p.id AND o.estado = 'CERRADA') AS ot_cerradas,
  (SELECT count(*)::int FROM ordenes_trabajo o
    WHERE o.programacion_id = p.id AND o.estado = 'ANULADA') AS ot_anuladas,
  (SELECT count(*)::int FROM ordenes_trabajo o
    WHERE o.programacion_id = p.id AND o.estado <> 'ANULADA') AS ot_no_anuladas`;

const COLUMNAS_EQUIPO = `
  e.id,
  e.programacion_id,
  e.tipo_equipo,
  e.nivel_mantenimiento,
  e.created_at,
  e.updated_at`;

// Una sola consulta, con la unidad por JOIN y los conteos de OT por subconsulta
// correlacionada. El orden usa quincena_efectiva, que es la columna del índice parcial.
export const obtenerProgramacion = async (
  programaId,
  {
    estado = null,
    placa = null,
    quincena_efectiva = null,
    desde = null,
    hasta = null,
    limite = 500,
    desplazamiento = 0
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${OT}
     FROM programacion_mantenimiento p
     JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.programa_id = $1
       AND ($2::text IS NULL OR p.estado = $2)
       AND ($3::text IS NULL OR u.placa = $3)
       AND ($4::date IS NULL OR p.quincena_efectiva = $4::date)
       AND ($5::date IS NULL OR p.quincena_efectiva >= $5::date)
       AND ($6::date IS NULL OR p.quincena_efectiva <= $6::date)
     ORDER BY p.quincena_efectiva ASC, u.placa ASC, p.id ASC
     LIMIT $7 OFFSET $8`,
    [
      programaId,
      estado,
      placa,
      quincena_efectiva,
      desde,
      hasta,
      limite,
      desplazamiento
    ]
  );

  return result.rows;
};

export const contarProgramacion = async (
  programaId,
  {
    estado = null,
    placa = null,
    quincena_efectiva = null,
    desde = null,
    hasta = null
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT count(*)::int AS total
     FROM programacion_mantenimiento p
     JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.programa_id = $1
       AND ($2::text IS NULL OR p.estado = $2)
       AND ($3::text IS NULL OR u.placa = $3)
       AND ($4::date IS NULL OR p.quincena_efectiva = $4::date)
       AND ($5::date IS NULL OR p.quincena_efectiva >= $5::date)
       AND ($6::date IS NULL OR p.quincena_efectiva <= $6::date)`,
    [
      programaId,
      estado,
      placa,
      quincena_efectiva,
      desde,
      hasta
    ]
  );

  return result.rows[0].total;
};

export const obtenerVisitaPorId = async (
  programaId,
  id,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${OT}
     FROM programacion_mantenimiento p
     JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.programa_id = $1
       AND p.id = $2`,
    [programaId, id]
  );

  return result.rows[0] ?? null;
};

// SIN N+1: los equipos de TODAS las visitas del listado en una sola consulta, agrupados en
// memoria. programacion_mantenimiento_equipos es la evidencia de qué quedó materializado:
// se devuelve tal cual, nunca recalculado con la frecuencia vigente.
export const obtenerEquiposDeVisitas = async (
  programacionIds,
  cliente = pool
) => {
  if (programacionIds.length === 0) {
    return new Map();
  }

  const result = await cliente.query(
    `SELECT ${COLUMNAS_EQUIPO}
     FROM programacion_mantenimiento_equipos e
     WHERE e.programacion_id = ANY($1::int[])
     ORDER BY e.programacion_id ASC, e.tipo_equipo ASC`,
    [programacionIds]
  );

  const porVisita = new Map(
    programacionIds.map(id => [id, []])
  );

  for (const equipo of result.rows) {
    porVisita
      .get(equipo.programacion_id)
      .push(equipo);
  }

  return porVisita;
};

// =====================================================================================
// OCUPACION DE QUINCENAS DE UNA UNIDAD · F4.2
// =====================================================================================
// Lo que el indice uq_programacion_unidad_quincena_efectiva ve, leido explicitamente para
// poder explicarlo antes de chocar con el.
//
// EL FILTRO ES SOLO programa_unidad_id, deliberadamente SIN programa_id: la clave del
// indice es (programa_unidad_id, quincena_efectiva) y su predicado es estado <> 'CANCELADO',
// nada mas. Si aqui se anadiera programa_id el catalogo veria menos filas que el indice y
// podria declarar libre una quincena que la base rechazaria. Que una unidad pertenezca a un
// solo programa lo garantiza la FK compuesta, asi que el filtro no anade nada y solo podria
// quitar.
//
// Se excluye la PROPIA visita: su quincena no esta "ocupada por otra", y la descarta la
// regla de la quincena actual, que explica mejor por que no sirve.
//
// Devuelve la fila de la ocupante -id, placa, estado-, no un booleano: el motivo del rechazo
// nombra a quien ocupa el sitio para que el operador sepa a que visita ir.
export const obtenerQuincenasOcupadasDeUnidad = async (
  programaUnidadId,
  excluirVisitaId,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT p.id,
            p.estado,
            p.quincena_efectiva::text AS quincena_efectiva,
            u.placa
     FROM programacion_mantenimiento p
     JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.programa_unidad_id = $1
       AND p.id <> $2
       AND p.estado <> $3
     ORDER BY p.quincena_efectiva ASC, p.id ASC`,
    [
      programaUnidadId,
      excluirVisitaId,
      ESTADO_CANCELADO
    ]
  );

  return result.rows;
};

// =====================================================================================
// LA NOTA ADMINISTRATIVA · F4.3
// =====================================================================================
// Una sola definicion del formato, usada por reprogramar y por cancelar. Se APILA sobre lo
// que ya hubiera en observaciones -la nota de proyeccion del generador, y las anotaciones
// anteriores-, separando con una linea en blanco. NUNCA sustituye.
//
// POR QUE EN SQL Y NO EN JS, las tres razones:
//
//   1. ATOMICIDAD. Va en el MISMO UPDATE que el estado y la quincena. Si se construyera en
//      JS habria que leer observaciones, concatenar y escribir: tres pasos con una ventana
//      en medio en la que otra transaccion podria anotar y perder su nota.
//   2. EL RELOJ. to_char(now() AT TIME ZONE 'America/Lima') es la MISMA fuente temporal que
//      la API publica como fecha_negocio. El reloj del proceso Node no se usa para nada.
//   3. NULLIF. Una observacion vacia no debe generar un separador huerfano al principio.
//
// El tipo de accion viaja parametrizado, no interpolado: los tres valores son parametros
// -$tipo, $autor, $motivo- y el unico texto literal es el andamiaje del formato.
const notaAdministrativa = (
  tipo,
  autor,
  motivo
) => `COALESCE(NULLIF(p.observaciones, '') || E'\\n\\n', '')
         || '[' || to_char(now() AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI')
         || ' · ' || ${tipo}
         || ' · autor ' || COALESCE(${autor}::text, 'sin identificar')
         || '] ' || ${motivo}`;

// El estado permitido va en el propio WHERE, no solo en el service: así la puerta es
// atómica con la escritura y no hay ventana entre comprobar y escribir. Si no entra,
// rowCount es 0 y el controller vuelve a leer para decir por qué.
//
// Se escriben TRES columnas: quincena_reprogramada, estado y la anotación administrativa de
// observaciones. quincena_programada no se menciona -la congela R3- y quincena_efectiva es
// GENERATED ALWAYS, así que se mueve sola.
export const reprogramarVisita = async (
  programaId,
  id,
  quincenaReprogramada,
  motivo,
  autor,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE programacion_mantenimiento p
     SET quincena_reprogramada = $3::date,
         estado = $4,
         observaciones = ${notaAdministrativa('$6', '$7', '$8')}
     WHERE p.programa_id = $1
       AND p.id = $2
       AND p.estado = ANY($5::text[])
     RETURNING p.id`,
    [
      programaId,
      id,
      quincenaReprogramada,
      ESTADO_REPROGRAMADO,
      ESTADOS_REPROGRAMABLES,
      TIPO_NOTA.REPROGRAMACION,
      autor,
      motivo
    ]
  );

  return result.rowCount > 0;
};

// Promocion. Igual que cancelar: una sola columna, estado, y la puerta de estado dentro
// del mismo WHERE. No crea nada -ni fila, ni equipos, ni OT- y no toca ninguna quincena: la
// obligacion es la misma, solo pasa a estar confirmada.
//
// ESTADOS_PROGRAMABLES es solo ['PROYECTADO'], asi que un PROGRAMADO que llegue hasta aqui
// devolveria rowCount 0. No llega: el controller resuelve ese caso antes, para no mover
// updated_at en una operacion idempotente.
export const programarVisita = async (
  programaId,
  id,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE programacion_mantenimiento p
     SET estado = $3
     WHERE p.programa_id = $1
       AND p.id = $2
       AND p.estado = ANY($4::text[])
     RETURNING p.id`,
    [
      programaId,
      id,
      ESTADO_PROGRAMADO,
      ESTADOS_PROGRAMABLES
    ]
  );

  return result.rowCount > 0;
};

// No borra la fila ni sus equipos previstos. El índice parcial excluye CANCELADO, así que
// esto libera el slot de la quincena y habilita una sustituta.
//
// F4.3: escribe TAMBIEN la anotación administrativa. Cancelar es la única operación que
// devuelve la obligación al generador -cargarMaterializadas excluye CANCELADO-, así que es
// la que más necesita constancia de por qué se hizo.
export const cancelarVisita = async (
  programaId,
  id,
  motivo,
  autor,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE programacion_mantenimiento p
     SET estado = $3,
         observaciones = ${notaAdministrativa('$5', '$6', '$7')}
     WHERE p.programa_id = $1
       AND p.id = $2
       AND p.estado = ANY($4::text[])
     RETURNING p.id`,
    [
      programaId,
      id,
      ESTADO_CANCELADO,
      ESTADOS_CANCELABLES,
      TIPO_NOTA.CANCELACION,
      autor,
      motivo
    ]
  );

  return result.rowCount > 0;
};

// =====================================================================================
// PROGRAMACION POR LOTE · F4.1
// =====================================================================================

// EL CERROJO DEL LOTE. Lee las visitas pedidas y BLOQUEA su fila hasta el final de la
// transaccion, para que su estado no cambie entre el momento en que se decide y el UPDATE.
//
// FOR UPDATE OF p: solo la fila de la VISITA. La unidad se une para traer la placa y nadie
// la va a cambiar aqui, asi que bloquearla ademas seria contencion gratuita.
//
// ORDER BY p.id es parte del contrato, no estetica: dos lotes concurrentes que se solapen
// toman los cerrojos en el MISMO orden, y por tanto uno espera al otro en vez de que ambos
// se queden esperando el cerrojo que tiene el contrario. El service ya devuelve los ids
// ordenados para que las dos mitades coincidan.
//
// Las subconsultas de OT van en el SELECT: se evaluan con la fila ya bloqueada, asi que el
// recuento que ve bloqueos() es el mismo que valdra al escribir.
export const obtenerVisitasParaLote = async (
  programaId,
  ids,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS},
            ${OT}
     FROM programacion_mantenimiento p
     JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.programa_id = $1
       AND p.id = ANY($2::int[])
     ORDER BY p.id
     FOR UPDATE OF p`,
    [programaId, ids]
  );

  return result.rows;
};

// UNA sola sentencia para todo el lote. La guarda del WHERE es la misma que la del UPDATE
// individual -programa_id, id y estado = ANY(ESTADOS_PROGRAMABLES)-, asi que la base vuelve
// a decidir aunque el service ya haya decidido: si una fila dejo de ser programable, no
// entra, y el controller lo detecta comparando el recuento.
//
// NO escribe quincena_programada, quincena_reprogramada ni fecha_ejecucion. quincena_efectiva
// es GENERATED ALWAYS y no se puede escribir ni queriendo. Programar solo confirma el estado.
export const programarVisitasEnLote = async (
  programaId,
  ids,
  cliente = pool
) => {
  const result = await cliente.query(
    `UPDATE programacion_mantenimiento p
     SET estado = $3
     WHERE p.programa_id = $1
       AND p.id = ANY($2::int[])
       AND p.estado = ANY($4::text[])
     RETURNING p.id`,
    [
      programaId,
      ids,
      ESTADO_PROGRAMADO,
      ESTADOS_PROGRAMABLES
    ]
  );

  return result.rows.map(r => r.id);
};
