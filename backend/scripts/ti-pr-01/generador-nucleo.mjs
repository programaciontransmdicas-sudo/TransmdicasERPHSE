import { crearReloj } from '../../src/modules/programas/programacion/ajustes/planificador.js';

// =====================================================================================
// TI-PR-01 · NUCLEO DEL GENERADOR DE PROGRAMACION
// =====================================================================================
// Implementa el algoritmo de GENERADOR.md. No escribe nada por su cuenta, no abre
// transacciones y no imprime: recibe un cliente de pg para LEER los insumos y devuelve la
// proyeccion como datos. La unica funcion que escribe es materializar(), y solo inserta.
//
// Lo importan DOS consumidores, a proposito:
//   generar-programacion.mjs   el runner: reporta y, con autorizacion, materializa
//   probar-generador.mjs       el banco de casos sobre fixtures en BEGIN ... ROLLBACK
//
// Un solo algoritmo para los dos. Si las pruebas reimplementaran la regla podrian pasar
// mientras el generador real divergiera.
//
// -------------------------------------------------------------------------------------
// LAS DOS ESTRUCTURAS QUE NO SE MEZCLAN
// -------------------------------------------------------------------------------------
// Responden preguntas distintas y por eso tienen grano y clave distintos.
//
//   materializadas   ¿esta obligacion historica ya tiene una fila que la representa?
//                    grano (unidad, familia, nivel, QUINCENA_PROGRAMADA)
//                    la identidad es quincena_programada porque ahi NACIO la obligacion.
//                    Una reprogramacion mueve la visita, no la obligacion: si se mirara
//                    quincena_efectiva, reprogramar octubre a noviembre haria reaparecer
//                    la obligacion de octubre y se duplicaria.
//
//   slots            ¿donde esta AHORA cada visita, y que ocupa ese destino?
//                    grano (unidad, QUINCENA_EFECTIVA)
//                    sirve para detectar que una visita nueva no cabe, nunca para decidir
//                    si una obligacion ya fue cubierta.
//
// Las dos excluyen estado = 'CANCELADO': una programacion cancelada es historia y no
// representa nada, asi que su obligacion vuelve a ser elegible y su slot queda libre. La
// fila cancelada permanece, y la sustituta es una fila NUEVA: nunca se recicla la vieja.
// =====================================================================================

export const CODIGO = 'TI-PR-01';
export const CUTOVER = '2026-10-01';
// 017 · DVR SALIO de las regulares. Decision de negocio del 2026-10-07: el DVR forma parte
// del sistema de CAMARAS y no se programa por separado. No era una familia con fase propia
// -su ciclo M1 se sembro con la evidencia de la columna de camaras del Excel, porque la
// hoja Inspecciones no tiene columna de DVR-, asi que su serie era una copia de la de
// CAMARAS y retirarla no mueve ninguna visita ni ningun nivel: medido sobre 886 visitas
// reales, el md5 de los niveles regulares es identico antes y despues.
// La migracion 20261007_017 retira su frecuencia, que es lo que la base usa como dominio.
export const REGULARES = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
export const ANUALES = ['GPS', 'ADAS'];
export const ORDEN = { M1: 1, M2: 2, M3: 3 };
// 20260922_003 apartado 7: 'PROYECTADO' es la proyeccion automatica; 'PROGRAMADO' es la
// visita ya confirmada con la operacion. Promover es un UPDATE, no un INSERT.
// La 015 (regla I) ya lo hace obligatorio: una visita solo NACE en PROYECTADO o PROGRAMADO.
export const ESTADO_INICIAL = 'PROYECTADO';
// composicion de cada familia regular a partir de los tipos FISICOS del inventario.
// Verificado contra chk_vehiculo_equipo_tipo: el dominio real es exactamente este.
// 017 · DVR_INTERNO y DVR_EXTERNO siguen existiendo en vehiculo_equipos como inventario
// fisico, con su marca, su serie y su fecha de instalacion. Lo que ya no existe es una
// familia DVR a la que proyectarlos: su mantenimiento esta contenido en CAMARAS.
export const FISICOS = {
  CAMARAS: ['CAMARA_INTERNA', 'CAMARA_EXTERNA'],
  COPILOTO: ['COPILOTO'],
  RADIO_BASE: ['RADIO_BASE'],
};
// Motivos de colision. Cerrados a proposito: si un caso no encaja se informa OTRO con la
// evidencia cruda, en vez de inventar una clasificacion que nadie acordo.
export const MOTIVOS_COLISION = ['REPROGRAMADA_OCUPA_DESTINO', 'ESCALADA_DE_NIVEL',
  'ANUAL_NO_REPRESENTADA', 'REGULAR_NO_REPRESENTADA', 'OTRO'];

// =====================================================================================
// CODIGO DE SALIDA · una colision de negocio NO es un error tecnico
// =====================================================================================
//   0   corrida completa: todas las visitas formadas eran seguras
//   3   las seguras se materializaron, pero quedan colisiones que exigen decision humana
//   2   error tecnico o precondicion incumplida: la operacion revierte
// Vive aqui, y no suelto en el runner, para que el banco pueda probar las tres ramas con la
// MISMA funcion que decide en produccion.
export function codigoDeSalida({ fallas = 0, colisiones = 0 } = {}) {
  if (fallas > 0) return 2;
  if (colisiones > 0) return 3;
  return 0;
}

// --- aritmetica de quincenas: indice continuo, 24 por anio, dias de ancla 1 y 16 ---------
export const idx = iso => {
  const [Y, M, D] = iso.split('-').map(Number);
  return Y * 24 + (M - 1) * 2 + (D >= 16 ? 1 : 0);
};
export const quin = i => {
  const Y = Math.floor(i / 24), r = ((i % 24) + 24) % 24;
  return `${Y}-${String(Math.floor(r / 2) + 1).padStart(2, '0')}-${r % 2 === 0 ? '01' : '16'}`;
};
export const aISO = v => v === null || v === undefined ? null
  : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

// =====================================================================================
// COBERTURA ACUMULATIVA · que niveles deja cubiertos un detalle ya programado
// =====================================================================================
// La misma tabla que GENERADOR.md usa para la propagacion al cerrar la OT, porque es la
// misma afirmacion: intervenir M2 cubre tambien el alcance M1. GPS y ADAS NO acumulan:
// chk_ciclo_anual_solo_m3 impide fisicamente un GPS/M1, y programar un GPS no dice nada
// del mantenimiento regular de la unidad.
export const CUBRE = (familia, nivel) => ANUALES.includes(familia)
  ? [nivel]
  : nivel === 'M1' ? ['M1']
    : nivel === 'M2' ? ['M2', 'M1']
      : ['M3', 'M2', 'M1'];

// =====================================================================================
// INSUMOS
// =====================================================================================
export async function cargarInsumos(cliente, programaId) {
  // referencia de fase por (unidad, familia, nivel). El CICLO REAL siempre tiene
  // precedencia sobre el ancla; sin ninguno de los dos no hay serie de la que derivar.
  const { rows: refs } = await cliente.query(`
    SELECT u.id AS unidad, u.placa, u.programa_id, f.tipo_equipo AS familia,
           f.nivel_mantenimiento AS nivel, f.frecuencia_quincenas AS frec,
           COALESCE(c.ultima_quincena, x.quincena_ancla) AS q_ref,
           CASE WHEN c.ultima_quincena IS NOT NULL THEN 'CICLO_REAL' ELSE 'ANCLA' END AS fase
    FROM programa_mantenimiento_unidades u
    JOIN programa_mantenimiento_frecuencias f ON f.programa_id = u.programa_id
    LEFT JOIN programa_mantenimiento_unidad_ciclos c
      ON c.programa_unidad_id = u.id AND c.tipo_equipo = f.tipo_equipo
     AND c.nivel_mantenimiento = f.nivel_mantenimiento
    LEFT JOIN programa_mantenimiento_unidad_anclas x
      ON x.programa_unidad_id = u.id AND x.tipo_equipo = f.tipo_equipo
     AND x.nivel_mantenimiento = f.nivel_mantenimiento
    WHERE u.programa_id = $1 AND COALESCE(c.ultima_quincena, x.quincena_ancla) IS NOT NULL`,
    [programaId]);

  // aplicabilidad: proyeccion de los TRES estados reales de vehiculo_equipos. El dominio
  // es exactamente {INSTALADO, NO_APLICA, POR_VALIDAR}; 'SIN_FILA' se reserva para la
  // ausencia de fila, que no es ninguno de los tres y nunca se convierte en si ni en no.
  const APLICA = new Map();
  const { rows: apl } = await cliente.query(`
    SELECT u.id AS unidad, fam.familia,
      CASE WHEN count(e.id) = 0                          THEN 'SIN_FILA'
           WHEN bool_or(e.estado_inventario='INSTALADO')  THEN 'APLICA'
           WHEN bool_and(e.estado_inventario='NO_APLICA') THEN 'NO_APLICA'
           ELSE 'PENDIENTE' END AS estado
    FROM programa_mantenimiento_unidades u
    CROSS JOIN (VALUES ('CAMARAS', $2::text[]),
                       ('COPILOTO', $3::text[]), ('RADIO_BASE', $4::text[])) AS fam(familia, fisicos)
    LEFT JOIN vehiculo_equipos e ON e.placa = u.placa AND e.tipo_equipo = ANY(fam.fisicos)
    WHERE u.programa_id = $1 GROUP BY u.id, fam.familia`,
    [programaId, FISICOS.CAMARAS, FISICOS.COPILOTO, FISICOS.RADIO_BASE]);
  for (const r of apl) APLICA.set(`${r.unidad}|${r.familia}`, r.estado);

  // anuales: una sola fila fisica por familia. ADAS exige la regla POSITIVA de proveedor
  // -INSTALADO y marca ILIKE '%TRACKLOG%'-, nunca por exclusion de otros proveedores y
  // nunca con el criterio "no es MIX".
  for (const u of new Set(apl.map(r => r.unidad)))
    for (const f of ANUALES) APLICA.set(`${u}|${f}`, 'SIN_FILA');
  const { rows: anu } = await cliente.query(`
    SELECT u.id AS unidad, e.tipo_equipo AS familia, e.estado_inventario AS est, e.marca
    FROM programa_mantenimiento_unidades u
    JOIN vehiculo_equipos e ON e.placa = u.placa AND e.tipo_equipo = ANY($2)
    WHERE u.programa_id = $1`, [programaId, ANUALES]);
  for (const r of anu) {
    const instalado = r.est === 'INSTALADO';
    const proveedor = r.familia === 'GPS' || /TRACKLOG/i.test(r.marca || '');
    APLICA.set(`${r.unidad}|${r.familia}`,
      instalado && proveedor ? 'APLICA'
        : r.est === 'NO_APLICA' ? 'NO_APLICA'
          : instalado ? 'OTRO_PROVEEDOR'  // INSTALADO pero fuera del alcance del programa
            : 'PENDIENTE');              // POR_VALIDAR
  }

  const { rows: todasU } = await cliente.query(
    `SELECT id, placa, programa_id FROM programa_mantenimiento_unidades
     WHERE programa_id=$1 ORDER BY placa`, [programaId]);
  const { rows: fr } = await cliente.query(
    `SELECT tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
     FROM programa_mantenimiento_frecuencias WHERE programa_id=$1`, [programaId]);
  const { rows: vers } = await cliente.query(
    `SELECT id, version, vigencia_desde, vigencia_hasta
     FROM programas_mantenimiento_versiones WHERE programa_id=$1`, [programaId]);

  const { materializadas, sinQuincenaProgramada } = await cargarMaterializadas(cliente, programaId);
  const slots = await cargarSlots(cliente, programaId);

  const { rows: ajustadas } = await cliente.query(`SELECT programa_unidad_id, max(id)::int AS revision
    FROM programacion_mantenimiento_ajustes WHERE programa_id=$1 GROUP BY programa_unidad_id`, [programaId]);
  const { rows: fecha } = await cliente.query(`SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS fecha_negocio`);

  return {
    programaId, refs, frecuencias: fr,
    ajustadas: new Set(ajustadas.map(r => r.programa_unidad_id)),
    revisionAjustes: new Map(ajustadas.map(r => [r.programa_unidad_id, r.revision])), fechaNegocio: fecha[0].fecha_negocio,
    APLICA,
    uni: new Map(todasU.map(r => [r.id, r])),
    conFase: new Set(refs.map(r => `${r.unidad}|${r.familia}`)),
    // guarda de fk_programacion_equipo_frecuencia: (programa, familia, nivel) debe existir
    frecOk: new Set(fr.map(r => `${r.tipo_equipo}|${r.nivel_mantenimiento}`)),
    vers,
    materializadas, slots, sinQuincenaProgramada,
  };
}

// =====================================================================================
// MATERIALIZADAS · que obligacion historica ya esta representada por una fila
// =====================================================================================
// Clave (unidad, familia, nivel, quincena_programada). Se expande la acumulacion, asi que
// un detalle CAMARAS/M2 programado en la quincena Q marca cubiertas CAMARAS/M2@Q y
// CAMARAS/M1@Q, y un GPS/M3@Q marca SOLO GPS/M3@Q.
//
// Una fila sin quincena_programada no puede decir donde nacio su obligacion, asi que NO se
// usa para cubrir nada y se devuelve aparte para que el runner la reporte. El generador
// escribe siempre esa columna; una fila sin ella solo puede venir de fuera.
export async function cargarMaterializadas(cliente, programaId) {
  const { rows } = await cliente.query(`
    SELECT p.programa_unidad_id AS unidad, p.id AS programacion_id, p.estado,
           p.quincena_programada::text AS q_programada,
           p.quincena_efectiva::text AS q_efectiva,
           e.tipo_equipo AS familia, e.nivel_mantenimiento AS nivel
    FROM programacion_mantenimiento p
    JOIN programacion_mantenimiento_equipos e ON e.programacion_id = p.id
    WHERE p.programa_unidad_id IN (SELECT id FROM programa_mantenimiento_unidades
                                    WHERE programa_id = $1)
      AND p.estado <> 'CANCELADO'`, [programaId]);
  const materializadas = new Map();
  const sinQuincenaProgramada = [];
  for (const r of rows) {
    if (r.q_programada === null) {
      sinQuincenaProgramada.push(r);
      continue;
    }
    for (const n of CUBRE(r.familia, r.nivel)) {
      const k = `${r.unidad}|${r.familia}|${n}|${r.q_programada}`;
      // si dos filas cubrieran la misma clave gana la que la cubre con el nivel mas alto,
      // que es la que mas afirma; da igual para el filtro, importa para el reporte.
      const p = materializadas.get(k);
      if (!p || ORDEN[r.nivel] > ORDEN[p.por_nivel])
        materializadas.set(k, {
          programacion_id: r.programacion_id, estado: r.estado,
          por_nivel: r.nivel, q_efectiva: r.q_efectiva,
        });
    }
  }
  return { materializadas, sinQuincenaProgramada };
}

// =====================================================================================
// SLOTS · donde esta ahora cada visita y que ocupa ese destino
// =====================================================================================
// Clave (unidad, quincena_efectiva), solo programaciones no CANCELADAS. Lleva lo que hace
// falta para DIAGNOSTICAR una colision sin volver a la base.
export async function cargarSlots(cliente, programaId) {
  const { rows } = await cliente.query(`
    SELECT p.id AS programacion_id, p.programa_unidad_id AS unidad, p.estado,
           p.quincena_programada::text  AS q_programada,
           p.quincena_reprogramada::text AS q_reprogramada,
           p.quincena_efectiva::text    AS q_efectiva,
           p.fecha_ejecucion::text      AS fecha_ejecucion,
           (SELECT count(*)::int FROM ordenes_trabajo o
             WHERE o.programacion_id = p.id AND o.estado = 'ABIERTA') AS ot_abiertas,
           (SELECT count(*)::int FROM ordenes_trabajo o
             WHERE o.programacion_id = p.id AND o.estado = 'CERRADA') AS ot_cerradas,
           (SELECT count(*)::int FROM ordenes_trabajo o
             WHERE o.programacion_id = p.id AND o.estado = 'ANULADA') AS ot_anuladas,
           (SELECT array_agg(o.estado::text ORDER BY o.id) FROM ordenes_trabajo o
             WHERE o.programacion_id = p.id) AS ot_estados,
           (SELECT array_agg(e.tipo_equipo || '/' || e.nivel_mantenimiento
                             ORDER BY e.tipo_equipo)
             FROM programacion_mantenimiento_equipos e
             WHERE e.programacion_id = p.id) AS contenido
    FROM programacion_mantenimiento p
    WHERE p.programa_unidad_id IN (SELECT id FROM programa_mantenimiento_unidades
                                    WHERE programa_id = $1)
      AND p.estado <> 'CANCELADO'`, [programaId]);
  const slots = new Map();
  for (const r of rows) {
    const contenido = r.contenido || [];
    slots.set(`${r.unidad}|${r.q_efectiva}`, {
      programacion_id: r.programacion_id,
      unidad: r.unidad,
      estado: r.estado,
      q_programada: r.q_programada,
      q_reprogramada: r.q_reprogramada,
      q_efectiva: r.q_efectiva,
      fecha_ejecucion: r.fecha_ejecucion,
      ot_abiertas: r.ot_abiertas, ot_cerradas: r.ot_cerradas, ot_anuladas: r.ot_anuladas,
      ot_estados: r.ot_estados || [],
      contenido,
      // familia -> nivel ya previsto en esa visita
      nivelDe: new Map(contenido.map(x => {
        const i = x.lastIndexOf('/');
        return [x.slice(0, i), x.slice(i + 1)];
      })),
    });
  }
  return slots;
}

// 20260922_003 apartado 6, literal: "la version aplicada es la vigente para la QUINCENA
// EFECTIVA de la programacion, no la vigente el dia en que se creo el registro". Intervalo
// semiabierto. Si no hay exactamente una, devuelve null: la columna es nullable a proposito.
export function versionDe(vers, q) {
  const v = vers.filter(x => aISO(x.vigencia_desde) <= q
    && (x.vigencia_hasta === null || aISO(x.vigencia_hasta) > q));
  return v.length === 1 ? v[0] : null;
}

// Las unidades ajustadas continúan desde su plan vigente, sin reconstruir la cadencia
// anterior ni rellenar el origen que se dejó señalado como Reprogramado. Este reloj es
// exclusivamente de proyección: los ciclos reales y las anclas nunca se escriben aquí.
export function continuarAjustadas(ins, desde, hasta) {
  const obligaciones = [];
  for (const unidad of ins.ajustadas ?? []) {
    const referencias = ins.refs.filter(r => r.unidad === unidad).map(r => ({
      tipo_equipo: r.familia, nivel_mantenimiento: r.nivel, quincena: aISO(r.q_ref)
    }));
    const reloj = crearReloj(referencias, ins.frecuencias ?? []);
    const existentes = [...ins.slots.values()].filter(v => v.unidad === unidad)
      .sort((a,b) => a.q_efectiva.localeCompare(b.q_efectiva));
    const hoy = idx(ins.fechaNegocio ?? desde);
    for (const visita of existentes) {
      if (!['PROYECTADO','PROGRAMADO','REPROGRAMADO'].includes(visita.estado) || idx(visita.q_efectiva) < hoy) continue;
      for (const [familia, nivel] of visita.nivelDe) reloj.cubrir(familia, nivel, idx(visita.q_efectiva));
    }
    const ultima = existentes.length ? idx(existentes.at(-1).q_efectiva) : hoy - 1;
    const regulares = REGULARES.filter(f => ins.APLICA.get(`${unidad}|${f}`) === 'APLICA');
    for (let i = Math.max(idx(desde), hoy, ultima + 1); i <= idx(hasta); i++) {
      const nivel = reloj.debido(regulares, i);
      if (nivel) for (const familia of regulares) {
        reloj.validar(familia, nivel);
        obligaciones.push({ unidad, familia, nivel, i, fase: 'PLAN_AJUSTADO' });
        reloj.cubrir(familia, nivel, i);
      }
      for (const familia of ANUALES) {
        if (ins.APLICA.get(`${unidad}|${familia}`) !== 'APLICA' || !reloj.debido([familia], i)) continue;
        reloj.validar(familia, 'M3');
        obligaciones.push({ unidad, familia, nivel: 'M3', i, fase: 'PLAN_AJUSTADO' });
        reloj.cubrir(familia, 'M3', i);
      }
      if (obligaciones.some(o => o.unidad === unidad && o.i === i) && !versionDe(ins.vers, quin(i))) {
        throw new Error(`No existe una versión aplicable para extender la unidad ${ins.uni.get(unidad)?.placa} a ${quin(i)}.`);
      }
    }
  }
  return obligaciones;
}

// =====================================================================================
// EL ALGORITMO
// =====================================================================================
export function generar(ins, desde, hasta) {
  const iIni = idx(desde), iFin = idx(hasta);
  const materializadas = ins.materializadas ?? new Map();
  const slots = ins.slots ?? new Map();

  // PASO 1 · obligacion bruta, grano (unidad, familia, nivel): referencia + k x frecuencia,
  // k >= 1. Se itera la SERIE COMPLETA, no solo "la proxima". El horizonte es un filtro de
  // materializacion: lo anterior es BACKLOG CALCULADO y no se materializa.
  // Este paso NO mira materializacion: es pura cadencia.
  const bruto = [], backlog = [];
  for (const r of ins.refs) {
    if (ins.ajustadas?.has(r.unidad)) continue;
    let i = idx(aISO(r.q_ref)) + r.frec;
    while (i <= iFin) {
      const o = { unidad: r.unidad, familia: r.familia, nivel: r.nivel, i, fase: r.fase };
      (i >= iIni ? bruto : backlog).push(o);
      i += r.frec;
    }
  }

  bruto.push(...continuarAjustadas(ins, desde, hasta));

  // PASO 1-BIS · separar lo que YA tiene una fila que lo representa.
  // La clave usa quincena_programada -donde NACIO la obligacion-, nunca quincena_efectiva.
  // Lo ya materializado se reporta y NO continua: no llega al paso 2, asi que no puede
  // elevar artificialmente el nivel de una visita nueva.
  const yaMaterializado = [], pendiente = [];
  for (const o of bruto) {
    const q = quin(o.i);
    const cob = o.fase === 'PLAN_AJUSTADO' ? null : materializadas.get(`${o.unidad}|${o.familia}|${o.nivel}|${q}`);
    if (cob) yaMaterializado.push({
      ...o, quincena: q, motivo: 'OBLIGACION_YA_MATERIALIZADA',
      programacion_id: cob.programacion_id, estado_programacion: cob.estado,
      cubierta_por_nivel: cob.por_nivel, q_efectiva_actual: cob.q_efectiva,
    });
    else pendiente.push(o);
  }

  // PASO 2 · separar. Las anuales NO entran en la consolidacion del paso 3.
  const regBruto = pendiente.filter(o => REGULARES.includes(o.familia));
  const anuBruto = pendiente.filter(o => ANUALES.includes(o.familia));

  // PASO 3 · nivel_regular = MAX(M3 > M2 > M1) SOLO entre las regulares PENDIENTES de esa
  // quincena. Solo lo que realmente falta define el alcance de la visita nueva.
  const nivelRegular = new Map();
  for (const o of regBruto) {
    const k = `${o.unidad}|${o.i}`, p = nivelRegular.get(k);
    if (!p || ORDEN[o.nivel] > ORDEN[p]) nivelRegular.set(k, o.nivel);
  }

  // PASO 4 · elevacion. TODA familia regular APLICA de la unidad entra con ese mismo nivel,
  // incluso si a esa familia no le tocaba nada. No se exige fase: sin fase no ORIGINA la
  // visita, pero si PARTICIPA de una que ya existe. No se inventa ningun historico.
  // Ojo con la diferencia: 1-bis decide QUE NIVEL tiene la visita a partir de lo pendiente;
  // el paso 4 decide QUIEN participa de la visita, que es otra pregunta.
  const detalles = [];
  for (const [k, nivel] of nivelRegular) {
    const [u, i] = k.split('|');
    for (const familia of REGULARES) {
      if (ins.APLICA.get(`${u}|${familia}`) !== 'APLICA') continue;
      detalles.push({
        unidad: +u, i: +i, familia, nivel, origen: 'REGULAR_ELEVADA',
        sin_fase_previa: !ins.conFase.has(`${u}|${familia}`),
      });
    }
  }

  // PASO 5 · anuales: entran SOLO cuando su propia obligacion anual M3 PENDIENTE cae en esa
  // quincena exacta. No elevan, no son elevadas, no participan del paso 3.
  for (const o of anuBruto) {
    if (ins.APLICA.get(`${o.unidad}|${o.familia}`) !== 'APLICA') continue;
    detalles.push({
      unidad: o.unidad, i: o.i, familia: o.familia, nivel: 'M3',
      origen: 'ANUAL_PROPIA', sin_fase_previa: false,
    });
  }

  // PASO 6 · una visita por (unidad, quincena). Todos los detalles cuelgan de ella, y de
  // ella una sola OT futura.
  const visitas = new Map();
  for (const d of detalles) {
    const k = `${d.unidad}|${d.i}`;
    if (!visitas.has(k)) visitas.set(k, {
      unidad: d.unidad, placa: ins.uni.get(d.unidad).placa,
      programa_id: ins.uni.get(d.unidad).programa_id, i: d.i, detalles: [],
    });
    visitas.get(k).detalles.push(d);
  }
  for (const v of visitas.values()) {
    v.quincena = quin(v.i);
    v.revision_ajuste = ins.revisionAjustes?.get(v.unidad) ?? 0;
    v.nivel_regular = nivelRegular.get(`${v.unidad}|${v.i}`) ?? null;
    // Resumen de la visita: nivel_regular, NUNCA el maximo global. En una visita solo
    // anual no hay componente regular y se resume como 'M3', el unico nivel presente.
    // YA NO SE PERSISTE: con el contrato posterior al 900 la cabecera no tiene columna de
    // nivel. Queda como dato en memoria para los informes del generador.
    v.nivel_cabecera = v.nivel_regular ?? 'M3';
    v.solo_anual = v.nivel_regular === null;
    const ver = versionDe(ins.vers, v.quincena);
    v.version_id = ver ? ver.id : null;
    v.version_etiqueta = ver ? ver.version : null;
    // DERIVADO, solo para resumen/UI. PROHIBIDO usarlo para propagar ciclos.
    v.resumen_ui_maximo = v.detalles.reduce((a, d) => ORDEN[d.nivel] > ORDEN[a] ? d.nivel : a, 'M1');
  }
  const todas = [...visitas.values()]
    .sort((a, b) => a.i - b.i || a.placa.localeCompare(b.placa));

  // PASO 6-BIS · el destino. Una visita nueva nace sin reprogramacion, asi que su
  // quincena_efectiva es su quincena_programada. Si ese slot ya esta ocupado por una
  // programacion activa NO se fusiona, NO se le cuelgan detalles, NO se crea una segunda
  // y NO se eleva su nivel: se REPORTA y esa visita no se escribe.
  const seguras = [], colisiones = [];
  for (const v of todas) {
    const slot = slots.get(`${v.unidad}|${v.quincena}`);
    if (!slot) { v.destino = 'MATERIALIZABLE'; seguras.push(v); continue; }
    v.destino = 'COLISION_DE_DESTINO';
    v.colision = diagnosticar(v, slot);
    colisiones.push(v.colision);
  }

  return {
    bruto, yaMaterializado, pendiente, regBruto, anuBruto, detalles, backlog, nivelRegular,
    visitas: todas, seguras, colisiones,
  };
}

// Clasifica POR QUE no cabe. Precedencia documentada: primero el hecho estructural -el slot
// lo ocupa una visita que llego reprogramada-, despues lo que la obligacion nueva intentaba
// aportar y no esta representado. Si nada de eso explica el choque se informa OTRO con la
// evidencia cruda, en vez de forzar una etiqueta que no corresponde.
export function diagnosticar(v, slot) {
  const motivos = new Set();
  if (slot.q_reprogramada !== null && slot.q_programada !== slot.q_efectiva)
    motivos.add('REPROGRAMADA_OCUPA_DESTINO');
  const noRepresentado = [];
  for (const d of v.detalles) {
    const actual = slot.nivelDe.get(d.familia) ?? null;
    if (actual === null) {
      motivos.add(ANUALES.includes(d.familia) ? 'ANUAL_NO_REPRESENTADA' : 'REGULAR_NO_REPRESENTADA');
      noRepresentado.push(`${d.familia}/${d.nivel} (ausente)`);
    } else if (ORDEN[d.nivel] > ORDEN[actual]) {
      motivos.add('ESCALADA_DE_NIVEL');
      noRepresentado.push(`${d.familia}/${d.nivel} (existe ${actual})`);
    }
  }
  if (motivos.size === 0) motivos.add('OTRO');
  const motivo = MOTIVOS_COLISION.find(m => motivos.has(m));
  return {
    placa: v.placa,
    programa_unidad_id: v.unidad,
    quincena_obligacion: v.quincena,
    quincena_efectiva_destino: v.quincena,
    programacion_id_ocupa: slot.programacion_id,
    estado_programacion_ocupa: slot.estado,
    q_programada_ocupa: slot.q_programada,
    q_reprogramada_ocupa: slot.q_reprogramada,
    ot_estados: slot.ot_estados,
    ot_resumen: slot.ot_estados.length
      ? `${slot.ot_abiertas} abierta(s) / ${slot.ot_cerradas} cerrada(s) / ${slot.ot_anuladas} anulada(s)`
      : 'sin OT',
    pendiente_intenta: [...v.detalles].map(d => `${d.familia}/${d.nivel}`).sort(),
    existente_contiene: slot.contenido,
    no_representado: noRepresentado,
    motivo,
    motivos: [...motivos],
  };
}

// =====================================================================================
// EXCEPCIONES OPERATIVAS · instalado y APLICA, pero sin referencia de fase
// =====================================================================================
// No generan obligacion y NO se les inventa fecha ni ancla, pero no pueden desaparecer del
// control: quedan listadas para que TI ingrese una referencia real cuando haya evidencia.
export function excepciones(ins) {
  const fuera = [];
  for (const [k, v] of ins.APLICA) {
    if (v !== 'APLICA' || ins.conFase.has(k)) continue;
    const [u, f] = k.split('|');
    fuera.push({
      unidad: +u, placa: ins.uni.get(+u).placa, familia: f, estado_inventario: 'INSTALADO',
      motivo: ANUALES.includes(f) ? 'SIN_REFERENCIA_M3' : 'SIN_REFERENCIA_REGULAR',
    });
  }
  return fuera.sort((a, b) => a.familia.localeCompare(b.familia) || a.placa.localeCompare(b.placa));
}

// =====================================================================================
// MATERIALIZACION · las dos unicas tablas que el generador escribe
// =====================================================================================
// NO crea ordenes_trabajo ni ordenes_trabajo_detalle. NO toca ciclos ni anclas.
//
// Solo escribe programaciones que ESTA CORRIDA acaba de crear. No resuelve el id de una
// programacion preexistente por (unidad, quincena_efectiva) para colgarle detalles: eso
// era exactamente el camino por el que una visita ajena terminaba modificada. El id sale
// del RETURNING del propio INSERT, asi que un detalle solo puede caer en la cabecera que
// esta funcion acaba de insertar.
//
// ATOMICIDAD POR VISITA. Cada visita se escribe dentro de su propio SAVEPOINT: cabecera y
// detalles entran juntos o no entra ninguno. Ninguna visita queda a medio escribir, y una
// visita que no entra no arrastra a las demas.
//
// La idempotencia la resuelve el algoritmo en el paso 1-bis. El ON CONFLICT del indice
// parcial queda como RED DE SEGURIDAD: si llega a disparar, es que el estado cambio entre
// la lectura de insumos y la escritura, y se informa como colision tardia en vez de
// silenciarse.
export async function materializar(cliente, visitas) {
  const res = {
    programaciones: 0, detalles: 0,
    red_de_seguridad: [],   // el UNIQUE parcial disparo: estado cambiado bajo los pies
    escritas: [],
  };
  const nota = v => `Proyeccion del generador TI-PR-01. nivel_regular=`
    + `${v.nivel_regular ?? 'ninguno, visita solo anual'}. El nivel real de cada equipo `
    + `esta en programacion_mantenimiento_equipos.nivel_mantenimiento.`;

  for (const v of visitas) {
    await cliente.query('SAVEPOINT visita');
    try {
      // No materializar una fotografía leída antes de una reprogramación/cierre.
      // La unidad se bloquea primero y la revisión se lee en una sentencia posterior:
      // READ COMMITTED ve así el ajuste que pudo terminar mientras esperaba el bloqueo.
      await cliente.query('SELECT id FROM programa_mantenimiento_unidades WHERE id=$1 FOR UPDATE', [v.unidad]);
      const { rows: revisiones } = await cliente.query(`SELECT COALESCE(max(id),0)::int AS revision
        FROM programacion_mantenimiento_ajustes WHERE programa_unidad_id=$1`, [v.unidad]);
      if (revisiones[0].revision !== (v.revision_ajuste ?? 0)) {
        throw new Error(`La programación de ${v.placa} cambió durante la generación. Vuelva a generar con los datos actuales.`);
      }
      // Contrato posterior a 20261001_900: la cabecera NO lleva fecha_programada,
      // fecha_reprogramada ni nivel_mantenimiento. La quincena es la unica referencia
      // administrativa, y el nivel vive por equipo en
      // programacion_mantenimiento_equipos.nivel_mantenimiento, que es el INSERT de abajo.
      const { rows } = await cliente.query(`INSERT INTO programacion_mantenimiento
          (programa_unidad_id, programa_id, version_programa_id,
           estado, quincena_programada, observaciones)
        VALUES ($1, $2, $3, $4, $5::date, $6)
        ON CONFLICT (programa_unidad_id, quincena_efectiva) WHERE estado <> 'CANCELADO'
        DO NOTHING
        RETURNING id`,
        [v.unidad, v.programa_id, v.version_id,
          ESTADO_INICIAL, v.quincena, nota(v)]);
      if (!rows.length) {
        // el indice parcial la rechazo: alguien ocupo el slot despues de leer los insumos
        await cliente.query('ROLLBACK TO SAVEPOINT visita');
        res.red_de_seguridad.push({
          placa: v.placa, programa_unidad_id: v.unidad, quincena: v.quincena,
          motivo: 'SLOT_OCUPADO_TRAS_LEER_INSUMOS',
          pendiente_intenta: v.detalles.map(d => `${d.familia}/${d.nivel}`).sort(),
        });
        continue;
      }
      const id = rows[0].id;
      if (v.detalles.length) {
        // sin ON CONFLICT: una cabecera recien insertada no puede tener detalles previos,
        // asi que un choque aqui seria un defecto del algoritmo y debe salir a la luz.
        await cliente.query(`INSERT INTO programacion_mantenimiento_equipos
            (programacion_id, programa_id, tipo_equipo, nivel_mantenimiento)
          SELECT * FROM unnest($1::int[], $2::int[], $3::varchar[], $4::varchar[])`,
          [v.detalles.map(() => id), v.detalles.map(() => v.programa_id),
            v.detalles.map(d => d.familia), v.detalles.map(d => d.nivel)]);
      }
      await cliente.query('RELEASE SAVEPOINT visita');
      v.programacion_id = id;
      res.programaciones++;
      res.detalles += v.detalles.length;
      res.escritas.push({ programacion_id: id, placa: v.placa, quincena: v.quincena,
        detalles: v.detalles.length });
    } catch (e) {
      // error TECNICO: se revierte esta visita y se propaga. No se disfraza de colision.
      await cliente.query('ROLLBACK TO SAVEPOINT visita');
      e.visita = { placa: v.placa, unidad: v.unidad, quincena: v.quincena };
      throw e;
    }
  }
  return res;
}
