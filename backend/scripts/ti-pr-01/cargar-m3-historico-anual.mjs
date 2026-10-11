// =====================================================================================
// TI-PR-01 · REFERENCIAS HISTORICAS M3 DE LAS FAMILIAS ANUALES (GPS y ADAS Tracklog)
// =====================================================================================
//   node backend/scripts/ti-pr-01/cargar-m3-historico-anual.mjs --ensayo     prueba, ROLLBACK
//   node backend/scripts/ti-pr-01/cargar-m3-historico-anual.mjs --confirmar  carga real, COMMIT
//
// Sin bandera no hace nada: obliga a declarar la intencion.
//
// Puebla EXCLUSIVAMENTE programa_mantenimiento_unidad_ciclos con nivel M3 y tipo_equipo
// GPS o ADAS. No crea M1, M2, programacion, detalles ni OT. No toca el Excel, ni
// vehiculo_equipos, ni vehiculos, ni las periodicidades, ni ninguna otra tabla.
//
// Requiere la migracion 20260924_009 aplicada: antes de ella el dominio de
// chk_ciclo_tipo_equipo no admitia 'ADAS' y chk_ciclo_gps_solo_m3 se llamaba asi.
// El script lo comprueba y aborta si no esta.
//
// -------------------------------------------------------------------------------------
// DE DONDE SALE CADA DATO · NADA SE INVENTA NI SE CODIFICA A MANO
// -------------------------------------------------------------------------------------
// Ni las placas ni las fechas ni el numero de filas estan escritos en este fichero. Todo
// se deriva en tiempo de ejecucion de dos fuentes, y se cruza entre ellas:
//
//   1. hoja HISTORICO_GPS del Excel   -> que mantenimiento M3 se ejecuto y cuando
//   2. tabla vehiculo_equipos          -> que equipo hay HOY instalado y de que proveedor
//
// Los totales que aparecen abajo son BARRERAS de seguridad: si la derivacion no da
// exactamente eso, el script aborta y no inserta nada. No son la fuente del dato.
//
// -------------------------------------------------------------------------------------
// LA HOJA HISTORICO_GPS
// -------------------------------------------------------------------------------------
// Contiene referencias historicas M3 de GPS y de ADAS Tracklog. ADAS de otros
// proveedores puede permanecer en inventario, pero no participa del programa TI-PR-01
// mientras la regla de negocio aplicable sea unicamente ADAS Tracklog.
//
//   A PLACA    con guion; el sufijo _EVO4 marca los registros de ADAS
//   B CATEGORIA  formula sobre ese sufijo: IF(ISNUMBER(SEARCH("_EVO4",A)),"ADAS","GPS")
//   C FECHA_MANTENIMIENTO 2025   puede decir "NUEVO EQUIPO"
//   D FECHA_MANTENIMIENTO 2026
//   E NIVEL      M3 en las 194 filas
//   F OT/EVIDENCIA y G OBSERVACION   vacias en las 194 filas
//   H FECHA_MANTENIMIENTO ACTUALIZADA = IF(D<>"",D,C)   <- la fecha que se usa
//
// El script no confia en la categoria cacheada en B: la RE-DERIVA del sufijo de A y
// aborta si las dos no coinciden en las 194 filas.
//
// "NUEVO EQUIPO" es un marcador de instalacion, no de mantenimiento. Una fila con C =
// NUEVO EQUIPO y D vacia no tiene fecha de mantenimiento y NO genera ciclo. LA FECHA DE
// INSTALACION NO ES UN MANTENIMIENTO M3.
//
// -------------------------------------------------------------------------------------
// LA PLACA COMO CLAVE
// -------------------------------------------------------------------------------------
// La hoja escribe la placa con guion ("V0R-877") y el modelo la guarda en forma canonica
// sin guion ("V0R877"). El propio libro resuelve esa diferencia con SUBSTITUTE(...,"-","")
// en sus formulas MAXIFS, asi que se aplica la MISMA convencion del libro, y solo esa:
//
//   * se retira el sufijo _EVO4, que es el marcador de familia, no parte de la placa
//   * se retira el guion, igual que hace el libro
//   * se pasa a mayusculas
//   * el resultado debe coincidir EXACTAMENTE con programa_mantenimiento_unidades.placa
//
// NO se hace ninguna otra normalizacion. En particular NO se convierte O <-> 0: una
// placa que no empareje exactamente se reporta como no emparejada y no se siembra.
//
// -------------------------------------------------------------------------------------
// QUE FILA GENERA CICLO · REGLA POSITIVA
// -------------------------------------------------------------------------------------
//   GPS/M3   la unidad esta entre las activas del programa
//            Y vehiculo_equipos dice GPS = INSTALADO
//            Y la fila de HISTORICO_GPS tiene fecha en H
//
//   ADAS/M3  lo mismo, y ADEMAS el proveedor actual es Tracklog:
//                estado_inventario = 'INSTALADO' AND marca ILIKE '%TRACKLOG%'
//
// La elegibilidad de ADAS es una lista POSITIVA sobre el valor real del inventario:
//   * no se interpreta MIX TELEMATICS como Tracklog
//   * no se usa "no es MIX" como criterio: una lista negativa haria elegible a cualquier
//     proveedor futuro que nadie haya previsto
//   * no se empareja por la subcadena EVO a secas: aparece dentro de "NUEVO EQUIPO"
//
// Un registro historico de Tracklog en una unidad que hoy lleva otro proveedor se
// CONSERVA COMO EVIDENCIA en el Excel, pero NO genera ciclo activo: el equipo al que se
// refiere ya no esta instalado. POR_VALIDAR nunca se interpreta como INSTALADO.
//
// -------------------------------------------------------------------------------------
// ultima_fecha_real  FRENTE A  ultima_quincena
// -------------------------------------------------------------------------------------
// ultima_fecha_real = el dia exacto de ejecucion, tal como esta en H, sin redondear.
// ultima_quincena   = la quincena administrativa a la que se imputo el mantenimiento.
//
// El libro historico NO registro la quincena administrativa de estas intervenciones.
// Por eso, y SOLO para sembrar el historico inicial, se aplica la misma convencion
// autorizada que en B4:
//     dia 1..15   -> ultima_quincena = DATE(anio, mes, 1)
//     dia 16..fin -> ultima_quincena = DATE(anio, mes, 16)
//
// A PARTIR DE LA PUESTA EN MARCHA DEL ERP ESTA CONVENCION YA NO APLICA: ultima_quincena
// sera la quincena administrativa real de la OT y no se derivara de ultima_fecha_real.
//
// -------------------------------------------------------------------------------------
// ZONA HORARIA
// -------------------------------------------------------------------------------------
// ultima_quincena y ultima_fecha_real son DATE, sin hora ni zona, y su valor sale del
// numero de serie del Excel, que tampoco lleva zona: no hay conversion de huso alguna.
// Donde si importa es en la barrera "fecha futura", asi que el hoy se calcula siempre
// como (now() AT TIME ZONE 'America/Lima')::date, nunca con CURRENT_DATE (la sesion de
// Neon esta en TimeZone='GMT') ni con Date.toISOString() de Node.
//
// -------------------------------------------------------------------------------------
// IDEMPOTENCIA
// -------------------------------------------------------------------------------------
// Esta es una siembra inicial, no un sincronizador. Si ya existe algun ciclo M3 de GPS o
// de ADAS, el script ABORTA sin insertar y sin borrar nada: que hacer con lo ya cargado
// es una decision humana. Los 531 ciclos M1 de B4 deben seguir intactos y se verifican.
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
const EXCEL_SHA256 = '9fba58c9900d4357dd97db92fe32d8756636a5a158905f489790a061b6307a2e';
const CODIGO = 'TI-PR-01';
const HOJA = 'HISTORICO_GPS';
const FUENTE = 'EXCEL';
const NIVEL = 'M3';
const FAMILIAS_ANUALES = ['GPS', 'ADAS'];

// Barreras, no fuente del dato. Si la derivacion no da esto, se aborta.
const ESPERADO = {
  filasHoja: 194,      // filas con placa en HISTORICO_GPS
  gpsHoja: 185,        // de ellas, sin sufijo _EVO4
  adasHoja: 9,         // de ellas, con sufijo _EVO4
  unidades: 174,       // unidades activas del programa
  inventario: 1400,    // filas de vehiculo_equipos
  ciclosM1: 531,       // ciclos M1 ya sembrados por B4
  gpsM3: 156,          // GPS/M3 a sembrar
  adasM3: 1,           // ADAS/M3 a sembrar
  total: 157,
  totalTrasCarga: 688, // 531 + 157
};

const modo = process.argv.includes('--confirmar') ? 'CONFIRMAR'
  : process.argv.includes('--ensayo') ? 'ENSAYO' : null;
const sec = t => console.log(`\n${'='.repeat(94)}\n${t}\n${'='.repeat(94)}`);
let fallos = 0, aciertos = 0;
const chk = (bien, etiqueta, detalle) => {
  if (bien) { aciertos++; console.log(`   [OK]    ${etiqueta.padEnd(52)} ${detalle}`); }
  else { fallos++; console.log(`   [FALLA] ${etiqueta.padEnd(52)} ${detalle}`); }
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

sec(`TI-PR-01 · REFERENCIAS HISTORICAS M3 (GPS + ADAS TRACKLOG) · MODO ${modo}`);

// --- 1 · Excel ---------------------------------------------------------------------
sec('1 · EXCEL FUENTE');
let buf; try { buf = readFileSync(EXCEL); } catch { abortar(`no encuentro el Excel:\n  ${EXCEL}`); }
const sha = createHash('sha256').update(buf).digest('hex');
console.log(`   bytes ${buf.length} · mtime ${statSync(EXCEL).mtime.toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
console.log(`   sha256 ${sha}`);
if (sha !== EXCEL_SHA256) {
  abortar(`el Excel NO es el autorizado para esta carga.\n`
    + `  esperado: ${EXCEL_SHA256}\n  leido:    ${sha}\n`
    + `  Si el cambio es legitimo hay que revalidar la derivacion y actualizar la\n`
    + `  constante a mano. Nunca automaticamente.`);
}
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
const esSerie = s => s !== '' && s != null && /^\d+(\.\d+)?$/.test(s);
const aISO = s => new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000).toISOString().slice(0, 10);
// convencion de calendario autorizada solo para la siembra inicial
const quincenaCalendario = iso => `${iso.slice(0, 8)}${+iso.slice(8, 10) <= 15 ? '01' : '16'}`;
// indice continuo de quincenas: cada anio tiene 24
const idxQuincena = iso => { const [Y, M, D] = iso.split('-').map(Number); return Y * 24 + (M - 1) * 2 + (D >= 16 ? 1 : 0); };
const desdeIdx = i => {
  const Y = Math.floor(i / 24), r = ((i % 24) + 24) % 24;
  return `${Y}-${String(Math.floor(r / 2) + 1).padStart(2, '0')}-${r % 2 === 0 ? '01' : '16'}`;
};
// la placa canonica, con la MISMA convencion que usa el libro: sin _EVO4 y sin guion
const canonica = a => String(a || '').toUpperCase().trim().replace(/_EVO4$/i, '').replace(/-/g, '');
const esTracklog = m => /TRACKLOG/i.test(m || '');

// --- 2 · lectura y re-derivacion de la hoja ----------------------------------------
sec(`2 · HOJA ${HOJA} · LECTURA Y RE-DERIVACION`);
const hojaCruda = await leerHoja(HOJA);
const hist = hojaCruda.filter(f => f.r >= 2 && (f.c.A || '') !== '');
console.log(`   filas con placa (desde la 2) ............... ${hist.length}`);
chk(hist.length === ESPERADO.filasHoja, 'filas de la hoja', `${hist.length} (esperado ${ESPERADO.filasHoja})`);

// la categoria se RE-DERIVA del sufijo; no se confia en el valor cacheado de B
const conSufijo = hist.filter(f => /_EVO4/i.test(f.c.A || ''));
const sinSufijo = hist.filter(f => !/_EVO4/i.test(f.c.A || ''));
const discrepan = hist.filter(f => (f.c.B || '') !== (/_EVO4/i.test(f.c.A || '') ? 'ADAS' : 'GPS'));
chk(discrepan.length === 0, 'la categoria de B coincide con el sufijo _EVO4 de A',
  `${hist.length - discrepan.length}/${hist.length} coinciden`);
chk(sinSufijo.length === ESPERADO.gpsHoja && conSufijo.length === ESPERADO.adasHoja,
  'reparto GPS / ADAS en la hoja', `GPS=${sinSufijo.length} ADAS=${conSufijo.length}`);

const niveles = [...new Set(hist.map(f => f.c.E || '(vacio)'))];
chk(niveles.length === 1 && niveles[0] === NIVEL, `la hoja declara un unico nivel y es ${NIVEL}`, niveles.join(' '));

// H es la fecha a usar; se comprueba que reproduce IF(D<>"",D,C)
const reH = hist.filter(f => {
  const esperado = esSerie(f.c.D) ? f.c.D : (esSerie(f.c.C) ? f.c.C : '');
  const leido = esSerie(f.c.H) ? f.c.H : '';
  return Math.floor(+esperado || 0) !== Math.floor(+leido || 0);
});
chk(reH.length === 0, 'H re-derivada = IF(D<>"",D,C) en todas las filas',
  `${hist.length - reH.length}/${hist.length}`);

const sinFecha = hist.filter(f => !esSerie(f.c.H));
console.log(`   filas sin fecha en H ....................... ${sinFecha.length}`);
for (const f of sinFecha) console.log(`      fila ${String(f.r).padStart(4)} ${String(f.c.A).padEnd(14)} C="${f.c.C}" D="${f.c.D}"`);
const noSerie = hist.filter(f => ['C', 'D', 'H'].some(k => (f.c[k] || '') !== '' && !esSerie(f.c[k]) && !/^NUEVO EQUIPO$/i.test(f.c[k])));
chk(noSerie.length === 0, 'ninguna fecha con texto no reconocido',
  noSerie.length ? noSerie.map(f => `fila ${f.r}="${f.c.C}|${f.c.D}|${f.c.H}"`).join(' ') : '0');

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
  const id = await una(`SELECT current_database() AS db, current_schema() AS esquema,
    pg_is_in_recovery() AS replica, current_setting('default_transaction_read_only') AS ro`);
  const endpoint = (anfitrion.split('.')[0] || '').replace(/-pooler$/, '').slice(-4);
  console.log(`   ${id.db} · ${id.esquema} · endpoint ...${endpoint}`);
  chk(id.db === 'neondb' && id.esquema === 'public' && id.replica === false && id.ro === 'off',
    'base, esquema, no-replica y sesion escribible', `${id.db}/${id.esquema} replica=${id.replica} ro=${id.ro}`);

  const hoyLima = (await una(`SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS d`)).d;
  console.log(`   hoy en Lima (no CURRENT_DATE, no toISOString) ... ${hoyLima}`);

  const prog = await una(`SELECT id FROM programas_mantenimiento WHERE codigo = $1`, [CODIGO]);
  if (!prog) abortar(`el programa ${CODIGO} no existe. Fase B (B0..B3) debe estar cargada.`);
  chk(true, `programa ${CODIGO} presente`, 'programa_id interno asignado');

  // 009 aplicada: sin ella el dominio no admite ADAS
  const m009 = await una(`SELECT
    (SELECT count(*)::int FROM pg_constraint
      WHERE conname='chk_ciclo_anual_solo_m3' AND convalidated) AS anual_ciclo,
    (SELECT count(*)::int FROM pg_constraint
      WHERE conname='chk_frecuencia_anual_solo_m3' AND convalidated) AS anual_frec,
    (SELECT count(*)::int FROM pg_constraint
      WHERE conname IN ('chk_ciclo_gps_solo_m3','chk_frecuencia_gps_solo_m3')) AS viejos,
    (SELECT count(*)::int FROM pg_constraint
      WHERE conname='chk_ciclo_tipo_equipo' AND pg_get_constraintdef(oid) LIKE '%ADAS%') AS dominio`);
  chk(m009.anual_ciclo === 1 && m009.anual_frec === 1 && m009.viejos === 0 && m009.dominio === 1,
    'migracion 20260924_009 aplicada',
    `anual(ciclo/frec)=${m009.anual_ciclo}/${m009.anual_frec} viejos=${m009.viejos} dominio admite ADAS=${m009.dominio}`);
  if (m009.dominio !== 1) abortar('el dominio de chk_ciclo_tipo_equipo no admite ADAS: falta ejecutar 20260924_009.');

  // las periodicidades anuales deben existir, porque son las que dan sentido al M3
  const { rows: frecAnual } = await cliente.query(
    `SELECT tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
       FROM programa_mantenimiento_frecuencias
      WHERE programa_id = $1 AND tipo_equipo = ANY($2) ORDER BY tipo_equipo`, [prog.id, FAMILIAS_ANUALES]);
  for (const f of frecAnual) console.log(`   periodicidad ${f.tipo_equipo.padEnd(6)} ${f.nivel_mantenimiento} = ${f.frecuencia_quincenas} quincenas`);
  chk(frecAnual.length === 2 && frecAnual.every(f => f.nivel_mantenimiento === NIVEL && f.frecuencia_quincenas === 24),
    'GPS/M3 y ADAS/M3 declaradas, ambas a 24 quincenas', `${frecAnual.length} filas`);
  const frecTotal = await filasDe('programa_mantenimiento_frecuencias');
  chk(frecTotal === 14, 'total de periodicidades del programa', `${frecTotal} (esperado 14)`);

  // idempotencia: no sobreescribe. Aborta si ya hay M3 anual.
  const yaHay = await una(`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE nivel_mantenimiento='M1')::int AS m1,
    count(*) FILTER (WHERE tipo_equipo = ANY($1))::int AS anuales,
    count(*) FILTER (WHERE tipo_equipo = ANY($1) AND nivel_mantenimiento=$2)::int AS anual_m3
    FROM programa_mantenimiento_unidad_ciclos`, [FAMILIAS_ANUALES, NIVEL]);
  console.log(`   ciclos ya presentes: ${yaHay.total} (M1 ${yaHay.m1} · anuales ${yaHay.anuales})`);
  if (yaHay.anual_m3 > 0) {
    abortar(`ya existen ${yaHay.anual_m3} ciclos M3 de familias anuales.\n`
      + `  Esta es una siembra inicial y no sobreescribe ni fusiona.\n`
      + `  Que hacer con lo ya cargado es una decision humana.`);
  }
  chk(yaHay.anuales === 0, 'sin ciclos GPS/ADAS previos', '0');
  chk(yaHay.total === ESPERADO.ciclosM1 && yaHay.m1 === ESPERADO.ciclosM1,
    'los ciclos M1 de B4 estan intactos', `${yaHay.m1} (esperado ${ESPERADO.ciclosM1})`);

  const { rows: unidades } = await cliente.query(
    `SELECT id, programa_id, placa FROM programa_mantenimiento_unidades WHERE programa_id = $1 ORDER BY placa`,
    [prog.id]);
  chk(unidades.length === ESPERADO.unidades, 'unidades activas del programa', `${unidades.length}`);
  chk(!unidades.some(u => u.placa === 'V5K756'), 'V5K756 no esta en el programa activo', 'fuera, como corresponde');
  const enPrograma = new Map(unidades.map(u => [u.placa, u]));

  const inv = await filasDe('vehiculo_equipos');
  chk(inv === ESPERADO.inventario, 'filas de vehiculo_equipos', `${inv}`);
  const { rows: equipos } = await cliente.query(
    `SELECT placa, tipo_equipo, estado_inventario, marca, numero_serie
       FROM vehiculo_equipos WHERE tipo_equipo = ANY($1)`, [FAMILIAS_ANUALES]);
  const eq = {};
  for (const e of equipos) eq[`${e.placa}|${e.tipo_equipo}`] = e;
  console.log(`   inventario anual leido: ${equipos.length} filas (GPS + ADAS)`);
  const placasInventario = new Set((await cliente.query(
    `SELECT DISTINCT placa FROM vehiculo_equipos`)).rows.map(r => r.placa));
  console.log(`   placas distintas en el inventario: ${placasInventario.size}`);

  // --- 4 · proveedores ADAS reales ------------------------------------------------
  sec('4 · ADAS · PROVEEDORES REALES Y LISTA POSITIVA TRACKLOG');
  const { rows: marcas } = await cliente.query(
    `SELECT coalesce(marca,'(null)') AS marca, estado_inventario, count(*)::int AS total,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u
         WHERE u.placa = e.placa AND u.programa_id = $1))::int AS en_programa
     FROM vehiculo_equipos e WHERE tipo_equipo='ADAS'
     GROUP BY 1,2 ORDER BY 3 DESC`, [prog.id]);
  for (const r of marcas)
    console.log(`   ${JSON.stringify(r.marca).padEnd(26)} ${r.estado_inventario.padEnd(13)} total=${String(r.total).padStart(4)} en el programa=${r.en_programa}`);
  const distintas = [...new Set(marcas.filter(r => r.marca !== '(null)').map(r => r.marca))];
  const positiva = distintas.filter(esTracklog);
  console.log(`\n   marcas no nulas: ${distintas.map(x => JSON.stringify(x)).join(', ')}`);
  console.log(`   LISTA POSITIVA derivada del inventario real: ${positiva.map(x => JSON.stringify(x)).join(', ') || '(ninguna)'}`);
  console.log(`   se empareja por la subcadena TRACKLOG. No por EVO a secas: EVO aparece`);
  console.log(`   dentro de "NUEVO EQUIPO", que es un marcador de la propia hoja.`);
  chk(positiva.length >= 1, 'existe al menos un proveedor Tracklog en inventario', `${positiva.length}`);
  chk(!positiva.some(m => /^MIX/i.test(m)), 'MIX TELEMATICS no se interpreta como Tracklog', 'excluido por la regla positiva');

  // --- 5 · derivacion de las filas ------------------------------------------------
  sec('5 · DERIVACION · DE LAS 194 FILAS DE LA HOJA A LAS FILAS A SEMBRAR');
  const filas = [];
  const descartes = { sin_fecha: [], fuera_programa: [], no_instalado: [], sin_inventario: [], adas_otro_proveedor: [] };
  const fueraDelUniverso = [];
  const vistas = new Map();     // clave unidad|tipo -> fila ya aceptada, para detectar repetidos
  const repetidas = [];

  for (const f of hist) {
    const esAdas = /_EVO4/i.test(f.c.A || '');
    const tipo = esAdas ? 'ADAS' : 'GPS';
    const placa = canonica(f.c.A);
    const fecha = esSerie(f.c.H) ? aISO(f.c.H) : null;
    const ctx = { fila: f.r, origen: f.c.A, placa, tipo, fecha, esNuevo: /^NUEVO EQUIPO$/i.test(f.c.C || '') };

    const u = enPrograma.get(placa);
    if (!u) {
      // se distingue una placa real que no esta en el programa activo (por ejemplo una
      // unidad vendida) de una placa que no empareja con NINGUNA placa conocida, que
      // seria un error de transcripcion y hay que reportar, no adivinar.
      if (placasInventario.has(placa)) descartes.fuera_programa.push(ctx);
      else fueraDelUniverso.push(ctx);
      continue;
    }
    const e = eq[`${placa}|${tipo}`];
    if (!e) { descartes.sin_inventario.push(ctx); continue; }
    if (e.estado_inventario !== 'INSTALADO') { descartes.no_instalado.push({ ...ctx, estado: e.estado_inventario, marca: e.marca }); continue; }
    if (esAdas && !esTracklog(e.marca)) { descartes.adas_otro_proveedor.push({ ...ctx, marca: e.marca }); continue; }
    if (!fecha) { descartes.sin_fecha.push(ctx); continue; }

    const clave = `${u.id}|${tipo}|${NIVEL}`;
    if (vistas.has(clave)) { repetidas.push({ ...ctx, previa: vistas.get(clave) }); continue; }
    const obs = esAdas
      ? `M3 inicial de ADAS Tracklog sembrado del Excel TI-PR-01 (SHA-256 ${EXCEL_SHA256.slice(0, 12)}...). `
      + `Hoja ${HOJA} fila ${f.r}, placa de origen "${f.c.A}" (sufijo _EVO4), FECHA_MANTENIMIENTO ACTUALIZADA ${fecha}. `
      + `Proveedor actual verificado en inventario: "${e.marca}". Solo ADAS Tracklog participa del programa TI-PR-01. `
      + `La fecha de instalacion del equipo NO se uso como mantenimiento. `
      + `ultima_quincena por convencion de calendario autorizada solo para la siembra inicial `
      + `(dia 1-15 -> dia 1; dia 16-fin -> dia 16); el libro no registro la quincena administrativa.`
      : `M3 inicial de GPS sembrado del Excel TI-PR-01 (SHA-256 ${EXCEL_SHA256.slice(0, 12)}...). `
      + `Hoja ${HOJA} fila ${f.r}, placa de origen "${f.c.A}", FECHA_MANTENIMIENTO ACTUALIZADA ${fecha}. `
      + `La fecha de instalacion del equipo NO se uso como mantenimiento. `
      + `ultima_quincena por convencion de calendario autorizada solo para la siembra inicial `
      + `(dia 1-15 -> dia 1; dia 16-fin -> dia 16); el libro no registro la quincena administrativa.`;
    const r = {
      placa, programa_unidad_id: u.id, programa_id: u.programa_id, tipo_equipo: tipo,
      nivel_mantenimiento: NIVEL, ultima_quincena: quincenaCalendario(fecha), ultima_fecha_real: fecha,
      fuente: FUENTE, observaciones: obs, fila: f.r, marca: e.marca, serie: e.numero_serie,
    };
    vistas.set(clave, r);
    filas.push(r);
  }

  const gps = filas.filter(f => f.tipo_equipo === 'GPS');
  const adas = filas.filter(f => f.tipo_equipo === 'ADAS');
  console.log(`   194 filas de la hoja`);
  console.log(`     - sin fecha de mantenimiento en H ............ ${descartes.sin_fecha.length}`);
  console.log(`     - unidad fuera del programa activo .......... ${descartes.fuera_programa.length}`);
  console.log(`     - equipo no INSTALADO hoy ................... ${descartes.no_instalado.length}`);
  console.log(`     - sin fila de inventario para ese tipo ...... ${descartes.sin_inventario.length}`);
  console.log(`     - ADAS de proveedor distinto de Tracklog .... ${descartes.adas_otro_proveedor.length}`);
  console.log(`     - repetidas (misma unidad, tipo y nivel) .... ${repetidas.length}`);
  console.log(`     - placa fuera del universo de inventario .... ${fueraDelUniverso.length}`);
  console.log(`   = filas a sembrar ............................. ${filas.length}  (GPS ${gps.length} · ADAS ${adas.length})`);
  const sumaDescartes = Object.values(descartes).reduce((a, x) => a + x.length, 0)
    + repetidas.length + fueraDelUniverso.length;
  chk(filas.length + sumaDescartes === hist.length, 'el embudo cuadra con las filas de la hoja',
    `${filas.length} + ${sumaDescartes} = ${filas.length + sumaDescartes} de ${hist.length}`);

  // Las placas fuera del universo son registros historicos de unidades que ya no estan
  // en el inventario. No son un error de la carga, pero hay que saber que son: se cruzan
  // contra vehiculos, y se distingue la placa que NO existe en absoluto de la que existe
  // pero guardada sin forma canonica. Esa segunda categoria es un dato sucio a reportar,
  // NUNCA algo que este script normalice por su cuenta.
  const { rows: cruceFuera } = await cliente.query(
    `SELECT p AS placa,
       EXISTS(SELECT 1 FROM vehiculos v WHERE v.placa = p) AS exacta,
       (SELECT v.placa FROM vehiculos v WHERE replace(v.placa,'-','') = p AND v.placa <> p LIMIT 1) AS solo_guion,
       (SELECT v.placa FROM vehiculos v
          WHERE translate(replace(v.placa,'-',''),'O','0') = translate(p,'O','0')
            AND replace(v.placa,'-','') <> p LIMIT 1) AS solo_o_cero
     FROM unnest($1::text[]) p ORDER BY p`, [[...new Set(fueraDelUniverso.map(x => x.placa))]]);
  const exactas = cruceFuera.filter(r => r.exacta);
  const porGuion = cruceFuera.filter(r => !r.exacta && r.solo_guion);
  const porOcero = cruceFuera.filter(r => !r.exacta && !r.solo_guion && r.solo_o_cero);
  const inexistentes = cruceFuera.filter(r => !r.exacta && !r.solo_guion && !r.solo_o_cero);
  console.log(`\n   las ${cruceFuera.length} placas fuera del universo, cruzadas contra vehiculos:`);
  console.log(`      no existen en vehiculos ..................... ${inexistentes.length}  (unidades historicas fuera de la flota)`);
  console.log(`      existen en vehiculos con el mismo texto ..... ${exactas.length}`);
  console.log(`      existen pero guardadas CON guion ............ ${porGuion.length}  <- dato sucio, se reporta`);
  for (const r of porGuion) console.log(`         hoja "${r.placa}"  vs  vehiculos "${r.solo_guion}"`);
  console.log(`      emparejarian solo convirtiendo O <-> 0 ...... ${porOcero.length}`);
  for (const r of porOcero) console.log(`         hoja "${r.placa}"  vs  vehiculos "${r.solo_o_cero}"  <- NO se empareja`);
  chk(porOcero.length === 0, 'ninguna placa requiere convertir O <-> 0', 'esa conversion esta prohibida');
  chk(exactas.length + porGuion.length + porOcero.length + inexistentes.length === cruceFuera.length,
    'toda placa fuera del universo queda clasificada', `${cruceFuera.length} clasificadas`);
  chk(!cruceFuera.some(r => enPrograma.has(r.placa)), 'ninguna de ellas pertenece al programa activo',
    'no afectan a la carga');
  chk(gps.length === ESPERADO.gpsM3, 'GPS/M3 derivadas', `${gps.length} (esperado ${ESPERADO.gpsM3})`);
  chk(adas.length === ESPERADO.adasM3, 'ADAS/M3 derivadas', `${adas.length} (esperado ${ESPERADO.adasM3})`);
  chk(filas.length === ESPERADO.total, 'total de referencias a sembrar', `${filas.length} (esperado ${ESPERADO.total})`);

  // --- 5-bis · el mismo universo visto desde las 174 unidades ---------------------
  // La derivacion de arriba recorre las filas de la hoja, porque de ahi sale la fecha.
  // Este recuento recorre las UNIDADES y debe llegar al mismo numero por otro camino:
  // si los dos no coinciden, algo esta mal y se aborta.
  sec('5-bis · CONTRASTE · EL MISMO UNIVERSO CONTADO DESDE LAS 174 UNIDADES');
  const porPlacaHoja = {};
  for (const f of hist) {
    const k = `${canonica(f.c.A)}|${/_EVO4/i.test(f.c.A || '') ? 'ADAS' : 'GPS'}`;
    (porPlacaHoja[k] = porPlacaHoja[k] || []).push({
      fila: f.r, fecha: esSerie(f.c.H) ? aISO(f.c.H) : null, esNuevo: /^NUEVO EQUIPO$/i.test(f.c.C || ''),
    });
  }
  const estadoUnidad = { GPS: {}, ADAS: {} };
  const sinM3 = { GPS: [], ADAS: [] };
  const porValidar = { GPS: [], ADAS: [] };
  for (const tipo of FAMILIAS_ANUALES) {
    for (const u of unidades) {
      const e = eq[`${u.placa}|${tipo}`];
      const est = e?.estado_inventario ?? '(sin fila)';
      estadoUnidad[tipo][est] = (estadoUnidad[tipo][est] || 0) + 1;
      if (est === 'POR_VALIDAR') porValidar[tipo].push({ placa: u.placa, marca: e?.marca, serie: e?.numero_serie });
      if (est !== 'INSTALADO') continue;
      if (tipo === 'ADAS' && !esTracklog(e.marca)) continue;
      const h = (porPlacaHoja[`${u.placa}|${tipo}`] || []).filter(x => x.fecha);
      if (h.length === 0) {
        const todas = porPlacaHoja[`${u.placa}|${tipo}`] || [];
        sinM3[tipo].push({
          placa: u.placa,
          motivo: todas.length === 0 ? `sin registro en ${HOJA}`
            : todas.some(x => x.esNuevo) ? `${HOJA} dice NUEVO EQUIPO sin fecha de mantenimiento`
            : `con registro en ${HOJA} pero sin fecha`,
        });
      }
    }
  }
  for (const tipo of FAMILIAS_ANUALES)
    console.log(`   ${tipo.padEnd(5)} en las 174: ${Object.entries(estadoUnidad[tipo]).sort().map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  const elegiblesUnidad = {
    GPS: unidades.filter(u => eq[`${u.placa}|GPS`]?.estado_inventario === 'INSTALADO').length,
    ADAS: unidades.filter(u => eq[`${u.placa}|ADAS`]?.estado_inventario === 'INSTALADO' && esTracklog(eq[`${u.placa}|ADAS`].marca)).length,
  };
  for (const tipo of FAMILIAS_ANUALES) {
    const derivadas = filas.filter(f => f.tipo_equipo === tipo).length;
    console.log(`   ${tipo.padEnd(5)} elegibles por inventario ${String(elegiblesUnidad[tipo]).padStart(4)}`
      + ` - sin M3 historico ${String(sinM3[tipo].length).padStart(3)} = ${String(elegiblesUnidad[tipo] - sinM3[tipo].length).padStart(4)}`
      + `   (derivadas desde la hoja: ${derivadas})`);
    chk(elegiblesUnidad[tipo] - sinM3[tipo].length === derivadas,
      `${tipo}: los dos caminos de conteo coinciden`, `${elegiblesUnidad[tipo] - sinM3[tipo].length} = ${derivadas}`);
  }

  sec('5-ter · CASOS QUE DEBEN VERSE EXPLICITAMENTE');
  console.log(`   a) la unica referencia ADAS/M3 (proveedor, fecha real, quincena, fila de origen)`);
  for (const f of adas) {
    console.log(`      placa .............. ${f.placa}`);
    console.log(`      proveedor actual ... ${JSON.stringify(f.marca)}   (verificado en vehiculo_equipos)`);
    console.log(`      numero de serie .... ${JSON.stringify(f.serie)}`);
    console.log(`      fila de origen ..... ${HOJA} fila ${f.fila}`);
    console.log(`      ultima_fecha_real .. ${f.ultima_fecha_real}`);
    console.log(`      ultima_quincena .... ${f.ultima_quincena}`);
    console.log(`      observaciones:`);
    for (const l of (f.observaciones.match(/.{1,86}(\s|$)/g) || [])) console.log(`         ${l.trim()}`);
  }
  const otrosAdas = descartes.adas_otro_proveedor;
  console.log(`\n   b) ADAS historicos de Tracklog que hoy llevan otro proveedor: ${otrosAdas.length}`);
  for (const x of otrosAdas)
    console.log(`      ${x.placa.padEnd(9)} fila ${String(x.fila).padStart(4)} fecha ${String(x.fecha ?? '-').padEnd(11)} proveedor hoy ${JSON.stringify(x.marca)} -> evidencia, sin ciclo activo`);

  console.log(`\n   c) V5K756 (vendida, evidencia historica conservada)`);
  const v5k = hist.filter(f => canonica(f.c.A) === 'V5K756');
  console.log(`      filas en ${HOJA} ............ ${v5k.length}${v5k.length ? ' (filas ' + v5k.map(f => f.r).join(', ') + ')' : ''}`);
  console.log(`      esta en las 174 activas ...... ${enPrograma.has('V5K756') ? 'SI' : 'NO'}`);
  console.log(`      filas de inventario ......... ${(await una(`SELECT count(*)::int AS n FROM vehiculo_equipos WHERE placa='V5K756'`)).n} (se conservan)`);
  console.log(`      referencias que genera ....... ${filas.filter(f => f.placa === 'V5K756').length}`);
  chk(filas.filter(f => f.placa === 'V5K756').length === 0,
    'V5K756 no genera ciclo activo', 'su evidencia historica se conserva intacta');

  console.log(`\n   d) unidades con el equipo INSTALADO pero SIN M3 historico`);
  for (const tipo of FAMILIAS_ANUALES) {
    console.log(`      ${tipo}: ${sinM3[tipo].length}`);
    for (const x of sinM3[tipo]) console.log(`         ${x.placa.padEnd(9)} ${x.motivo}`);
  }
  console.log(`      No se les inventa fecha: quedan sin referencia M3 hasta que exista evidencia.`);

  console.log(`\n   e) unidades en POR_VALIDAR (nunca se interpretan como INSTALADO)`);
  for (const tipo of FAMILIAS_ANUALES) {
    console.log(`      ${tipo}: ${porValidar[tipo].length}`);
    for (const x of porValidar[tipo])
      console.log(`         ${x.placa.padEnd(9)} marca=${JSON.stringify(x.marca)} serie=${JSON.stringify(x.serie)}`);
  }
  chk(!filas.some(f => eq[`${f.placa}|${f.tipo_equipo}`]?.estado_inventario === 'POR_VALIDAR'),
    'ninguna referencia sale de un POR_VALIDAR', 'POR_VALIDAR nunca es "si"');

  // --- 6 · validaciones ANTES de insertar -----------------------------------------
  sec('6 · VALIDACIONES PREVIAS AL INSERT · SOBRE LAS FILAS DERIVADAS');
  chk(filas.every(f => f.nivel_mantenimiento === NIVEL), 'todas son M3',
    `0 M1 y 0 M2 (${filas.filter(f => f.nivel_mantenimiento !== NIVEL).length} desviaciones)`);
  chk(filas.every(f => FAMILIAS_ANUALES.includes(f.tipo_equipo)), 'todas son GPS o ADAS', '0 de otra familia');
  chk(filas.every(f => enPrograma.has(f.placa)), 'todas pertenecen a las 174 activas', '0 fuera del programa');
  chk(filas.every(f => eq[`${f.placa}|${f.tipo_equipo}`]?.estado_inventario === 'INSTALADO'),
    'todas con el equipo INSTALADO hoy', '0 POR_VALIDAR y 0 NO_APLICA');
  chk(adas.every(f => esTracklog(eq[`${f.placa}|ADAS`]?.marca)), 'toda ADAS es Tracklog verificado en inventario',
    adas.map(f => JSON.stringify(eq[`${f.placa}|ADAS`]?.marca)).join(' ') || '(ninguna)');
  chk(!filas.some(f => f.placa === 'V5K756'), 'V5K756 no genera ninguna referencia', 'ausente');
  chk(new Set(filas.map(f => `${f.programa_unidad_id}|${f.tipo_equipo}|${f.nivel_mantenimiento}`)).size === filas.length,
    'sin duplicados de (unidad, tipo, nivel)', `${filas.length} claves distintas`);
  chk(filas.every(f => ['01', '16'].includes(f.ultima_quincena.slice(8, 10))),
    'ultima_quincena siempre dia 1 o 16', 'cumple chk_ciclo_ultima_quincena');
  chk(filas.every(f => f.ultima_quincena <= f.ultima_fecha_real),
    'ultima_quincena nunca posterior a ultima_fecha_real', 'coherente');
  chk(filas.every(f => f.ultima_fecha_real <= hoyLima), 'ninguna fecha futura (hora de Lima)',
    `todas <= ${hoyLima}`);
  chk(filas.every(f => f.fuente === FUENTE), `fuente = ${FUENTE} en todas`, 'el libro es la evidencia');
  chk(filas.every(f => /HISTORICO_GPS fila \d+/.test(f.observaciones)),
    'cada fila cita su fila de origen en observaciones', 'trazable al Excel');
  const rangoF = [filas.reduce((a, f) => f.ultima_fecha_real < a ? f.ultima_fecha_real : a, '9999-99-99'),
                  filas.reduce((a, f) => f.ultima_fecha_real > a ? f.ultima_fecha_real : a, '0000-00-00')];
  console.log(`   rango de ultima_fecha_real: ${rangoF[0]} .. ${rangoF[1]}`);

  // --- 7 · insercion --------------------------------------------------------------
  sec('7 · INSERCION EN UNA SOLA TRANSACCION');
  await cliente.query('BEGIN');
  let insertadas = 0;
  const LOTE = 200;
  for (let i = 0; i < filas.length; i += LOTE) {
    const t = filas.slice(i, i + LOTE);
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
  console.log(`   ${insertadas} filas insertadas en ${Math.ceil(filas.length / LOTE)} lote(s)`);
  chk(insertadas === filas.length, 'todas las filas previstas se insertaron', `${insertadas}/${filas.length}`);

  // --- 8 · validaciones sobre lo insertado ----------------------------------------
  sec('8 · VALIDACIONES SOBRE LO INSERTADO, DENTRO DE LA TRANSACCION');
  const c = await una(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE nivel_mantenimiento='M1')::int AS m1,
      count(*) FILTER (WHERE nivel_mantenimiento='M2')::int AS m2,
      count(*) FILTER (WHERE nivel_mantenimiento='M3')::int AS m3,
      count(*) FILTER (WHERE tipo_equipo='GPS')::int AS gps,
      count(*) FILTER (WHERE tipo_equipo='ADAS')::int AS adas,
      count(*) FILTER (WHERE tipo_equipo = ANY($1) AND nivel_mantenimiento <> 'M3')::int AS anual_no_m3,
      count(*) FILTER (WHERE fuente <> $2)::int AS otra_fuente,
      count(*) FILTER (WHERE EXTRACT(day FROM ultima_quincena) NOT IN (1,16))::int AS quincena_mala,
      count(*) FILTER (WHERE ultima_fecha_real IS NULL)::int AS sin_fecha,
      count(*) FILTER (WHERE ultima_fecha_real > (now() AT TIME ZONE 'America/Lima')::date)::int AS futuras
    FROM programa_mantenimiento_unidad_ciclos`, [FAMILIAS_ANUALES, FUENTE]);
  chk(c.total === ESPERADO.totalTrasCarga, 'total de ciclos dentro de la transaccion',
    `${c.total} (esperado ${ESPERADO.totalTrasCarga} = ${ESPERADO.ciclosM1} M1 + ${ESPERADO.total} M3)`);
  chk(c.m1 === ESPERADO.ciclosM1, 'los M1 de B4 siguen intactos', `${c.m1}`);
  chk(c.m2 === 0, 'ningun M2 creado', `${c.m2}`);
  chk(c.m3 === ESPERADO.total, 'M3 creados', `${c.m3}`);
  chk(c.gps === ESPERADO.gpsM3, 'ciclos GPS', `${c.gps}`);
  chk(c.adas === ESPERADO.adasM3, 'ciclos ADAS', `${c.adas}`);
  chk(c.anual_no_m3 === 0, 'ninguna familia anual con nivel distinto de M3', `${c.anual_no_m3}`);
  chk(c.otra_fuente === 0, `ninguna fila con fuente distinta de ${FUENTE}`, `${c.otra_fuente}`);
  chk(c.quincena_mala === 0, 'ninguna ultima_quincena fuera del dia 1 o 16', `${c.quincena_mala}`);
  chk(c.sin_fecha === 0, 'ninguna fila sin ultima_fecha_real', `${c.sin_fecha}`);
  chk(c.futuras === 0, 'ninguna fecha futura en hora de Lima', `${c.futuras}`);

  const cruce = await una(`SELECT
      count(*) FILTER (WHERE e.estado_inventario IS DISTINCT FROM 'INSTALADO')::int AS no_instalado,
      count(*) FILTER (WHERE c.tipo_equipo='ADAS' AND e.marca NOT ILIKE '%TRACKLOG%')::int AS adas_no_trk,
      count(*) FILTER (WHERE u.id IS NULL)::int AS sin_unidad
    FROM programa_mantenimiento_unidad_ciclos c
    JOIN programa_mantenimiento_unidades u ON u.id = c.programa_unidad_id
    LEFT JOIN vehiculo_equipos e ON e.placa = u.placa AND e.tipo_equipo = c.tipo_equipo
    WHERE c.tipo_equipo = ANY($1)`, [FAMILIAS_ANUALES]);
  chk(cruce.no_instalado === 0, 'todo ciclo anual apunta a un equipo INSTALADO', `${cruce.no_instalado}`);
  chk(cruce.adas_no_trk === 0, 'ningun ciclo ADAS de proveedor distinto de Tracklog', `${cruce.adas_no_trk}`);
  chk(cruce.sin_unidad === 0, 'todo ciclo tiene su unidad', `${cruce.sin_unidad}`);

  const intactas = await una(`SELECT
      (SELECT count(*)::int FROM programa_mantenimiento_unidades) AS unidades,
      (SELECT count(*)::int FROM vehiculo_equipos) AS inventario,
      (SELECT count(*)::int FROM programa_mantenimiento_frecuencias) AS frecuencias,
      (SELECT count(*)::int FROM programacion_mantenimiento) AS programacion,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS detalles,
      (SELECT count(*)::int FROM vehiculos) AS vehiculos`);
  chk(intactas.unidades === ESPERADO.unidades, 'unidades sin tocar', `${intactas.unidades}`);
  chk(intactas.inventario === ESPERADO.inventario, 'inventario sin tocar', `${intactas.inventario}`);
  chk(intactas.frecuencias === 14, 'periodicidades sin tocar', `${intactas.frecuencias}`);
  chk(intactas.programacion === 0, 'NO se creo ninguna programacion', `${intactas.programacion}`);
  chk(intactas.detalles === 0, 'NO se creo ningun detalle', `${intactas.detalles}`);
  chk(intactas.vehiculos === 182, 'vehiculos sin tocar', `${intactas.vehiculos}`);

  // --- 9 · distribucion y proyeccion (informe, no se persiste nada) ---------------
  sec('9 · DISTRIBUCION POR ultima_quincena');
  const { rows: dist } = await cliente.query(
    `SELECT tipo_equipo, to_char(ultima_quincena,'YYYY-MM-DD') AS q, count(*)::int AS n
       FROM programa_mantenimiento_unidad_ciclos WHERE tipo_equipo = ANY($1)
      GROUP BY 1,2 ORDER BY 1,2`, [FAMILIAS_ANUALES]);
  for (const r of dist) console.log(`   ${r.tipo_equipo.padEnd(6)} ${r.q}  ${String(r.n).padStart(4)}`);

  sec('10 · PROYECCION A +24 QUINCENAS · SOLO INFORME, NO SE PERSISTE');
  console.log('   No se crea ninguna programacion. Esto solo muestra a que quincena caeria');
  console.log('   el siguiente M3 si se aplicara la periodicidad de 24 quincenas.');
  const proy = {};
  for (const f of filas) {
    const q = desdeIdx(idxQuincena(f.ultima_quincena) + 24);
    const k = `${f.tipo_equipo}|${q}`;
    proy[k] = (proy[k] || 0) + 1;
  }
  const hoyQ = quincenaCalendario(hoyLima);
  let vencidas = 0;
  console.log(`   tipo   proxima quincena   unidades   situacion (hoy ${hoyLima}, quincena ${hoyQ})`);
  for (const k of Object.keys(proy).sort()) {
    const [t, q] = k.split('|');
    const atrasada = idxQuincena(q) < idxQuincena(hoyQ);
    if (atrasada) vencidas += proy[k];
    console.log(`   ${t.padEnd(6)} ${q.padEnd(18)} ${String(proy[k]).padStart(6)}   ${atrasada ? 'YA VENCIDA' : 'futura'}`);
  }
  console.log(`\n   unidades cuyo proximo M3 ya estaria vencido: ${vencidas}`);
  console.log('   Se reporta y no se corrige: adelantar o atrasar una fecha real seria inventar.');

  // --- 11 · cierre ----------------------------------------------------------------
  sec(`11 · CIERRE · ${aciertos} OK · ${fallos} FALLAS`);
  if (fallos > 0) {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK POR FALLOS. La base queda exactamente como estaba.');
  } else if (modo === 'ENSAYO') {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK ejecutado (modo ensayo). Nada se ha guardado.');
    const tras = await filasDe('programa_mantenimiento_unidad_ciclos');
    chk(tras === ESPERADO.ciclosM1, 'tras el ROLLBACK los ciclos vuelven a su valor previo',
      `${tras} (esperado ${ESPERADO.ciclosM1})`);
    console.log('   Para cargar de verdad: repetir con --confirmar');
  } else {
    await cliente.query('COMMIT');
    confirmado = true;
    console.log('   COMMIT ejecutado. Las referencias M3 anuales quedan sembradas.');
    const tras = await una(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE nivel_mantenimiento='M3')::int AS m3 FROM programa_mantenimiento_unidad_ciclos`);
    console.log(`   estado persistido: ${tras.total} ciclos (${tras.m3} M3)`);
  }
} catch (error) {
  fallos++;
  console.error(`\n   *** EXCEPCION ***  ${error.code || ''} ${error.message}`);
  if (error.detail) console.error(`   detalle: ${error.detail}`);
  if (error.constraint) console.error(`   constraint: ${error.constraint}`);
  try { await cliente.query('ROLLBACK'); console.error('   ROLLBACK ejecutado.'); } catch { /* ya cerrada */ }
} finally {
  cliente.release();
  await pool.end();
}
console.log(`\nRESULTADO M3: ${fallos > 0 ? 'NO CARGADA' : confirmado ? 'CARGADA (COMMIT)' : 'ensayo correcto, revertido'}`);
process.exit(fallos > 0 ? 2 : 0);
