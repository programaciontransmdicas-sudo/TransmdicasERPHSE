// =====================================================================================
// OBSOLETO DESDE 20261007_017 · NO REEJECUTAR
// =====================================================================================
// Este cargador historico siembra, entre otras, 145 filas de ciclo M1 de la familia DVR
// usando la columna de CAMARAS de la hoja Inspecciones como evidencia (ver seccion
// "FAMILIAS Y PROYECCION DEL INVENTARIO" y el apartado 12 del informe). Esa regla era
// correcta en su momento y es precisamente la prueba de que DVR nunca tuvo fase propia.
//
// Por decision de negocio del 2026-10-07, DVR DEJO DE SER FAMILIA PROGRAMABLE: la
// migracion 20261007_017 retiro su frecuencia, sus ciclos y sus anclas, y estrecho
// chk_ciclo_tipo_equipo. Reejecutar este script fallaria al insertar un ciclo DVR, y si
// no fallara volveria a meter la familia que acabamos de retirar.
//
// Se conserva SOLO como documentacion de la procedencia de los datos ya cargados.
// Su apartado 12 ("DVR · EVIDENCIA A PARTIR DE LA INSPECCION GENERAL DE LA UNIDAD") es
// historia, no instruccion.
// =====================================================================================
// =====================================================================================
// TI-PR-01 · B4 · REFERENCIAS INICIALES DE CICLO M1
// =====================================================================================
//   node backend/scripts/ti-pr-01/cargar-b4-ciclos-m1.mjs --ensayo     prueba, ROLLBACK
//   node backend/scripts/ti-pr-01/cargar-b4-ciclos-m1.mjs --confirmar  carga real, COMMIT
//
// Sin bandera no hace nada.
//
// Puebla EXCLUSIVAMENTE programa_mantenimiento_unidad_ciclos con nivel M1.
// No crea M2, M3, programacion, detalles ni OT. No toca el Excel ni otras tablas.
//
// -------------------------------------------------------------------------------------
// DE DONDE SALE LA FECHA
// -------------------------------------------------------------------------------------
// La columna I de la hoja TI-PR-01 es:
//   ULT. M1 = MAX(BASE M1, ULT. INSPECCION, REG. M1, ULT. M2, ULT. M3)
//   ULT. M2 = MAX(BASE M2, REG. M2, ULT. M3)      ULT. M3 = MAX(BASE M3, REG. M3)
// Auditado sobre el libro: BASE M1/M2/M3 estan vacias en las 175 filas y la hoja
// REGISTRO no tiene ninguna intervencion (0 filas desde la 8). Por eso hoy la formula
// colapsa a ULT. M1 = ULT. INSPECCION, que a su vez es
//   MAXIFS(Inspecciones!N, Inspecciones!M, placa normalizada)
// Este script RE-DERIVA ese MAXIFS desde la hoja Inspecciones y lo contrasta con el
// valor cacheado en la columna I: si discrepan en una sola unidad, aborta.
//
// NO se usa como evidencia de ejecucion ninguna de estas columnas:
//   P  QUINC. ARRANQUE DEL CICLO  (priorizacion temporal, no es una ejecucion)
//   J  PROX. M1                   (proyeccion)
//   AJ FECHA M3 ARRANQUE          (ancla del plan)
//   AK QUINC. ARRANQUE (CALC.)    (se calcula sobre PROX. M1)
//   Q..X rejilla de quincenas     (plan)
//   L, N PROX. M2 / PROX. M3      (proyeccion)
//
// -------------------------------------------------------------------------------------
// ultima_fecha_real  FRENTE A  ultima_quincena
// -------------------------------------------------------------------------------------
// Son dos cosas distintas y no deben confundirse:
//
//   ultima_fecha_real = el dia exacto en que se ejecuto. Se conserva tal cual, sin
//                       redondear ni normalizar.
//   ultima_quincena   = la quincena administrativa a la que se imputo el mantenimiento.
//
// El libro historico NO registro la quincena administrativa de cada intervencion: no
// existe ninguna columna que la calcule para el ULTIMO M1 (la unica regla de quincena
// del libro, 1+INT((fecha-Q7)/15), se aplica a PROX. M1 y su rejilla solo cubre
// 2026-09-01..2026-12-16).
//
// Por eso, y SOLO para sembrar el historico inicial, se aplica esta convencion
// autorizada expresamente:
//     dia 1..15      -> ultima_quincena = DATE(anio, mes, 1)
//     dia 16..fin    -> ultima_quincena = DATE(anio, mes, 16)
//
// A PARTIR DE LA PUESTA EN MARCHA DEL ERP ESTA CONVENCION YA NO APLICA:
//   * ultima_quincena sera la quincena administrativa real de la OT;
//   * ultima_fecha_real seguira siendo el dia exacto de ejecucion;
//   * una ejecucion adelantada o atrasada NO movera la quincena administrativa;
//   * solo una reprogramacion formal podra cambiarla.
// Es decir, en adelante ultima_quincena NO se derivara de ultima_fecha_real.
//
// -------------------------------------------------------------------------------------
// FAMILIAS Y PROYECCION DEL INVENTARIO
// -------------------------------------------------------------------------------------
// M1 se siembra para 4 familias. GPS solo tiene M3 y ADAS no se mantiene.
//   DVR     aplica si DVR_INTERNO=INSTALADO OR DVR_EXTERNO=INSTALADO
//   CAMARAS aplica si CAMARA_INTERNA=INSTALADO OR CAMARA_EXTERNA=INSTALADO
//   COPILOTO, RADIO_BASE  directos
//   ambos componentes NO_APLICA           -> NO_APLICA  (no se siembra)
//   sin INSTALADO y con algun POR_VALIDAR -> PENDIENTE  (no se siembra)
// POR_VALIDAR nunca se interpreta como INSTALADO.
//
// La hoja Inspecciones no tiene columna de DVR. Por regla de negocio aprobada, el DVR
// forma parte de la revision de camaras, asi que la inspeccion M1 de la unidad vale
// como evidencia M1 del DVR siempre que el inventario confirme que la familia aplica.
//
// Error y "Falta revision" NO invalidan el M1 en esta siembra inicial: se conserva el
// estado hallado en observaciones, sin usarlo para excluir ni retrasar el ciclo.
//
// fuente = 'EXCEL' en todas las filas: la evidencia es el libro que estamos migrando,
// no la tabla inspecciones_flota del ERP (auditado: solo 1 de las 156 referencias tiene
// registro correspondiente en esa tabla).
//
// -------------------------------------------------------------------------------------
// ZONA HORARIA
// -------------------------------------------------------------------------------------
// La operacion trabaja en Lima (America/Lima, UTC-5) y la sesion de PostgreSQL de Neon
// esta en TimeZone='GMT', asi que CURRENT_DATE devuelve la fecha UTC, no la de Lima.
// Entre las 19:00 y la medianoche de Lima ambas difieren en un dia.
//
// Eso NO afecta al dato que se inserta: ultima_quincena y ultima_fecha_real son de tipo
// DATE, sin hora ni zona, y su valor sale del numero de serie del Excel, que tampoco
// lleva zona. No hay ninguna conversion de huso en el camino.
//
// Donde si importaba es en la VALIDACION de "fecha futura", que es una barrera de
// seguridad y no parte del dato. Por eso el hoy se calcula siempre como
//     (now() AT TIME ZONE 'America/Lima')::date
// y nunca con CURRENT_DATE ni con Date.toISOString() de Node, que dan la fecha UTC.
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

const EXCEL = 'C:/Daniel/HSE/TI/TI-PR-01 Programa de Mantenimiento de Equipos Tecnológicos 2026 PROPUESTA ACTUALIZADO.xlsx';
const EXCEL_SHA256 = '414b513513caa4a55972cbcc586e90a7f34b87ae8892d056f6f5009c16d21a62';
const CODIGO = 'TI-PR-01';
const FAMILIAS = ['DVR', 'CAMARAS', 'COPILOTO', 'RADIO_BASE'];
const FUENTE = 'EXCEL';

const modo = process.argv.includes('--confirmar') ? 'CONFIRMAR'
           : process.argv.includes('--ensayo')    ? 'ENSAYO' : null;
const sec = t => console.log(`\n${'='.repeat(94)}\n${t}\n${'='.repeat(94)}`);
let fallos = 0, aciertos = 0;
const chk = (bien, etiqueta, detalle) => {
  if (bien) { aciertos++; console.log(`   [OK]    ${etiqueta.padEnd(50)} ${detalle}`); }
  else      { fallos++;   console.log(`   [FALLA] ${etiqueta.padEnd(50)} ${detalle}`); }
};
const abortar = m => { console.error(`\nABORTADO: ${m}\n`); process.exit(2); };
if (!modo) abortar('indica --ensayo (prueba con ROLLBACK) o --confirmar (carga real con COMMIT).');

const secretos = [];
for (const flujo of [process.stdout, process.stderr]) {
  const original = flujo.write.bind(flujo);
  flujo.write = (trozo, cod, cb) => {
    let texto = typeof trozo === 'string' ? trozo : Buffer.from(trozo).toString('utf8');
    for (const s of secretos) if (s) texto = texto.split(s).join('[OCULTO]');
    return typeof cod === 'function' ? original(texto, cod) : original(texto, cod, cb);
  };
}

sec(`TI-PR-01 · B4 · REFERENCIAS INICIALES M1 · MODO ${modo}`);

// --- 1 · Excel ---------------------------------------------------------------------
sec('1 · EXCEL FUENTE');
let buf; try { buf = readFileSync(EXCEL); } catch { abortar(`no encuentro el Excel:\n  ${EXCEL}`); }
const sha = createHash('sha256').update(buf).digest('hex');
console.log(`   bytes ${buf.length} · mtime ${statSync(EXCEL).mtime.toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
console.log(`   sha256 ${sha}`);
if (sha !== EXCEL_SHA256) abortar(`el Excel NO es el autorizado.\n  esperado: ${EXCEL_SHA256}\n  leido:    ${sha}`);
console.log('   coincide con la huella autorizada');

const JSZip = (await import(pathToFileURL(resolve(BACKEND, 'node_modules/jszip/lib/index.js')).href)).default;
const zip = await JSZip.loadAsync(buf);
const libro = await zip.file('xl/workbook.xml').async('string');
const relaciones = await zip.file('xl/_rels/workbook.xml.rels').async('string');
const mapaRel = {};
for (const m of relaciones.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) mapaRel[m[1]] = m[2].replace(/^\/?xl\//, '');
const hojas = [...libro.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
  .map(m => ({ nombre: m[1], parte: 'xl/' + mapaRel[m[2]] }));
const cadenas = [...(await zip.file('xl/sharedStrings.xml').async('string'))
  .matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
const leerHoja = async nombre => {
  const hoja = hojas.find(h => h.nombre === nombre);
  if (!hoja) abortar(`el Excel no tiene la hoja "${nombre}"`);
  const xml = await zip.file(hoja.parte).async('string');
  const d = xml.indexOf('<sheetData>') + 11, h = xml.indexOf('</sheetData>');
  return [...xml.slice(d, h).matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map(m => {
    const celdas = {};
    for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2] || '', dentro = c[3] || '';
      const v = /<v>([^<]*)<\/v>/.exec(dentro);
      const inline = /<is>[\s\S]*?<t[^>]*>([^<]*)<\/t>/.exec(dentro);
      let valor = '';
      if (inline) valor = inline[1];
      else if (v) valor = /t="s"/.test(attrs) ? (cadenas[+v[1]] ?? '') : v[1];
      celdas[c[1]] = String(valor).trim();
    }
    return { r: +m[1], c: celdas };
  });
};
const aISO = s => new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000).toISOString().slice(0, 10);

// --- 2 · re-derivar ULT. M1 --------------------------------------------------------
sec('2 · ULT. M1 RE-DERIVADO Y CONTRASTADO CONTRA EL VALOR DE LA HOJA');
const activasExcel = (await leerHoja('IMP_UNIDADES')).filter(f => f.r >= 2 && f.c.A).map(f => f.c.A);
const inspecciones = (await leerHoja('Inspecciones')).filter(f => f.r >= 2 && (f.c.M || '') !== '');
const registro = (await leerHoja('REGISTRO')).filter(f => f.r >= 8 && Object.values(f.c).some(v => v !== ''));
const tipr = (await leerHoja('TI-PR-01')).filter(f => f.r >= 8 && f.c.C);

const porPlaca = {};
for (const f of inspecciones) {
  const p = (f.c.M || '').toUpperCase(), n = f.c.N;
  if (!p || !n || !/^\d+(\.\d+)?$/.test(n)) continue;
  (porPlaca[p] = porPlaca[p] || []).push({
    fila: f.r, serial: Math.floor(+n), iso: aISO(n),
    placaOrigen: f.c.B || '', hora: f.c.E || '',
    tablet: f.c.F || '', radio: f.c.G || '', camaras: f.c.H || ''
  });
}
const enHoja = {};
for (const f of tipr) enHoja[f.c.C] = f;

console.log(`   hoja Inspecciones : ${inspecciones.length} filas con Placa Norm. y Fecha Real`);
console.log(`   hoja REGISTRO     : ${registro.length} intervenciones desde la fila 8`);
const baseRellenas = tipr.filter(f => (f.c.AC || '') !== '' || (f.c.AD || '') !== '' || (f.c.AE || '') !== '').length;
console.log(`   BASE M1/M2/M3     : ${baseRellenas} filas con alguna celda rellena`);
chk(registro.length === 0 && baseRellenas === 0,
  'la formula colapsa a ULT. M1 = ULT. INSPECCION',
  `REGISTRO=${registro.length} intervenciones · BASE=${baseRellenas} celdas`);

const M1 = {};
let discrepancias = [];
for (const placa of activasExcel) {
  const filas = (porPlaca[placa.toUpperCase()] || []).slice().sort((a, b) => b.serial - a.serial || a.fila - b.fila);
  const derivado = filas.length ? filas[0].serial : null;
  const f = enHoja[placa];
  const cacheado = f && f.c.I && /^\d+(\.\d+)?$/.test(f.c.I) ? Math.floor(+f.c.I) : null;
  if (derivado !== cacheado) discrepancias.push(`${placa}: derivado=${derivado} hoja=${cacheado}`);
  M1[placa] = derivado ? {
    serial: derivado, iso: aISO(derivado),
    filaFuente: filas.filter(x => x.serial === derivado).sort((a, b) => a.fila - b.fila)[0]
  } : null;
}
chk(discrepancias.length === 0, 'mi re-derivacion coincide con la columna I de la hoja',
  discrepancias.length ? discrepancias.slice(0, 6).join(' | ') : `${activasExcel.length}/${activasExcel.length} unidades`);
if (fallos > 0) abortar('la lectura del Excel no cuadra. No se abre transaccion.');

// convencion de calendario autorizada solo para la siembra inicial
const quincenaCalendario = iso => {
  const dia = +iso.slice(8, 10);
  return `${iso.slice(0, 8)}${dia <= 15 ? '01' : '16'}`;
};

// --- 3 · base de datos ------------------------------------------------------------
const { pool } = await import(pathToFileURL(resolve(BACKEND, 'src/config/database.js')).href);
let anfitrion = '';
{
  const u = new URL(process.env.DATABASE_URL);
  anfitrion = u.hostname;
  secretos.push(process.env.DATABASE_URL, u.href, u.host, u.hostname, u.username, u.password);
  secretos.sort((a, b) => (b || '').length - (a || '').length);
}
const cliente = await pool.connect();
const una = async (sql, p) => (await cliente.query(sql, p)).rows[0];
const filasDe = async t => (await una(`SELECT count(*)::int AS n FROM ${t}`)).n;
let confirmado = false;

try {
  sec('3 · PRECONDICIONES');
  const id = await una(`SELECT current_database() AS db, current_schema() AS esquema, pg_is_in_recovery() AS replica`);
  const endpoint = (anfitrion.split('.')[0] || '').replace(/-pooler$/, '').slice(-4);
  console.log(`   ${id.db} · ${id.esquema} · endpoint ...${endpoint}`);
  chk(id.db === 'neondb' && id.esquema === 'public' && id.replica === false,
    'base, esquema y no-replica', `${id.db}/${id.esquema} replica=${id.replica}`);

  const prog = await una(`SELECT id, codigo FROM programas_mantenimiento WHERE codigo = $1`, [CODIGO]);
  if (!prog) abortar(`el programa ${CODIGO} no existe. Fase B (B0..B3) debe estar cargada.`);
  chk(true, `programa ${CODIGO} presente`, `programa_id interno asignado`);

  const { rows: unidades } = await cliente.query(
    `SELECT id, programa_id, placa FROM programa_mantenimiento_unidades WHERE programa_id = $1 ORDER BY placa`,
    [prog.id]);
  chk(unidades.length === 174, 'unidades activas del programa', `${unidades.length}`);
  const soloEnBD = unidades.map(u => u.placa).filter(p => !activasExcel.includes(p));
  const soloEnExcel = activasExcel.filter(p => !unidades.some(u => u.placa === p));
  chk(soloEnBD.length === 0 && soloEnExcel.length === 0,
    'el conjunto de la BD coincide con IMP_UNIDADES',
    `solo BD=${soloEnBD.length} solo Excel=${soloEnExcel.length}`);
  chk(!unidades.some(u => u.placa === 'V5K756'), 'V5K756 no esta en el programa activo', 'fuera, como corresponde');

  const ciclosPrevios = await filasDe('programa_mantenimiento_unidad_ciclos');
  if (ciclosPrevios > 0) {
    abortar(`programa_mantenimiento_unidad_ciclos ya tiene ${ciclosPrevios} filas.\n`
          + `  B4 es una siembra inicial y no sobreescribe. Decide primero que hacer con lo cargado.`);
  }
  chk(ciclosPrevios === 0, 'programa_mantenimiento_unidad_ciclos vacia', '0 filas');

  // punto 10 · frecuencias M1 y la FK real
  sec('4 · FRECUENCIAS M1 Y LA FK REAL DE ciclos');
  const { rows: frec } = await cliente.query(
    `SELECT tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
       FROM programa_mantenimiento_frecuencias
      WHERE programa_id = $1 AND nivel_mantenimiento = 'M1' ORDER BY tipo_equipo`, [prog.id]);
  console.log(`   periodicidades M1 declaradas en el programa:`);
  for (const f of frec) console.log(`      ${f.tipo_equipo.padEnd(12)} ${f.nivel_mantenimiento} = ${f.frecuencia_quincenas} quincena(s)`);
  for (const fam of FAMILIAS)
    chk(frec.some(f => f.tipo_equipo === fam), `existe periodicidad ${fam}/M1`, 'declarada');
  chk(!frec.some(f => f.tipo_equipo === 'GPS'), 'no existe periodicidad GPS/M1', 'GPS solo tiene M3');

  const { rows: fks } = await cliente.query(`
    SELECT con.conname, con.confrelid::regclass::text AS destino,
      (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.conrelid = to_regclass('public.programa_mantenimiento_unidad_ciclos')
    ORDER BY con.conname`);
  console.log(`\n   FK reales de programa_mantenimiento_unidad_ciclos:`);
  for (const f of fks) console.log(`      ${f.conname.padEnd(24)} (${f.cols}) -> ${f.destino}`);
  const haciaFrecuencias = fks.filter(f => f.destino === 'programa_mantenimiento_frecuencias');
  console.log(`   FK hacia programa_mantenimiento_frecuencias: ${haciaFrecuencias.length}`);
  if (haciaFrecuencias.length === 0) {
    console.log(`   NOTA: no existe FK de ciclos hacia frecuencias. La retiro 20260922_003`);
    console.log(`         (fk_ciclo_frecuencia) y 20260923_004 no la restituyo, a proposito:`);
    console.log(`         asi un cambio de reglas del programa no borra el historico de ciclos.`);
    console.log(`         El dominio lo sostienen chk_ciclo_tipo_equipo y chk_ciclo_nivel.`);
  }
  // por eso comprobamos la coherencia nosotros, no la FK
  const combinacionesValidas = new Set(frec.map(f => f.tipo_equipo));

  // --- 5 · proyeccion del inventario ---------------------------------------------
  sec('5 · PROYECCION DEL INVENTARIO POR FAMILIA');
  const { rows: proy } = await cliente.query(`
    WITH fam AS (
      SELECT u.id AS programa_unidad_id, u.programa_id, u.placa,
             CASE
               WHEN e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO')       THEN 'DVR'
               WHEN e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA') THEN 'CAMARAS'
               WHEN e.tipo_equipo = 'COPILOTO'                            THEN 'COPILOTO'
               WHEN e.tipo_equipo = 'RADIO_BASE'                          THEN 'RADIO_BASE'
             END AS familia,
             e.tipo_equipo, e.estado_inventario
        FROM programa_mantenimiento_unidades u
        JOIN vehiculo_equipos e ON e.placa = u.placa
       WHERE u.programa_id = $1
         AND e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO','CAMARA_INTERNA','CAMARA_EXTERNA','COPILOTO','RADIO_BASE')
    )
    SELECT programa_unidad_id, programa_id, placa, familia,
           count(*) FILTER (WHERE estado_inventario = 'INSTALADO')::int   AS inst,
           count(*) FILTER (WHERE estado_inventario = 'NO_APLICA')::int   AS na,
           count(*) FILTER (WHERE estado_inventario = 'POR_VALIDAR')::int AS pv,
           CASE
             WHEN count(*) FILTER (WHERE estado_inventario = 'INSTALADO') > 0 THEN 'APLICA'
             WHEN count(*) FILTER (WHERE estado_inventario = 'NO_APLICA') = count(*) THEN 'NO_APLICA'
             ELSE 'PENDIENTE'
           END AS clasificacion,
           string_agg(tipo_equipo || '=' || estado_inventario, ' ' ORDER BY tipo_equipo) AS detalle
      FROM fam GROUP BY 1,2,3,4`, [prog.id]);
  chk(proy.length === 174 * 4, 'combinaciones unidad x familia evaluadas', `${proy.length} (174 x 4)`);

  // --- 6 · construir las filas ---------------------------------------------------
  const filasB4 = [];
  const discrepanciasInv = [];
  const matriz = { DVR: {}, CAMARAS: {}, COPILOTO: {}, RADIO_BASE: {} };
  for (const f of FAMILIAS) matriz[f] = { APLICA_CON_M1: 0, APLICA_SIN_M1: 0, NO_APLICA: 0, PENDIENTE: 0 };
  for (const r of proy) {
    const ref = M1[r.placa];
    const cat = r.clasificacion;
    if (cat === 'NO_APLICA') { matriz[r.familia].NO_APLICA++; continue; }
    if (cat === 'PENDIENTE') { matriz[r.familia].PENDIENTE++; continue; }
    if (!ref) { matriz[r.familia].APLICA_SIN_M1++; continue; }
    matriz[r.familia].APLICA_CON_M1++;
    const src = ref.filaFuente;
    const estado = `Tablet=${src.tablet || '(vacio)'} RadioBase=${src.radio || '(vacio)'} Camaras=${src.camaras || '(vacio)'}`;
    let obs = `M1 inicial sembrado del Excel TI-PR-01 (SHA-256 ${EXCEL_SHA256.slice(0, 12)}...). `
            + `ULT. M1 = ULT. INSPECCION: hoja Inspecciones fila ${src.fila}, placa origen "${src.placaOrigen}", `
            + `fecha real ${ref.iso}${src.hora ? ' ' + src.hora : ''}. Estado hallado en esa fila: ${estado}. `
            + `ultima_quincena por convencion de calendario autorizada solo para la siembra inicial `
            + `(dia 1-15 -> dia 1; dia 16-fin -> dia 16); el libro no registro la quincena administrativa.`;
    if (r.familia === 'DVR') {
      obs += ` El DVR forma parte de la revision de camaras (regla de negocio aprobada): `
           + `la hoja Inspecciones no tiene columna propia de DVR.`;
    }
    if (/error|falta revision/i.test(estado)) {
      obs += ` La fila fuente registra Error o Falta revision; por decision expresa eso no invalida el M1 inicial.`;
    }
    // Discrepancia objetiva: el inventario STATUS dice que la familia aplica, pero el
    // campo correspondiente de esa fila historica de Inspecciones dice "No Aplica".
    // Manda el inventario (decision de negocio). Solo se anota, sin alterar nada.
    const campoInsp = { COPILOTO: ['Tablet', src.tablet],
                        RADIO_BASE: ['Radio Base', src.radio],
                        CAMARAS: ['Camaras', src.camaras],
                        DVR: ['Camaras', src.camaras] }[r.familia];
    if (campoInsp && /^no aplica$/i.test((campoInsp[1] || '').trim())) {
      discrepanciasInv.push({ placa: r.placa, familia: r.familia, campo: campoInsp[0],
                           fila: src.fila, fecha: ref.iso, inventario: r.detalle });
      obs += ` DISCREPANCIA: el inventario STATUS da esta familia como instalada, pero`
           + ` la fila ${src.fila} de la hoja Inspecciones registra "${campoInsp[0]} = No Aplica".`
           + ` Manda el inventario por decision de negocio; no se altero la fecha ni el inventario.`;
    }
    filasB4.push({
      programa_unidad_id: r.programa_unidad_id,
      programa_id: r.programa_id,
      placa: r.placa,
      tipo_equipo: r.familia,
      nivel_mantenimiento: 'M1',
      ultima_quincena: quincenaCalendario(ref.iso),
      ultima_fecha_real: ref.iso,
      fuente: FUENTE,
      observaciones: obs,
      _inventario: r.detalle,
      _estadoInsp: estado,
      _filaInsp: src.fila
    });
  }

  sec('6 · MATRIZ POR FAMILIA');
  console.log(`   familia       APLICA con M1   APLICA sin M1   NO_APLICA   PENDIENTE   total`);
  for (const f of FAMILIAS) {
    const m = matriz[f];
    const t = m.APLICA_CON_M1 + m.APLICA_SIN_M1 + m.NO_APLICA + m.PENDIENTE;
    console.log(`   ${f.padEnd(13)} ${String(m.APLICA_CON_M1).padStart(13)} ${String(m.APLICA_SIN_M1).padStart(15)} ${String(m.NO_APLICA).padStart(11)} ${String(m.PENDIENTE).padStart(11)} ${String(t).padStart(7)}`);
  }
  const conM1 = activasExcel.filter(p => M1[p]), sinM1 = activasExcel.filter(p => !M1[p]);
  console.log(`\n   unidades activas          : ${activasExcel.length}`);
  console.log(`   con ULT. M1               : ${conM1.length}`);
  console.log(`   sin ULT. M1               : ${sinM1.length}`);
  console.log(`   FILAS QUE B4 INSERTARIA   : ${filasB4.length}`);
  console.log(`   unidades implicadas       : ${new Set(filasB4.map(f => f.placa)).size}`);

  // --- 7 · insertar ---------------------------------------------------------------
  sec('7 · INSERCION EN UNA SOLA TRANSACCION');
  await cliente.query('BEGIN');
  let insertadas = 0;
  const LOTE = 200;
  for (let i = 0; i < filasB4.length; i += LOTE) {
    const t = filasB4.slice(i, i + LOTE);
    const r = await cliente.query(`INSERT INTO programa_mantenimiento_unidad_ciclos
        (programa_unidad_id, programa_id, tipo_equipo, nivel_mantenimiento,
         ultima_quincena, ultima_fecha_real, fuente, observaciones)
      SELECT * FROM unnest($1::int[], $2::int[], $3::varchar[], $4::varchar[],
                           $5::date[], $6::date[], $7::varchar[], $8::text[])`,
      [t.map(x => x.programa_unidad_id), t.map(x => x.programa_id), t.map(x => x.tipo_equipo),
       t.map(x => x.nivel_mantenimiento), t.map(x => x.ultima_quincena), t.map(x => x.ultima_fecha_real),
       t.map(x => x.fuente), t.map(x => x.observaciones)]);
    insertadas += r.rowCount;
  }
  console.log(`   ${insertadas} filas insertadas en ${Math.ceil(filasB4.length / LOTE)} lote(s)`);
  chk(insertadas === filasB4.length, 'todas las filas previstas se insertaron', `${insertadas}/${filasB4.length}`);

  // --- 8 · validaciones ----------------------------------------------------------
  sec('8 · VALIDACIONES SOBRE LO INSERTADO');
  const c = await una(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE nivel_mantenimiento <> 'M1')::int AS no_m1,
      count(*) FILTER (WHERE tipo_equipo = 'GPS')::int AS gps,
      count(*) FILTER (WHERE tipo_equipo = 'ADAS')::int AS adas,
      count(*) FILTER (WHERE tipo_equipo NOT IN ('DVR','CAMARAS','COPILOTO','RADIO_BASE'))::int AS fuera_familia,
      count(*) FILTER (WHERE fuente <> 'EXCEL')::int AS otra_fuente,
      count(*) FILTER (WHERE ultima_fecha_real IS NULL)::int AS sin_fecha,
      count(*) FILTER (WHERE ultima_fecha_real > (now() AT TIME ZONE 'America/Lima')::date)::int AS futuras,
      ((now() AT TIME ZONE 'America/Lima')::date)::text AS hoy_lima,
      CURRENT_DATE::text AS hoy_pg,
      count(*) FILTER (WHERE EXTRACT(day FROM ultima_quincena) NOT IN (1,16))::int AS quincena_mala,
      count(*) FILTER (WHERE ultima_fecha_real < ultima_quincena)::int AS fecha_antes_de_quincena,
      count(DISTINCT programa_unidad_id)::int AS unidades,
      min(ultima_fecha_real)::text AS fmin, max(ultima_fecha_real)::text AS fmax
    FROM programa_mantenimiento_unidad_ciclos`);
  chk(c.total === filasB4.length, 'total de ciclos', `${c.total}`);
  const { rows: porFam } = await cliente.query(`SELECT tipo_equipo, nivel_mantenimiento,
      count(*)::int AS filas, count(DISTINCT programa_unidad_id)::int AS unidades
    FROM programa_mantenimiento_unidad_ciclos GROUP BY 1,2 ORDER BY 1,2`);
  console.log(`   desglose leido de la base:`);
  for (const f of porFam)
    console.log(`      ${(f.tipo_equipo + '/' + f.nivel_mantenimiento).padEnd(16)} ${String(f.filas).padStart(5)} filas · ${f.unidades} unidades`);
  console.log(`      ${'TOTAL'.padEnd(16)} ${String(porFam.reduce((a, f) => a + f.filas, 0)).padStart(5)} filas`);
  const esperadoFam = { 'DVR/M1': 145, 'CAMARAS/M1': 145, 'COPILOTO/M1': 122, 'RADIO_BASE/M1': 119 };
  const desvios = porFam.filter(f => esperadoFam[f.tipo_equipo + '/' + f.nivel_mantenimiento] !== f.filas);
  chk(desvios.length === 0 && porFam.length === 4, 'desglose por familia igual al esperado',
    desvios.length ? desvios.map(f => `${f.tipo_equipo}/${f.nivel_mantenimiento}=${f.filas}`).join(' ') : 'DVR 145 · CAMARAS 145 · COPILOTO 122 · RADIO_BASE 119');
  chk(c.no_m1 === 0, 'todas son nivel M1', `${c.no_m1} con otro nivel`);
  chk(c.gps === 0, '0 GPS en M1', `${c.gps}`);
  chk(c.adas === 0, '0 ADAS', `${c.adas}`);
  chk(c.fuera_familia === 0, 'solo las 4 familias mantenibles', `${c.fuera_familia} fuera`);
  chk(c.otra_fuente === 0, `fuente = 'EXCEL' en todas`, `${c.otra_fuente} con otra fuente`);
  chk(c.sin_fecha === 0, 'todas tienen ultima_fecha_real', `${c.sin_fecha} sin fecha`);
  console.log(`   hoy en America/Lima = ${c.hoy_lima} · CURRENT_DATE de PostgreSQL = ${c.hoy_pg}`
    + `${c.hoy_lima !== c.hoy_pg ? '  <-- diferentes: se usa el de Lima' : ''}`);
  chk(c.futuras === 0, '0 fechas futuras (hoy en hora de Lima)', `rango ${c.fmin} .. ${c.fmax}`);
  chk(c.quincena_mala === 0, 'ultima_quincena siempre dia 1 o 16', `${c.quincena_mala} fuera de regla`);

  // dia exacto conservado: comparacion fila a fila contra el Excel
  const { rows: enBD } = await cliente.query(`SELECT u.placa, k.tipo_equipo,
      k.ultima_fecha_real::text AS fecha, k.ultima_quincena::text AS quincena
    FROM programa_mantenimiento_unidad_ciclos k
    JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id`);
  let fechaOk = 0, fechaMal = [];
  for (const r of enBD) {
    if (M1[r.placa] && M1[r.placa].iso === r.fecha) fechaOk++;
    else fechaMal.push(`${r.placa}/${r.tipo_equipo}: BD=${r.fecha} Excel=${M1[r.placa]?.iso}`);
  }
  chk(fechaMal.length === 0, 'ultima_fecha_real identica al Excel, fila a fila',
    fechaMal.length ? fechaMal.slice(0, 5).join(' | ') : `${fechaOk}/${enBD.length} coinciden`);
  let quincenaMal = enBD.filter(r => quincenaCalendario(r.fecha) !== r.quincena);
  chk(quincenaMal.length === 0, 'ultima_quincena = convencion de calendario aplicada a la fecha real',
    quincenaMal.length ? quincenaMal.slice(0, 5).map(r => `${r.placa}:${r.fecha}->${r.quincena}`).join(' ') : 'todas coherentes');
  const diaDistinto = enBD.filter(r => ![1, 16].includes(+r.fecha.slice(8, 10)));
  chk(diaDistinto.length > 0, 'la fecha real NO se normalizo',
    `${diaDistinto.length} filas con dia distinto de 1 o 16 (si fueran 0, se habria normalizado)`);

  const dup = await una(`SELECT count(*)::int AS n FROM (
    SELECT programa_unidad_id, tipo_equipo, nivel_mantenimiento
      FROM programa_mantenimiento_unidad_ciclos
     GROUP BY 1,2,3 HAVING count(*) > 1) x`);
  chk(dup.n === 0, '0 duplicados unidad/equipo/nivel', `${dup.n}`);
  const fuera = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos k
    WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u
                       WHERE u.id = k.programa_unidad_id AND u.programa_id = k.programa_id)`);
  chk(fuera.n === 0, '0 ciclos fuera de las 174 unidades del programa', `${fuera.n}`);
  const v5 = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos k
    JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id WHERE u.placa = 'V5K756'`);
  chk(v5.n === 0, '0 ciclos de V5K756', `${v5.n}`);
  const malInv = await una(`SELECT count(*)::int AS n
    FROM programa_mantenimiento_unidad_ciclos k
    JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id
    WHERE NOT EXISTS (
      SELECT 1 FROM vehiculo_equipos e
       WHERE e.placa = u.placa AND e.estado_inventario = 'INSTALADO'
         AND ((k.tipo_equipo = 'DVR'        AND e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO'))
           OR (k.tipo_equipo = 'CAMARAS'    AND e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA'))
           OR (k.tipo_equipo = 'COPILOTO'   AND e.tipo_equipo = 'COPILOTO')
           OR (k.tipo_equipo = 'RADIO_BASE' AND e.tipo_equipo = 'RADIO_BASE')))`);
  chk(malInv.n === 0, 'toda fila tiene al menos un componente INSTALADO',
    `${malInv.n} sin respaldo de inventario (0 NO_APLICA y 0 POR_VALIDAR sembrados)`);
  const malFam = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos k
    WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_frecuencias f
       WHERE f.programa_id = k.programa_id AND f.tipo_equipo = k.tipo_equipo
         AND f.nivel_mantenimiento = k.nivel_mantenimiento)`);
  chk(malFam.n === 0, 'toda combinacion existe en programa_mantenimiento_frecuencias', `${malFam.n} sin periodicidad`);
  const m2m3 = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos WHERE nivel_mantenimiento IN ('M2','M3')) AS ciclos,
    (SELECT count(*)::int FROM programacion_mantenimiento) AS prog,
    (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS det`);
  chk(m2m3.ciclos === 0 && m2m3.prog === 0 && m2m3.det === 0,
    '0 ciclos M2/M3, 0 programaciones, 0 detalles', `${m2m3.ciclos}/${m2m3.prog}/${m2m3.det}`);

  // --- 9 · distribucion por quincena ---------------------------------------------
  sec('9 · DISTRIBUCION POR ultima_quincena');
  const { rows: dist } = await cliente.query(`SELECT ultima_quincena::text AS q,
      count(*)::int AS filas, count(DISTINCT programa_unidad_id)::int AS unidades
    FROM programa_mantenimiento_unidad_ciclos GROUP BY 1 ORDER BY 1`);
  console.log(`   quincena      filas   unidades`);
  let antes = 0, sep1 = 0, sep16 = 0, posterior = 0;
  for (const d of dist) {
    console.log(`   ${d.q}  ${String(d.filas).padStart(7)} ${String(d.unidades).padStart(10)}`);
    if (d.q < '2026-09-01') antes += d.filas;
    else if (d.q === '2026-09-01') sep1 = d.filas;
    else if (d.q === '2026-09-16') sep16 = d.filas;
    else posterior += d.filas;
  }
  console.log(`\n   anteriores a 2026-09-01 : ${antes} filas`);
  console.log(`   2026-09-01              : ${sep1} filas`);
  console.log(`   2026-09-16              : ${sep16} filas`);
  console.log(`   posteriores a 2026-09-16: ${posterior} filas`);

  // --- 10 · unidades sin M1 ------------------------------------------------------
  sec('10 · UNIDADES SIN ULT. M1 · NO GENERAN CICLOS');
  console.log(`   son ${sinM1.length}:`);
  for (let i = 0; i < sinM1.length; i += 10) console.log(`      ${sinM1.slice(i, i + 10).join(' ')}`);
  const conCiclo = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos k
    JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id
    WHERE u.placa = ANY($1)`, [sinM1]);
  chk(conCiclo.n === 0, 'ninguna unidad sin M1 genero ciclos', `${conCiclo.n} filas`);

  // --- 11 · Error / Falta revision ----------------------------------------------
  sec('11 · CASOS CON Error / Falta revision · SE SIEMBRAN IGUAL');
  const conError = filasB4.filter(f => /error|falta revision/i.test(f._estadoInsp));
  const unidadesError = [...new Set(conError.map(f => f.placa))];
  console.log(`   unidades afectadas: ${unidadesError.length} · filas generadas: ${conError.length}`);
  console.log(`\n   placa    fecha_real  quincena    familias sembradas          estado original en la fila fuente`);
  for (const p of unidadesError) {
    const fs = conError.filter(x => x.placa === p);
    console.log(`   ${p.padEnd(8)} ${fs[0].ultima_fecha_real}  ${fs[0].ultima_quincena}  ${fs.map(x => x.tipo_equipo).join(',').padEnd(26)} ${fs[0]._estadoInsp}`);
  }
  const verifErr = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_ciclos k
    JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id
    WHERE u.placa = ANY($1)`, [unidadesError]);
  chk(verifErr.n === conError.length, 'los casos con Error/Falta revision estan sembrados',
    `${verifErr.n} filas en la base`);

  // --- 11-bis · discrepancias inventario vs inspeccion ---------------------------
  sec('11-bis · DISCREPANCIA INVENTARIO STATUS vs FILA HISTORICA DE Inspecciones');
  const unidadesDisc = [...new Set(discrepanciasInv.map(x => x.placa))];
  console.log(`   filas con nota de discrepancia: ${discrepanciasInv.length} · unidades: ${unidadesDisc.length}`);
  console.log(`   criterio: el inventario da la familia como instalada y la fila fuente dice "No Aplica".`);
  console.log(`   manda el inventario; solo se anota.`);
  if (unidadesDisc.length) {
    console.log(`
   placa    fecha       familias con nota            fila Inspecciones`);
    for (const p of unidadesDisc) {
      const xs = discrepanciasInv.filter(x => x.placa === p);
      console.log(`   ${p.padEnd(8)} ${xs[0].fecha}  ${xs.map(x => x.familia).join(',').padEnd(27)} ${xs[0].fila}`);
    }
    const ej = discrepanciasInv.find(x => x.placa === 'VDO941') || discrepanciasInv[0];
    const fila = filasB4.find(f => f.placa === ej.placa && f.tipo_equipo === ej.familia);
    console.log(`
   observaciones completas de ${ej.placa} / ${ej.familia}:`);
    console.log(`   ---8<---`);
    for (const linea of (fila.observaciones.match(/.{1,96}(\s|$)/g) || [])) console.log(`   ${linea.trim()}`);
    console.log(`   ---8<---`);
  }

  // --- 12 · DVR -----------------------------------------------------------------
  sec('12 · DVR · EVIDENCIA A PARTIR DE LA INSPECCION GENERAL DE LA UNIDAD');
  const dvr = filasB4.filter(f => f.tipo_equipo === 'DVR');
  console.log(`   filas DVR/M1 generadas: ${dvr.length}`);
  console.log(`   la hoja Inspecciones no tiene columna de DVR; se aplica la regla aprobada:`);
  console.log(`   "el DVR forma parte de la revision de camaras".`);
  console.log(`\n   placa    fecha_real  quincena    inventario DVR                              estado de camaras en la fila fuente`);
  for (const f of dvr.slice(0, 6))
    console.log(`   ${f.placa.padEnd(8)} ${f.ultima_fecha_real}  ${f.ultima_quincena}  ${f._inventario.padEnd(43)} ${f._estadoInsp.split('Camaras=')[1]}`);
  const dvrConCamaras = dvr.filter(f => filasB4.some(x => x.placa === f.placa && x.tipo_equipo === 'CAMARAS'));
  console.log(`\n   filas DVR cuya unidad tambien recibio ciclo CAMARAS: ${dvrConCamaras.length} de ${dvr.length}`);
  const dvrSinCamaras = dvr.filter(f => !filasB4.some(x => x.placa === f.placa && x.tipo_equipo === 'CAMARAS'));
  if (dvrSinCamaras.length) {
    console.log(`   filas DVR sin ciclo CAMARAS en la misma unidad: ${dvrSinCamaras.length}`);
    for (const f of dvrSinCamaras) console.log(`      ${f.placa}  inventario: ${f._inventario}`);
  }

  // --- 13 · cierre ---------------------------------------------------------------
  sec(`13 · CIERRE · ${aciertos} OK · ${fallos} FALLAS`);
  if (fallos > 0) {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK POR FALLOS. La base queda exactamente como estaba.');
  } else if (modo === 'ENSAYO') {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK ejecutado (modo ensayo). Nada se ha guardado.');
    console.log('   Para cargar de verdad: repetir con --confirmar');
  } else {
    await cliente.query('COMMIT');
    confirmado = true;
    console.log('   COMMIT ejecutado. Las referencias M1 quedan sembradas.');
  }
} catch (error) {
  fallos++;
  console.error(`\n   *** EXCEPCION ***  ${error.code || ''} ${error.message}`);
  if (error.detail)     console.error(`   detalle: ${error.detail}`);
  if (error.constraint) console.error(`   constraint: ${error.constraint}`);
  try { await cliente.query('ROLLBACK'); console.error('   ROLLBACK ejecutado.'); } catch { /* ya cerrada */ }
} finally {
  cliente.release();
  await pool.end();
}
console.log(`\nRESULTADO B4: ${fallos > 0 ? 'NO CARGADA' : confirmado ? 'CARGADA (COMMIT)' : 'ensayo correcto, revertido'}`);
process.exit(fallos > 0 ? 2 : 0);
