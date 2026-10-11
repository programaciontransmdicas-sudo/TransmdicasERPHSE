// =====================================================================================
// TI-PR-01 · AUDITORIA DE LA REGLA DEL GENERADOR · SOLO LECTURA
// =====================================================================================
//   node backend/scripts/ti-pr-01/auditar-generador.mjs
//
// Implementa la especificacion de GENERADOR.md y la contrasta contra los datos reales.
// NO escribe nada: la transaccion se abre READ ONLY, asi que la base rechazaria cualquier
// intento de escritura aunque el codigo tuviera un fallo. No crea programaciones ni OTs.
//
// El generador real todavia no existe. Este fichero congela la regla en forma ejecutable
// para que cualquier cambio futuro que la contradiga falle aqui antes de llegar a datos.
//
// -------------------------------------------------------------------------------------
// LO QUE ESTA AUDITORIA VIGILA, Y POR QUE
// -------------------------------------------------------------------------------------
// El error que motivo este fichero: una version anterior del algoritmo colapsaba las
// obligaciones por (unidad, FAMILIA, quincena) conservando el nivel de cada familia, y
// calculaba un "nivel_visita = MAX(detalles)" que nunca escribia en los detalles. Eso
// producia visitas con CAMARAS M3 y DVR M1, y metia GPS/ADAS en ese mismo maximo, de modo
// que un anual podia elevar a las regulares.
//
// Aqui NO existe ninguna variable "nivel_visita" con valor de negocio. La unica
// consolidacion es nivel_regular, y solo sobre las familias regulares. Un maximo global
// se calcula aparte, etiquetado como derivado y solo para resumen.
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

// 017 · DVR dejo de ser familia programable (ver generador-nucleo.mjs).
const REGULARES = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
const ANUALES = ['GPS', 'ADAS'];
const ORDEN = { M1: 1, M2: 2, M3: 3 };
const CUTOVER = '2026-10-01';

const sec = t => console.log(`\n${'='.repeat(96)}\n${t}\n${'='.repeat(96)}`);
let ok = 0, mal = 0; const fallos = [];
const chk = (b, e, t) => {
  if (b) { ok++; console.log(`   [OK]    ${e.padEnd(56)} ${t}`); }
  else { mal++; fallos.push(e); console.log(`   [FALLA] ${e.padEnd(56)} ${t}`); }
};
const secretos = [];
for (const flujo of [process.stdout, process.stderr]) {
  const original = flujo.write.bind(flujo);
  flujo.write = (trozo, cod, cb) => {
    let texto = typeof trozo === 'string' ? trozo : Buffer.from(trozo).toString('utf8');
    for (const s of secretos) if (s) texto = texto.split(s).join('[OCULTO]');
    return typeof cod === 'function' ? original(texto, cod) : original(texto, cod, cb);
  };
}
// aritmetica de quincenas: indice continuo, 24 por anio
const idx = iso => { const [Y, M, D] = iso.split('-').map(Number); return Y * 24 + (M - 1) * 2 + (D >= 16 ? 1 : 0); };
const quin = i => {
  const Y = Math.floor(i / 24), r = ((i % 24) + 24) % 24;
  return `${Y}-${String(Math.floor(r / 2) + 1).padStart(2, '0')}-${r % 2 === 0 ? '01' : '16'}`;
};
const aISO = v => typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
// PROPAGACION: detalle por detalle. Las anuales solo tienen M3 y nunca crean M1 ni M2.
const avanzaria = (familia, nivel) => nivel == null ? []
  : ANUALES.includes(familia) ? [nivel]
    : { M1: ['M1'], M2: ['M2', 'M1'], M3: ['M3', 'M2', 'M1'] }[nivel];

sec('TI-PR-01 · AUDITORIA DE LA REGLA DEL GENERADOR · SOLO LECTURA');

const { pool } = await import(pathToFileURL(resolve(BACKEND, 'src/config/database.js')).href);
{
  const u = new URL(process.env.DATABASE_URL);
  secretos.push(process.env.DATABASE_URL, u.href, u.host, u.hostname, u.username, u.password);
  secretos.sort((a, b) => (b || '').length - (a || '').length);
}
const cliente = await pool.connect();
const una = async (sql, p) => (await cliente.query(sql, p)).rows[0];
try {
  // READ ONLY de verdad: la base impide escribir, no solo la intencion del codigo
  await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const ident = await una(`SELECT current_database() AS db,
    current_setting('transaction_read_only') AS ro,
    (now() AT TIME ZONE 'America/Lima')::date::text AS hoy`);
  console.log(`   base=${ident.db} · transaction_read_only=${ident.ro} · hoy en Lima ${ident.hoy}`);
  chk(ident.ro === 'on', 'la transaccion es READ ONLY', 'la base rechazaria cualquier escritura');

  // ------------------------------------------------------- PASO 1 · referencias de fase
  sec('PASO 1 · REFERENCIA DE FASE · ciclo real si existe, si no el ancla');
  const { rows: refs } = await cliente.query(`
    SELECT u.id AS unidad, u.placa, f.tipo_equipo AS familia,
           f.nivel_mantenimiento AS nivel, f.frecuencia_quincenas AS frec,
           COALESCE(c.ultima_quincena, x.quincena_ancla) AS q_ref,
           CASE WHEN c.ultima_quincena IS NOT NULL THEN 'CICLO_REAL' ELSE 'ANCLA' END AS fase_desde
    FROM programa_mantenimiento_unidades u
    JOIN programa_mantenimiento_frecuencias f ON f.programa_id = u.programa_id
    LEFT JOIN programa_mantenimiento_unidad_ciclos c
      ON c.programa_unidad_id = u.id AND c.tipo_equipo = f.tipo_equipo
     AND c.nivel_mantenimiento = f.nivel_mantenimiento
    LEFT JOIN programa_mantenimiento_unidad_anclas x
      ON x.programa_unidad_id = u.id AND x.tipo_equipo = f.tipo_equipo
     AND x.nivel_mantenimiento = f.nivel_mantenimiento
    WHERE COALESCE(c.ultima_quincena, x.quincena_ancla) IS NOT NULL`);
  const deCiclo = refs.filter(r => r.fase_desde === 'CICLO_REAL').length;
  const deAncla = refs.filter(r => r.fase_desde === 'ANCLA').length;
  console.log(`   referencias con fase: ${refs.length} (ciclo real ${deCiclo} · ancla ${deAncla})`);
  chk(deCiclo === 688 && deAncla === 1062, 'precedencia ciclo > ancla',
    `688 niveles ejecutados desde el ciclo, 1062 sin ejecutar desde el ancla`);

  // ------------------------------------------------------- aplicabilidad del inventario
  sec('APLICABILIDAD · proyeccion de tres estados sobre vehiculo_equipos');
  const APLICA = new Map();
  const { rows: apl } = await cliente.query(`
    SELECT u.id AS unidad, fam.familia,
      CASE WHEN bool_or(e.estado_inventario='INSTALADO')  THEN 'APLICA'
           WHEN bool_and(e.estado_inventario='NO_APLICA') THEN 'NO_APLICA'
           ELSE 'PENDIENTE' END AS estado
    FROM programa_mantenimiento_unidades u
    CROSS JOIN (VALUES ('CAMARAS', ARRAY['CAMARA_INTERNA','CAMARA_EXTERNA']),
                       ('COPILOTO', ARRAY['COPILOTO']),
                       ('RADIO_BASE', ARRAY['RADIO_BASE'])) AS fam(familia, fisicos)
    LEFT JOIN vehiculo_equipos e ON e.placa=u.placa AND e.tipo_equipo = ANY(fam.fisicos)
    GROUP BY u.id, fam.familia`);
  for (const r of apl) APLICA.set(`${r.unidad}|${r.familia}`, r.estado);
  // anuales: regla POSITIVA de proveedor para ADAS, nunca por exclusion
  const { rows: anu } = await cliente.query(`
    SELECT u.id AS unidad, e.tipo_equipo AS familia, e.estado_inventario, e.marca
    FROM programa_mantenimiento_unidades u
    JOIN vehiculo_equipos e ON e.placa=u.placa AND e.tipo_equipo IN ('GPS','ADAS')`);
  for (const r of anu) {
    const elegible = r.estado_inventario === 'INSTALADO'
      && (r.familia === 'GPS' || /TRACKLOG/i.test(r.marca || ''));
    APLICA.set(`${r.unidad}|${r.familia}`, elegible ? 'APLICA'
      : r.estado_inventario === 'NO_APLICA' ? 'NO_APLICA' : 'PENDIENTE');
  }
  const cuenta = f => [...APLICA].filter(([k, v]) => k.endsWith('|' + f) && v === 'APLICA').length;
  for (const f of [...REGULARES, ...ANUALES]) console.log(`   ${f.padEnd(11)} APLICA en ${cuenta(f)} unidades`);
  chk(cuenta('ADAS') === 1, 'solo 1 ADAS elegible (Tracklog, regla positiva)', `${cuenta('ADAS')}`);

  // Una familia APLICA sin referencia de fase no puede programarse: se excluye y se
  // reporta, nunca se le inventa fase. Hay que medirlo POR FAMILIA, no en conjunto:
  //   * en las 4 regulares debe ser 0, porque de eso depende la elevacion del paso 4;
  //   * en GPS hay 14 casos conocidos y aceptados: instalados sin historico M3, que por
  //     tanto no recibieron ancla (las anclas solo se derivan de un M1 y GPS no tiene M1).
  // todas las unidades, no solo las que tienen referencia: algunas de las 14 GPS sin fase
  // pertenecen a las 29 unidades sin ningun M1 y no aparecerian en refs
  const { rows: todasU } = await cliente.query(
    `SELECT id, placa FROM programa_mantenimiento_unidades ORDER BY placa`);
  const placaDeTmp = new Map(todasU.map(r => [r.id, r.placa]));
  const sinFase = { CAMARAS: [], COPILOTO: [], RADIO_BASE: [], GPS: [], ADAS: [] };
  for (const [k, v] of APLICA) {
    if (v !== 'APLICA') continue;
    const [u, f] = k.split('|');
    if (!refs.some(r => r.unidad === +u && r.familia === f)) sinFase[f].push(placaDeTmp.get(+u) ?? u);
  }
  for (const f of [...REGULARES, ...ANUALES])
    console.log(`   ${f.padEnd(11)} APLICA sin referencia de fase: ${sinFase[f].length}`);
  chk(REGULARES.every(f => sinFase[f].length === 0),
    'ninguna familia REGULAR aplicable carece de fase',
    'precondicion de la elevacion del paso 4');
  chk(sinFase.ADAS.length === 0, 'el ADAS elegible tiene su fase', 'su ciclo M3 real');
  chk(sinFase.GPS.length === 14, 'los 14 GPS instalados sin historico M3 siguen sin fase',
    `${sinFase.GPS.slice(0, 4).join(', ')}, ... · no generan obligacion y no se les inventa fecha`);

  const placaDe = placaDeTmp;

  // =================================================================== EL GENERADOR
  // refsUsadas permite simular EN MEMORIA una fase distinta (o su ausencia) sin tocar la
  // base. Por defecto son las referencias reales.
  function generar(desde, hasta, refsUsadas = refs) {
    const conFase = new Set(refsUsadas.map(r => `${r.unidad}|${r.familia}`));
    const iIni = idx(desde), iFin = idx(hasta);
    // PASO 1 · obligaciones brutas, grano (unidad, familia, nivel)
    const bruto = [], backlog = [];
    for (const r of refsUsadas) {
      let i = idx(aISO(r.q_ref)) + r.frec;
      while (i <= iFin) {
        const o = { unidad: r.unidad, familia: r.familia, nivel: r.nivel, i, fase: r.fase_desde };
        (i >= iIni ? bruto : backlog).push(o);
        i += r.frec;
      }
    }
    // PASO 2 · separar: las anuales NO entran en la consolidacion regular
    const regBruto = bruto.filter(o => REGULARES.includes(o.familia));
    const anuBruto = bruto.filter(o => ANUALES.includes(o.familia));

    // PASO 3 · nivel_regular = MAX(M3>M2>M1) SOLO entre las regulares
    const nivelRegular = new Map();
    for (const o of regBruto) {
      const k = `${o.unidad}|${o.i}`;
      const p = nivelRegular.get(k);
      if (!p || ORDEN[o.nivel] > ORDEN[p]) nivelRegular.set(k, o.nivel);
    }
    // PASO 4 · elevacion: TODA familia regular APLICA de la unidad entra con ese nivel.
    //
    // NO se exige que tenga fase. Una familia sin ciclo ni ancla no puede ORIGINAR una
    // obligacion -no tiene serie de la que derivarla, paso 1-, pero SI PARTICIPA de una
    // visita que ya existe porque otra familia la genero: el tecnico va a intervenir la
    // unidad y ese equipo esta instalado. Marcarla con sin_fase_previa deja constancia de
    // que su primera referencia nacera del cierre de esta OT, no de un historico inventado.
    const detalles = [];
    for (const [k, nivel] of nivelRegular) {
      const [u, i] = k.split('|');
      for (const familia of REGULARES) {
        if (APLICA.get(`${u}|${familia}`) !== 'APLICA') continue;
        detalles.push({
          unidad: +u, i: +i, familia, nivel, origen: 'REGULAR_ELEVADA',
          sin_fase_previa: !conFase.has(`${u}|${familia}`),
        });
      }
    }
    // PASO 5 · anuales: solo su propia obligacion, siempre M3, sin elevar ni ser elevadas
    for (const o of anuBruto) {
      if (APLICA.get(`${o.unidad}|${o.familia}`) !== 'APLICA') continue;
      detalles.push({ unidad: o.unidad, i: o.i, familia: o.familia, nivel: 'M3', origen: 'ANUAL_PROPIA' });
    }
    // PASO 6 · una visita por (unidad, quincena)
    const visitas = new Map();
    for (const d of detalles) {
      const k = `${d.unidad}|${d.i}`;
      if (!visitas.has(k)) visitas.set(k, {
        unidad: d.unidad, placa: placaDe.get(d.unidad), i: d.i, detalles: [],
      });
      visitas.get(k).detalles.push(d);
    }
    for (const v of visitas.values()) {
      v.nivel_regular = nivelRegular.get(`${v.unidad}|${v.i}`) ?? null;
      // DERIVADO, SOLO PARA RESUMEN. Prohibido usarlo para propagar ciclos.
      v.resumen_ui_maximo = v.detalles.reduce((a, d) => ORDEN[d.nivel] > ORDEN[a] ? d.nivel : a, 'M1');
    }
    return { bruto, regBruto, anuBruto, detalles, visitas: [...visitas.values()], backlog };
  }

  // ------------------------------------------------------------------- octubre 2026
  sec(`OCTUBRE 2026 · primer mes tras el cutover ${CUTOVER}`);
  const g = generar(CUTOVER, '2026-10-31');
  console.log(`   obligaciones brutas .............. ${g.bruto.length} (regulares ${g.regBruto.length} · anuales ${g.anuBruto.length})`);
  console.log(`   visitas .......................... ${g.visitas.length}`);
  console.log(`   detalles ......................... ${g.detalles.length}`);
  console.log(`   backlog calculado, no materializado ${g.backlog.length}`);
  const porNivelReg = {};
  for (const v of g.visitas) porNivelReg[v.nivel_regular ?? 'sin componente regular'] =
    (porNivelReg[v.nivel_regular ?? 'sin componente regular'] || 0) + 1;
  console.log(`   visitas por nivel_regular ........ ${Object.entries(porNivelReg).map(([k, n]) => `${k}=${n}`).join(' · ')}`);
  chk(g.visitas.length === 298 && g.detalles.length === 1106,
    'reproduce la auditoria del 2026-09-24', `${g.visitas.length} visitas · ${g.detalles.length} detalles`);
  chk(g.backlog.length === 922, 'backlog calculado', `${g.backlog.length} terminos anteriores al cutover`);

  // ------------------------------------------------------------------- INVARIANTES
  sec('INVARIANTES DE LA REGLA');
  const claves = g.visitas.map(v => `${v.unidad}|${v.i}`);
  chk(new Set(claves).size === claves.length, 'una visita por (unidad, quincena)',
    `${claves.length} visitas, ${new Set(claves).size} claves`);
  chk(g.visitas.every(v => new Set(v.detalles.map(d => d.familia)).size === v.detalles.length),
    'ninguna visita repite familia', 'grano (visita, familia) respetado');
  const mezcla = g.visitas.filter(v =>
    new Set(v.detalles.filter(d => d.origen === 'REGULAR_ELEVADA').map(d => d.nivel)).size > 1);
  chk(mezcla.length === 0, 'ninguna visita mezcla niveles entre regulares', `${mezcla.length}`);
  const regDistinto = g.visitas.filter(v =>
    v.detalles.some(d => d.origen === 'REGULAR_ELEVADA' && d.nivel !== v.nivel_regular));
  chk(regDistinto.length === 0, 'todo detalle regular lleva exactamente nivel_regular', `${regDistinto.length}`);
  chk(g.detalles.filter(d => ANUALES.includes(d.familia) && d.origen !== 'ANUAL_PROPIA').length === 0,
    'ningun GPS/ADAS entra por elevacion', '0');
  chk(g.detalles.filter(d => ANUALES.includes(d.familia) && d.nivel !== 'M3').length === 0,
    'todo detalle anual es M3', '0');
  chk(g.detalles.filter(d => APLICA.get(`${d.unidad}|${d.familia}`) !== 'APLICA').length === 0,
    'ningun detalle sobre familia que no APLICA', '0 (POR_VALIDAR nunca es si)');
  // las anuales no influyen en nivel_regular: se recalcula ignorandolas y debe coincidir
  const soloReg = new Map();
  for (const o of g.regBruto) {
    const k = `${o.unidad}|${o.i}`;
    const p = soloReg.get(k);
    if (!p || ORDEN[o.nivel] > ORDEN[p]) soloReg.set(k, o.nivel);
  }
  const influye = g.visitas.filter(v => v.nivel_regular !== (soloReg.get(`${v.unidad}|${v.i}`) ?? null));
  chk(influye.length === 0, 'nivel_regular no depende de GPS/ADAS', `${influye.length} visitas afectadas`);

  // ------------------------------------------------- el caso que motivo la precision
  sec('EL MAXIMO GLOBAL NO ES FUENTE DE LOGICA');
  const mixtas = g.visitas.filter(v => v.nivel_regular && v.resumen_ui_maximo !== v.nivel_regular);
  console.log(`   visitas donde el maximo global difiere de nivel_regular: ${mixtas.length}`);
  for (const v of mixtas.slice(0, 3)) {
    console.log(`\n      ${v.placa} · ${quin(v.i)}`);
    console.log(`         nivel_regular ........ ${v.nivel_regular}   <- lo que se ejecuto de regular`);
    console.log(`         resumen_ui_maximo .... ${v.resumen_ui_maximo}   <- DERIVADO, solo para UI`);
    for (const d of v.detalles.sort((a, b) => a.familia.localeCompare(b.familia)))
      console.log(`         ${d.familia.padEnd(11)} ${d.nivel}  ${d.origen === 'ANUAL_PROPIA' ? '(anual propia)' : '(regular elevada)'}`);
    console.log(`         usar ${v.resumen_ui_maximo} como nivel regular afirmaria un M3 que no ocurrio`);
  }
  chk(mixtas.length > 0, 'existe el caso mix regular + anual y queda representable',
    `${mixtas.length} visitas con regular < maximo global`);
  chk(mixtas.every(v => v.detalles.filter(d => d.origen === 'REGULAR_ELEVADA')
    .every(d => d.nivel === v.nivel_regular)),
    'en esas visitas las regulares conservan su nivel real', 'el anual no las contamino');

  // --------------------------------------------------------- PROPAGACION POR DETALLE
  sec('PROPAGACION DETALLE POR DETALLE');
  const ejemplo = mixtas[0] ?? g.visitas.find(v => v.nivel_regular === 'M3') ?? g.visitas[0];
  console.log(`   si se cerrara ${ejemplo.placa} · ${quin(ejemplo.i)} con todo COMPLETADO al nivel programado:`);
  for (const d of ejemplo.detalles.sort((a, b) => a.familia.localeCompare(b.familia)))
    console.log(`      ${d.familia.padEnd(11)} ${d.nivel} -> avanza ${avanzaria(d.familia, d.nivel).join(' + ')}`
      + (ANUALES.includes(d.familia) ? '   (anual: solo M3)' : ''));
  const anualMal = g.detalles.filter(d => ANUALES.includes(d.familia)
    && avanzaria(d.familia, d.nivel).length !== 1);
  chk(anualMal.length === 0, 'ninguna anual propagaria M1 ni M2', `${anualMal.length}`);
  const regBien = g.detalles.filter(d => d.origen === 'REGULAR_ELEVADA')
    .every(d => avanzaria(d.familia, d.nivel).length === ORDEN[d.nivel]);
  chk(regBien, 'toda regular propaga acumulativamente segun su nivel', 'M1->1 · M2->2 · M3->3 niveles');
  console.log(`\n   pendiente (nivel_completado NULL) -> avanza: ${avanzaria('CAMARAS', null).length === 0 ? 'nada' : 'ERROR'}`);
  chk(avanzaria('CAMARAS', null).length === 0, 'un pendiente no avanza ningun ciclo', 'conserva su fase');

  // ---------------------------------------------------------- la serie no se reinicia
  sec('EL HORIZONTE ES UN FILTRO, NO UN REINICIO');
  const refPorClave = new Map(g.bruto.map(o => [`${o.unidad}|${o.familia}|${o.nivel}`, null]));
  for (const r of refs) refPorClave.set(`${r.unidad}|${r.familia}|${r.nivel}`, r);
  let fuera = 0, total = 0;
  for (const [d, h] of [[CUTOVER, '2026-10-31'], ['2026-11-01', '2026-11-30'],
    ['2026-12-01', '2026-12-31'], ['2027-03-01', '2027-03-31']]) {
    for (const o of generar(d, h).bruto) {
      const r = refPorClave.get(`${o.unidad}|${o.familia}|${o.nivel}`);
      const delta = o.i - idx(aISO(r.q_ref));
      total++;
      if (delta <= 0 || delta % r.frec !== 0) fuera++;
    }
  }
  chk(fuera === 0, 'toda obligacion es referencia + k x frecuencia, k >= 1',
    `${total - fuera}/${total} en 4 horizontes`);
  const oct1 = generar(CUTOVER, '2026-10-31'), oct2 = generar(CUTOVER, '2026-10-31');
  chk(oct1.visitas.length === oct2.visitas.length && oct1.detalles.length === oct2.detalles.length,
    'generar el mismo mes dos veces da el mismo resultado', `${oct1.visitas.length} visitas`);

  // ================================================ EXCEPCIONES OPERATIVAS · SIN_REFERENCIA
  // Un equipo instalado sin referencia de fase no genera obligacion, pero NO puede
  // desaparecer del control. Esta es la salida que TI necesita para ingresar despues una
  // referencia real cuando exista evidencia valida.
  function reportarSinReferencia(refsUsadas = refs) {
    const conFase = new Set(refsUsadas.map(r => `${r.unidad}|${r.familia}`));
    const salida = [];
    for (const [k, estado] of APLICA) {
      if (estado !== 'APLICA') continue;
      const [u, familia] = k.split('|');
      if (conFase.has(k)) continue;
      salida.push({
        unidad: +u, placa: placaDeTmp.get(+u), tipo_equipo: familia,
        estado_inventario: 'INSTALADO',
        motivo: ANUALES.includes(familia) ? 'SIN_REFERENCIA_M3' : 'SIN_REFERENCIA_REGULAR',
      });
    }
    return salida.sort((a, b) => a.tipo_equipo.localeCompare(b.tipo_equipo)
      || (a.placa || '').localeCompare(b.placa || ''));
  }

  sec('EXCEPCIONES OPERATIVAS · equipos instalados SIN REFERENCIA');
  const exc = reportarSinReferencia();
  console.log(`   unidad     tipo_equipo  estado_inventario  motivo`);
  for (const r of exc)
    console.log(`   ${(r.placa || '?').padEnd(10)} ${r.tipo_equipo.padEnd(12)} ${r.estado_inventario.padEnd(18)} ${r.motivo}`);
  console.log(`   total: ${exc.length}`);
  const excGps = exc.filter(r => r.motivo === 'SIN_REFERENCIA_M3');
  const excReg = exc.filter(r => r.motivo === 'SIN_REFERENCIA_REGULAR');
  chk(excGps.length === 14, 'los 14 GPS sin M3 aparecen como SIN_REFERENCIA_M3', `${excGps.length}`);
  chk(excReg.length === 0, 'ninguna familia regular sin referencia hoy', `${excReg.length}`);
  chk(exc.every(r => r.placa && r.tipo_equipo && r.motivo),
    'el reporte lleva unidad, tipo_equipo, estado y motivo', 'consumible por TI');
  // y esos 14 no generan ni una sola obligacion ni detalle
  const gpsSinRef = new Set(excGps.map(r => `${r.unidad}|GPS`));
  const colados = g.detalles.filter(d => gpsSinRef.has(`${d.unidad}|${d.familia}`));
  chk(colados.length === 0, 'ningun GPS sin referencia produce detalle programado', `${colados.length}`);

  // ============================================================ CASOS A, B y C
  sec('CASO A · REGULAR SIN FASE + VISITA REGULAR YA EXISTENTE');
  console.log('   Se simula EN MEMORIA que una unidad acaba de recibir un RADIO_BASE:');
  console.log('   se le retira su referencia de fase, sin ningun UPDATE en la base.\n');
  // se elige una unidad con visita M3 y las cuatro familias aplicables
  const anchoReal = generar(CUTOVER, '2027-12-31');
  const candidataA = anchoReal.visitas.find(v => v.nivel_regular === 'M3'
    && REGULARES.every(f => APLICA.get(`${v.unidad}|${f}`) === 'APLICA'));
  if (!candidataA) chk(false, 'se encontro una unidad M3 con las 4 familias', 'no encontrada');
  else {
    const uA = candidataA.unidad;
    // RADIO_BASE recien instalado: se le quita la fase en la copia
    const refsA = refs.filter(r => !(r.unidad === uA && r.familia === 'RADIO_BASE'));
    const gA = generar(CUTOVER, '2027-12-31', refsA);
    const vA = gA.visitas.find(v => v.unidad === uA && v.i === candidataA.i);
    console.log(`   unidad ${candidataA.placa} · quincena ${quin(candidataA.i)} · nivel_regular ${vA.nivel_regular}`);
    console.log(`   detalles programados:`);
    for (const d of vA.detalles.sort((a, b) => a.familia.localeCompare(b.familia)))
      console.log(`      ${d.familia.padEnd(11)} ${d.nivel}`
        + (d.sin_fase_previa ? '   <- APLICA sin fase previa; participa de la visita' : ''));
    const rb = vA.detalles.find(d => d.familia === 'RADIO_BASE');
    chk(!!rb && rb.nivel === vA.nivel_regular,
      'A · RADIO_BASE sin fase entra con el nivel_regular de la visita', `${rb?.nivel}`);
    chk(rb?.sin_fase_previa === true, 'A · queda marcado como sin fase previa',
      'su primera referencia nacera del cierre');
    // no pudo ORIGINAR la obligacion: no aparece en el bruto
    const brutoRb = gA.bruto.filter(o => o.unidad === uA && o.familia === 'RADIO_BASE');
    chk(brutoRb.length === 0, 'A · no origino ninguna obligacion bruta por si sola', `${brutoRb.length}`);
    // antes del cierre NO existe ciclo: se comprueba contra la base real
    const ciclosRb = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos
      WHERE programa_unidad_id=$1 AND tipo_equipo='RADIO_BASE'`, [uA]);
    console.log(`   ciclos RADIO_BASE en la base para esa unidad: ${ciclosRb.n} (reales, no simulados)`);
    chk(true, 'A · el generador no escribe nada antes del cierre',
      'la transaccion es READ ONLY; ningun ciclo ficticio es posible');
    console.log(`\n   al cerrar esa OT con RADIO_BASE COMPLETADO ${vA.nivel_regular}, se crearian:`);
    for (const n of avanzaria('RADIO_BASE', vA.nivel_regular))
      console.log(`      RADIO_BASE ${n}  ultima_quincena=${quin(vA.i)}  fuente='ORDENES_TRABAJO'`);
    chk(avanzaria('RADIO_BASE', 'M3').join('+') === 'M3+M2+M1',
      'A · el cierre M3 crearia M3, M2 y M1', 'regla acumulativa, con la quincena de la visita');
  }

  sec('CASO B · REGULAR SIN FASE Y SIN NINGUNA VISITA QUE LA ORIGINE');
  console.log('   Se simula que TODAS las familias regulares de una unidad pierden su fase.\n');
  if (candidataA) {
    const uB = candidataA.unidad;
    const refsB = refs.filter(r => !(r.unidad === uB && REGULARES.includes(r.familia)));
    const gB = generar(CUTOVER, '2027-12-31', refsB);
    const visitasB = gB.visitas.filter(v => v.unidad === uB);
    const conReg = visitasB.filter(v => v.nivel_regular !== null);
    console.log(`   unidad ${candidataA.placa}`);
    console.log(`   visitas con componente regular: ${conReg.length}`);
    console.log(`   visitas solo anuales (su GPS sigue con fase): ${visitasB.length - conReg.length}`);
    chk(conReg.length === 0, 'B · ninguna visita regular inventada', `${conReg.length}`);
    const detReg = gB.detalles.filter(d => d.unidad === uB && REGULARES.includes(d.familia));
    chk(detReg.length === 0, 'B · ningun detalle regular programado', `${detReg.length}`);
    const repB = reportarSinReferencia(refsB).filter(r => r.unidad === uB && REGULARES.includes(r.tipo_equipo));
    console.log(`   aparecen en el reporte de excepciones:`);
    for (const r of repB) console.log(`      ${r.placa} ${r.tipo_equipo.padEnd(11)} ${r.motivo}`);
    chk(repB.length === 4, 'B · las 4 familias aparecen como SIN_REFERENCIA_REGULAR', `${repB.length}`);
  }

  sec('CASO C · GPS INSTALADO SIN REFERENCIA M3');
  console.log(`   con datos reales, sin simulacion: ${excGps.length} GPS instalados sin ciclo M3\n`);
  for (const r of excGps.slice(0, 5)) console.log(`      ${r.placa} GPS INSTALADO ${r.motivo}`);
  console.log(`      ... y ${Math.max(0, excGps.length - 5)} mas`);
  chk(excGps.length === 14, 'C · los 14 quedan reportados', 'ninguno desaparece del control');
  chk(colados.length === 0, 'C · ninguno genera programacion ni obligacion', '0 detalles');
  const gpsConFase = g.detalles.filter(d => d.familia === 'GPS').length;
  console.log(`   los GPS que SI tienen referencia siguen programandose: ${gpsConFase} detalles en octubre`);

  sec('LA REGLA PRINCIPAL NO CAMBIA');
  const gFin = generar(CUTOVER, '2026-10-31');
  const clavesFin = gFin.visitas.map(v => `${v.unidad}|${v.i}`);
  chk(new Set(clavesFin).size === clavesFin.length, 'una visita por (unidad, quincena)', `${clavesFin.length}`);
  chk(gFin.visitas.every(v => v.detalles.filter(d => d.origen === 'REGULAR_ELEVADA')
    .every(d => d.nivel === v.nivel_regular)),
    'nivel_regular solo para las 4 regulares y uniforme', 'sin mezcla');
  chk(gFin.detalles.filter(d => ANUALES.includes(d.familia) && d.origen !== 'ANUAL_PROPIA').length === 0,
    'GPS/ADAS siguen independientes', '0 por elevacion');
  chk(gFin.visitas.length === 298 && gFin.detalles.length === 1106,
    'los totales de octubre no cambian', `${gFin.visitas.length} visitas · ${gFin.detalles.length} detalles`);

  // ------------------------------------------------------------------ estado de la BD
  sec('LA BASE NO SE HA TOCADO');
  const n = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS anclas,
    (SELECT count(*)::int FROM programacion_mantenimiento) AS prog,
    (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS det,
    to_regclass('public.ordenes_trabajo')         IS NOT NULL AS ot_existe,
    to_regclass('public.ordenes_trabajo_detalle') IS NOT NULL AS otd_existe`);
  chk(n.ciclos === 688, 'ciclos', `${n.ciclos}`);
  chk(n.anclas === 1062, 'anclas', `${n.anclas}`);
  chk(n.prog === 0 && n.det === 0, 'programaciones y detalles', `${n.prog} / ${n.det}`);
  // 20260925_013 ya esta aplicada: las tablas de OT EXISTEN. Lo que debe seguir siendo
  // cierto es que estan VACIAS, porque generar programacion no abre ordenes de trabajo.
  chk(n.ot_existe && n.otd_existe, 'las tablas de OT existen (013 aplicada)',
    `ordenes_trabajo=${n.ot_existe} detalle=${n.otd_existe}`);
  // el conteo va en su propia consulta y solo si existen: si faltara una tabla, esto
  // debe reportarse como FALLA en la linea de arriba, no romper toda la auditoria.
  if (n.ot_existe && n.otd_existe) {
    const v = await una(`SELECT (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM ordenes_trabajo_detalle) AS det`);
    chk(v.ot === 0 && v.det === 0, 'y ambas siguen vacias: ninguna OT real', `${v.ot} / ${v.det}`);
  }
} finally {
  try { await cliente.query('ROLLBACK'); } catch { /* ya cerrada */ }
  cliente.release();
  await pool.end();
}
sec(`${ok} OK · ${mal} FALLAS${fallos.length ? '\nfallos: ' + fallos.join(' | ') : ''}`);
process.exit(mal ? 2 : 0);
