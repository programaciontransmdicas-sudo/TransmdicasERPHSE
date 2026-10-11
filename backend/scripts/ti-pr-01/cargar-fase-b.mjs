// =====================================================================================
// OBSOLETO DESDE 20261007_017 · NO REEJECUTAR
// =====================================================================================
// Siembra las 3 frecuencias de DVR (M1=1, M2=6, M3=12) y sus anclas. Por decision de
// negocio del 2026-10-07 DVR ya no es familia programable: la migracion 20261007_017
// retiro esas filas y estrecho chk_frecuencia_tipo_equipo, asi que este script fallaria.
//
// Se conserva como documentacion de la carga inicial. Para rehacerla habria que quitar
// antes DVR de sus listas de frecuencias y de anclas.
// =====================================================================================
// =====================================================================================
// TI-PR-01 · CARGA INICIAL (FASE B)
// =====================================================================================
// Carga reproducible del programa TI-PR-01 a partir del Excel fuente.
//
//   node backend/scripts/ti-pr-01/cargar-fase-b.mjs --ensayo     prueba, termina en ROLLBACK
//   node backend/scripts/ti-pr-01/cargar-fase-b.mjs --confirmar  carga real, termina en COMMIT
//
// Sin ninguna de las dos banderas no hace nada: obliga a declarar la intencion.
//
// GARANTIAS
//   * Exige el SHA-256 EXACTO del Excel. Si el fichero cambio, aborta sin tocar la base.
//   * Comprueba precondiciones de esquema (004, 005 y 006 aplicadas) y de datos.
//   * Aborta con un mensaje claro si TI-PR-01 ya existe. No duplica ni sobreescribe.
//   * Todo ocurre en UNA sola transaccion.
//   * Imprime los conteos ANTES del COMMIT y ejecuta el fichero de validacion completo.
//     Si cualquier regla da FAIL, hace ROLLBACK y no llega a COMMIT.
//   * No inventa datos: cada valor sale del Excel o del cajetin aprobado.
//
// POR QUE ESTA AQUI Y NO EN backend/migrations
//   La carpeta de migraciones contiene 20260923_007 y 20260923_008, que son cleanup
//   DESTRUCTIVOS y todavia no deben ejecutarse. Un runner que recorra migrations en
//   orden los arrastraria. Esta carga es un paso de datos, no de esquema, y vive aparte.
//
// NO POBLA
//   * programa_mantenimiento_unidad_ciclos  (faltan las referencias M1/M2/M3)
//   * programacion_mantenimiento            (se genera a partir de los ciclos)
//   * programacion_mantenimiento_equipos
//   * los 5 booleanos legacy de vehiculos   (vehiculo_equipos es la fuente de verdad)
//   * programa_mantenimiento_frecuencias.version_id -> se carga NULL a proposito
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

// fileURLToPath y no new URL().pathname: la ruta del proyecto contiene un espacio
// ("ERP HSE") y pathname lo devuelve como %20, que luego se volveria a codificar.
const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const VALIDATION = resolve(BACKEND, 'migrations', 'validation',
  '20260923_006_ti_pr_01_modelo_final_validation.sql');

// Ruta explicita al .env para que el script funcione invocado desde cualquier
// directorio, igual que server.js pero sin depender del cwd.
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

// --- Excel fuente y su huella autorizada -------------------------------------------
const EXCEL = 'C:/Daniel/HSE/TI/TI-PR-01 Programa de Mantenimiento de Equipos Tecnológicos 2026 PROPUESTA ACTUALIZADO.xlsx';
const EXCEL_SHA256 = '414b513513caa4a55972cbcc586e90a7f34b87ae8892d056f6f5009c16d21a62';

// --- Cajetin aprobado (decisiones humanas cerradas) --------------------------------
const CODIGO           = 'TI-PR-01';
const VERSION          = '01';
const FECHA_DOCUMENTO  = '2026-09-25';
const VIGENCIA_DESDE   = '2026-09-25';
const VIGENCIA_HASTA   = null;
const PERIODO_INICIO   = '2026-09-01';
const PERIODO_FIN      = '2026-12-31';
const ESTADO_PROGRAMA  = 'ACTIVO';
const ESTADO_VERSION   = 'VIGENTE';
const OBSERVACION_V01  = 'Cajetin V01. Revisa JHSE, aprueba GG.';

// --- Las 13 periodicidades, en QUINCENAS -------------------------------------------
// Se contrastan contra IMP_PERIODICIDAD del Excel, que las expresa en DIAS:
//   M1 quincenal 15 dias = 1 quincena · M2 trimestral 90 = 6 · M3 semestral 180 = 12
//   GPS anual 365 dias = 24 quincenas
// ADAS aparece en IMP_PERIODICIDAD pero NO se carga: se inventaria y no se mantiene.
const FRECUENCIAS = [
  ['DVR',        'M1',  1], ['DVR',        'M2',  6], ['DVR',        'M3', 12],
  ['COPILOTO',   'M1',  1], ['COPILOTO',   'M2',  6], ['COPILOTO',   'M3', 12],
  ['RADIO_BASE', 'M1',  1], ['RADIO_BASE', 'M2',  6], ['RADIO_BASE', 'M3', 12],
  ['CAMARAS',    'M1',  1], ['CAMARAS',    'M2',  6], ['CAMARAS',    'M3', 12],
  ['GPS',        'M3', 24],
];
const DIAS_ESPERADOS = { M1: 15, M2: 90, M3: 180 };
const GPS_DIAS_ESPERADOS = 365;

// --- Bloques de inventario en las hojas STATUS -------------------------------------
// ev    = columna cuya presencia demuestra instalacion, y de la que sale la marca
// serie = columna de numero de serie, si el bloque tiene una
//
// El bloque GPS esta permutado respecto de sus rotulos: AD se titula "TIPO DE GPS"
// pero contiene SERIES, y AE se titula "MODELO DE GPS" pero contiene la identidad del
// equipo (Ruptela_*, U1_Plus3G). Por eso aqui ev='AE' y serie='AD'.
const BLOQUES = [
  { tipo: 'DVR_INTERNO',    ev: 'J',  fecha: 'I',  serie: null, obs: 'L'  },
  { tipo: 'CAMARA_INTERNA', ev: 'K',  fecha: 'I',  serie: null, obs: 'L'  },
  { tipo: 'DVR_EXTERNO',    ev: 'N',  fecha: 'M',  serie: null, obs: 'P'  },
  { tipo: 'CAMARA_EXTERNA', ev: 'O',  fecha: 'M',  serie: null, obs: 'P'  },
  { tipo: 'ADAS',           ev: 'R',  fecha: 'Q',  serie: 'S',  obs: 'T'  },
  { tipo: 'COPILOTO',       ev: 'V',  fecha: 'U',  serie: 'W',  obs: 'X'  },
  { tipo: 'RADIO_BASE',     ev: 'Z',  fecha: 'Y',  serie: 'AA', obs: 'AB' },
  { tipo: 'GPS',            ev: 'AE', fecha: 'AC', serie: 'AD', obs: 'AF' },
];
// Marcadores que ocupan una casilla de serie sin ser una serie. No se importan como
// tal: registrar "SIN SERIE" como numero de serie seria inventar un dato.
const SERIE_NO_ES_SERIE = new Set(['TDCTDC', 'SIN COPILOTO', 'SIN SERIE', '0', 'SIN DATO', 'N/A', '-']);

// --- Conteos esperados, ya validados ----------------------------------------------
const ESPERADO = {
  programa: 1, version: 1, frecuencias: 13,
  unidades: 174,
  inventario_total: 1400, inventario_activo: 1392, inventario_historico: 8,
  placas_inventario: 175,
  instalado: 1012, no_aplica: 164, por_validar: 224,
  vehiculos: 182,
  ciclos: 0, programaciones: 0, detalles: 0,
};
const POR_TIPO = {
  DVR_INTERNO:    { INSTALADO: 143, NO_APLICA:  9, POR_VALIDAR: 23 },
  CAMARA_INTERNA: { INSTALADO: 143, NO_APLICA:  9, POR_VALIDAR: 23 },
  DVR_EXTERNO:    { INSTALADO: 143, NO_APLICA:  9, POR_VALIDAR: 23 },
  CAMARA_EXTERNA: { INSTALADO: 143, NO_APLICA:  9, POR_VALIDAR: 23 },
  ADAS:           { INSTALADO:  28, NO_APLICA: 67, POR_VALIDAR: 80 },
  COPILOTO:       { INSTALADO: 122, NO_APLICA: 28, POR_VALIDAR: 25 },
  RADIO_BASE:     { INSTALADO: 119, NO_APLICA: 33, POR_VALIDAR: 23 },
  GPS:            { INSTALADO: 171, NO_APLICA:  0, POR_VALIDAR:  4 },
};

// =====================================================================================
const modo = process.argv.includes('--confirmar') ? 'CONFIRMAR'
           : process.argv.includes('--ensayo')    ? 'ENSAYO'
           : null;

const sec = t => console.log(`\n${'='.repeat(88)}\n${t}\n${'='.repeat(88)}`);
let fallos = 0, aciertos = 0;
const chk = (bien, etiqueta, detalle) => {
  if (bien) { aciertos++; console.log(`   [OK]    ${etiqueta.padEnd(46)} ${detalle}`); }
  else      { fallos++;   console.log(`   [FALLA] ${etiqueta.padEnd(46)} ${detalle}`); }
};
const abortar = mensaje => { console.error(`\nABORTADO: ${mensaje}\n`); process.exit(2); };

if (!modo) abortar('indica --ensayo (prueba con ROLLBACK) o --confirmar (carga real con COMMIT).');

// --- No imprimir secretos ----------------------------------------------------------
const secretos = [];
for (const flujo of [process.stdout, process.stderr]) {
  const original = flujo.write.bind(flujo);
  flujo.write = (trozo, cod, cb) => {
    let texto = typeof trozo === 'string' ? trozo : Buffer.from(trozo).toString('utf8');
    for (const s of secretos) if (s) texto = texto.split(s).join('[OCULTO]');
    return typeof cod === 'function' ? original(texto, cod) : original(texto, cod, cb);
  };
}

// =====================================================================================
sec(`TI-PR-01 · CARGA FASE B · MODO ${modo}`);

// --- 1 · Huella del Excel ----------------------------------------------------------
sec('1 · EXCEL FUENTE');
let excelBuf;
try { excelBuf = readFileSync(EXCEL); }
catch { abortar(`no encuentro el Excel fuente en:\n  ${EXCEL}`); }
const sha = createHash('sha256').update(excelBuf).digest('hex');
console.log(`   ruta   ${EXCEL}`);
console.log(`   bytes  ${excelBuf.length}`);
console.log(`   mtime  ${statSync(EXCEL).mtime.toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
console.log(`   sha256 ${sha}`);
if (sha !== EXCEL_SHA256) {
  abortar(`el Excel NO es el autorizado.\n  esperado: ${EXCEL_SHA256}\n  leido:    ${sha}\n`
        + `  Si el cambio es legitimo, hay que revalidar la carga y actualizar EXCEL_SHA256.`);
}
console.log(`   coincide con la huella autorizada`);

// --- 2 · Lectura del Excel ---------------------------------------------------------
const JSZip = (await import(pathToFileURL(resolve(BACKEND, 'node_modules/jszip/lib/index.js')).href)).default;
const zip = await JSZip.loadAsync(excelBuf);
const libro = await zip.file('xl/workbook.xml').async('string');
const relaciones = await zip.file('xl/_rels/workbook.xml.rels').async('string');
const mapaRel = {};
for (const m of relaciones.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
  mapaRel[m[1]] = m[2].replace(/^\/?xl\//, '');
}
const hojas = [...libro.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
  .map(m => ({ nombre: m[1], parte: 'xl/' + mapaRel[m[2]] }));
const cadenas = [...(await zip.file('xl/sharedStrings.xml').async('string'))
  .matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));

const leerHoja = async nombre => {
  const hoja = hojas.find(h => h.nombre === nombre);
  if (!hoja) abortar(`el Excel no tiene la hoja "${nombre}"`);
  const xml = await zip.file(hoja.parte).async('string');
  const desde = xml.indexOf('<sheetData>') + 11;
  const hasta = xml.indexOf('</sheetData>');
  return [...xml.slice(desde, hasta).matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
    .map(m => {
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
const aFecha = valor => {
  if (!valor) return null;
  if (/^\d+(\.\d+)?$/.test(valor)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(+valor) * 86400000)
      .toISOString().slice(0, 10);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return iso ? iso[0] : null;
};

sec('2 · DATOS LEIDOS DEL EXCEL');
const hojaPrograma = await leerHoja('TI-PR-01');
const fila1 = hojaPrograma.find(f => f.r === 1)?.c ?? {};
const fila2 = hojaPrograma.find(f => f.r === 2)?.c ?? {};
const fila3 = hojaPrograma.find(f => f.r === 3)?.c ?? {};
const fila4 = hojaPrograma.find(f => f.r === 4)?.c ?? {};
const fila5 = hojaPrograma.find(f => f.r === 5)?.c ?? {};

const NOMBRE = fila2.D ?? '';
const codigoExcel = (fila1.AA ?? '').replace(/\s+/g, '');
const versionExcel = fila2.AB ?? '';
const fechaExcel = aFecha(fila3.AB ?? '');
const diasM1 = Number(fila3.AD), diasM2 = Number(fila4.AD), diasM3 = Number(fila5.AD);

console.log(`   nombre           "${NOMBRE}"`);
console.log(`   codigo cajetin   "${fila1.AA}" -> normalizado "${codigoExcel}"`);
console.log(`   version cajetin  "${versionExcel}"  fecha "${fila3.AB}" -> ${fechaExcel}`);
console.log(`   ciclos en dias   M1=${diasM1} M2=${diasM2} M3=${diasM3}`);

chk(NOMBRE.length > 0 && NOMBRE.length <= 200, 'nombre del programa presente y cabe en varchar(200)', `${NOMBRE.length} caracteres`);
chk(codigoExcel === CODIGO, 'el codigo del cajetin coincide', `${codigoExcel} = ${CODIGO}`);
chk(versionExcel === VERSION, 'la version del cajetin coincide', `${versionExcel} = ${VERSION}`);
chk(fechaExcel === FECHA_DOCUMENTO, 'la fecha del cajetin coincide', `${fechaExcel} = ${FECHA_DOCUMENTO}`);
chk(diasM1 === DIAS_ESPERADOS.M1 && diasM2 === DIAS_ESPERADOS.M2 && diasM3 === DIAS_ESPERADOS.M3,
  'los ciclos en dias del cajetin coinciden', `${diasM1}/${diasM2}/${diasM3} = 15/90/180`);

// Periodicidades declaradas en IMP_PERIODICIDAD, en dias
const periodicidad = (await leerHoja('IMP_PERIODICIDAD')).filter(f => f.r >= 2 && f.c.A);
const dias = {};
for (const f of periodicidad) dias[`${f.c.A}|M${f.c.B}`] = Number(f.c.C);
const desajustes = [];
for (const [tipo, nivel] of [['DVR','M1'],['DVR','M2'],['DVR','M3'],
                             ['COPILOTO','M1'],['COPILOTO','M2'],['COPILOTO','M3'],
                             ['RADIO_BASE','M1'],['RADIO_BASE','M2'],['RADIO_BASE','M3'],
                             ['CAMARA_INTERNA','M1'],['CAMARA_INTERNA','M2'],['CAMARA_INTERNA','M3'],
                             ['CAMARA_EXTERNA','M1'],['CAMARA_EXTERNA','M2'],['CAMARA_EXTERNA','M3']]) {
  const d = dias[`${tipo}|${nivel}`];
  if (d !== DIAS_ESPERADOS[nivel]) desajustes.push(`${tipo}/${nivel}=${d}`);
}
if (dias['GPS|M3'] !== GPS_DIAS_ESPERADOS) desajustes.push(`GPS/M3=${dias['GPS|M3']}`);
chk(desajustes.length === 0, 'IMP_PERIODICIDAD respalda las 13 periodicidades',
  desajustes.length ? `desajustes: ${desajustes.join(' ')}` : 'M1=15 M2=90 M3=180 dias · GPS M3=365 dias');
chk(FRECUENCIAS.length === 13, 'se cargaran 13 periodicidades en quincenas', 'M1=1 M2=6 M3=12 · GPS M3=24');
chk(!FRECUENCIAS.some(f => f[0] === 'ADAS'), 'ADAS excluido de las periodicidades',
  'se inventaria pero no se mantiene');

// 174 unidades activas
const UNIDADES = (await leerHoja('IMP_UNIDADES')).filter(f => f.r >= 2 && f.c.A).map(f => f.c.A);
chk(UNIDADES.length === ESPERADO.unidades, 'unidades activas en IMP_UNIDADES', `${UNIDADES.length}`);
chk(new Set(UNIDADES).size === UNIDADES.length, 'sin placas repetidas en IMP_UNIDADES', 'todas distintas');

// Inventario: las 175 unidades presentes en STATUS
const inventario = [];
const hojaDe = {};
const conteoEstado = { INSTALADO: 0, NO_APLICA: 0, POR_VALIDAR: 0 };
const seriesDescartadas = {};
for (const [hoja, fuente] of [['STATUS CAMIONETAS', 'STATUS_CAMIONETAS'],
                              ['STATUS TRACTOS',    'STATUS_TRACTOS']]) {
  for (const f of await leerHoja(hoja)) {
    if (f.r < 5) continue;
    const placa = f.c.B || '';
    if (!placa || hojaDe[placa]) continue;
    hojaDe[placa] = hoja;
    for (const b of BLOQUES) {
      const evidencia = f.c[b.ev] || '';
      let estado, marca = null, serie = null, fecha = null;
      if (evidencia === '') estado = 'POR_VALIDAR';
      else if (evidencia.toUpperCase() === 'NO APLICA') estado = 'NO_APLICA';
      else {
        estado = 'INSTALADO';
        marca = evidencia;
        const s = b.serie ? (f.c[b.serie] || '') : '';
        if (s && SERIE_NO_ES_SERIE.has(s.toUpperCase())) {
          seriesDescartadas[`${b.tipo}|${s}`] = (seriesDescartadas[`${b.tipo}|${s}`] || 0) + 1;
        } else if (s) serie = s;
        fecha = aFecha(f.c[b.fecha] || '');
      }
      conteoEstado[estado]++;
      inventario.push([placa, b.tipo, estado, marca, serie, fecha, (f.c[b.obs] || '') || null, fuente]);
    }
  }
}
const PLACAS_STATUS = Object.keys(hojaDe);
const HISTORICAS = PLACAS_STATUS.filter(p => !UNIDADES.includes(p));
console.log(`\n   inventario derivado: ${inventario.length} filas · ${PLACAS_STATUS.length} placas`);
console.log(`      INSTALADO=${conteoEstado.INSTALADO} NO_APLICA=${conteoEstado.NO_APLICA} POR_VALIDAR=${conteoEstado.POR_VALIDAR}`);
console.log(`      historicas fuera del programa: ${HISTORICAS.length ? HISTORICAS.join(' ') : 'ninguna'}`);
for (const [clave, n] of Object.entries(seriesDescartadas)) {
  console.log(`      serie no importada (es un marcador): ${clave.replace('|', ' -> ')} x${n}`);
}
chk(inventario.length === ESPERADO.inventario_total, 'filas de inventario derivadas', `${inventario.length}`);
chk(PLACAS_STATUS.length === ESPERADO.placas_inventario, 'placas presentes en STATUS', `${PLACAS_STATUS.length}`);
chk(UNIDADES.every(p => hojaDe[p]), 'las 174 activas tienen fila en STATUS', 'ninguna sin inventario');
chk(conteoEstado.INSTALADO === ESPERADO.instalado
 && conteoEstado.NO_APLICA === ESPERADO.no_aplica
 && conteoEstado.POR_VALIDAR === ESPERADO.por_validar,
  'reparto de estados igual al validado', `${conteoEstado.INSTALADO}/${conteoEstado.NO_APLICA}/${conteoEstado.POR_VALIDAR}`);

// Contraste contra la hoja derivada del propio libro
const derivada = (await leerHoja('IMP_EQUIPOS_STATUS')).filter(f => f.r >= 2 && f.c.A && PLACAS_STATUS.includes(f.c.A));
const normalizar = v => {
  const x = (v || '').toUpperCase();
  if (x === '' || x === 'POR_VALIDAR') return 'POR_VALIDAR';
  if (x === 'NO' || x === 'NO APLICA' || x === 'NO_APLICA') return 'NO_APLICA';
  if (x === 'SI' || x === 'SÍ') return 'INSTALADO';
  return `DESCONOCIDO(${x})`;
};
const mio = {};
for (const f of inventario) mio[`${f[0]}|${f[1]}`] = f[2];
const divergentes = derivada.filter(f => mio[`${f.c.A}|${f.c.C}`] !== normalizar(f.c.D));
chk(derivada.length === ESPERADO.inventario_total && divergentes.length === 0,
  'cruce contra IMP_EQUIPOS_STATUS del propio libro',
  `${derivada.length - divergentes.length}/${derivada.length} coinciden`
  + (divergentes.length ? ` · divergen: ${divergentes.slice(0, 5).map(f => `${f.c.A}/${f.c.C}`).join(' ')}` : ''));

if (fallos > 0) abortar(`${fallos} comprobacion(es) del Excel han fallado. No se abre transaccion.`);

// --- 3 · Base de datos ------------------------------------------------------------
const { pool } = await import(pathToFileURL(resolve(BACKEND, 'src/config/database.js')).href);
let anfitrion = '';
{
  const u = new URL(process.env.DATABASE_URL);
  anfitrion = u.hostname;
  secretos.push(process.env.DATABASE_URL, u.href, u.host, u.hostname, u.username, u.password);
  secretos.sort((a, b) => (b || '').length - (a || '').length);
}

const cliente = await pool.connect();
const una = async (sql, params) => (await cliente.query(sql, params)).rows[0];
const filasDe = async tabla => (await una(`SELECT count(*)::int AS n FROM ${tabla}`)).n;
let confirmado = false;

try {
  sec('3 · PRECONDICIONES DE LA BASE');
  const id = await una(`SELECT current_database() AS db, current_schema() AS esquema,
    pg_is_in_recovery() AS replica`);
  const endpoint = (anfitrion.split('.')[0] || '').replace(/-pooler$/, '').slice(-4);
  console.log(`   ${id.db} · ${id.esquema} · endpoint ...${endpoint}`);
  chk(id.db === 'neondb' && id.esquema === 'public', 'base y esquema', `${id.db}/${id.esquema}`);
  chk(id.replica === false, 'no es una replica de solo lectura', `pg_is_in_recovery=${id.replica}`);

  // 004 aplicada
  const m4 = await una(`SELECT
    (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_version_vigencia_quincena') AS ancla,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='uq_frecuencia_programa_equipo_nivel') AS uq,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='fk_programacion_equipo_frecuencia') AS fk,
    (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public'
       AND table_name='programa_mantenimiento_frecuencias' AND column_name='version_id') AS version_nullable`);
  chk(m4.ancla === 0 && m4.uq === 1 && m4.fk === 1 && m4.version_nullable === 'YES',
    '004 desacople aplicada', `ancla=${m4.ancla} uq=${m4.uq} fk=${m4.fk} version_id nullable=${m4.version_nullable}`);

  // 005 aplicada
  const m5 = await una(`SELECT to_regclass('public.vehiculo_equipos') IS NOT NULL AS existe`);
  chk(m5.existe === true, '005 inventario aplicada', 'vehiculo_equipos existe');

  // 006 aplicada
  const m6 = await una(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE placa LIKE '%-%')::int AS con_guion,
    count(*) FILTER (WHERE placa='V5K756')::int AS historica FROM vehiculos`);
  chk(m6.total === ESPERADO.vehiculos, '006 reconciliacion aplicada · total de vehiculos', `${m6.total}`);
  chk(m6.con_guion === 6, 'solo 6 placas conservan guion', `${m6.con_guion}`);
  chk(m6.historica === 1, 'la unidad historica esta con placa canonica', 'V5K756 presente');

  // Todas las placas que vamos a usar existen en el maestro
  const faltan = await una(`SELECT count(*)::int AS n FROM unnest($1::text[]) AS p
    WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = p)`, [PLACAS_STATUS]);
  chk(faltan.n === 0, 'las 175 placas del inventario existen en vehiculos',
    faltan.n ? `faltan ${faltan.n}` : 'ninguna falta');

  // Nada cargado todavia · aborta claro si TI-PR-01 ya existe
  const yaExiste = await una(`SELECT count(*)::int AS n FROM programas_mantenimiento WHERE codigo=$1`, [CODIGO]);
  if (yaExiste.n > 0) {
    abortar(`el programa ${CODIGO} YA EXISTE en la base (${yaExiste.n} fila).\n`
          + `  Esta carga es inicial y no sobreescribe nada. Si hay que recargar, primero\n`
          + `  decide explicitamente que hacer con lo ya cargado.`);
  }
  chk(yaExiste.n === 0, `${CODIGO} no existe todavia`, 'carga inicial limpia');
  let previas = 0;
  for (const t of ['programas_mantenimiento', 'programas_mantenimiento_versiones',
                   'programa_mantenimiento_frecuencias', 'programa_mantenimiento_unidades',
                   'programa_mantenimiento_unidad_ciclos', 'programacion_mantenimiento',
                   'programacion_mantenimiento_equipos', 'vehiculo_equipos']) {
    previas += await filasDe(t);
  }
  chk(previas === 0, 'las 8 tablas de destino estan vacias', `suma = ${previas}`);

  if (fallos > 0) abortar(`${fallos} precondicion(es) han fallado. No se abre transaccion.`);

  // --- 4 · Carga en UNA transaccion ----------------------------------------------
  sec('4 · CARGA · UNA SOLA TRANSACCION');
  await cliente.query('BEGIN');

  // CONTRATO POSTERIOR A 20261001_900 Y _901. El encabezado ya no lleva periodo_inicio,
  // periodo_fin, version, fecha_documento ni frecuencia_m1/m2/m3_dias. No se pierde ningun
  // dato: los cuatro documentales van a programas_mantenimiento_versiones en B0-bis, y la
  // periodicidad a programa_mantenimiento_frecuencias en B1, que es su sitio definitivo.
  // Aqui solo eran duplicacion que esas columnas NOT NULL obligaban a rellenar.
  //
  // Consecuencia: este cargador exige el esquema YA limpio. Sobre el esquema anterior
  // fallaria con 23502 por esas columnas. No es un problema practico -aborta antes si
  // TI-PR-01 existe, y es un cargador de un solo uso ya ejecutado-, pero queda dicho.
  const programa = await una(`INSERT INTO programas_mantenimiento
      (codigo, nombre, estado)
    VALUES ($1,$2,$3) RETURNING id`,
    [CODIGO, NOMBRE, ESTADO_PROGRAMA]);
  console.log(`   B0      programa ${CODIGO} creado`);
  console.log(`           nombre "${NOMBRE}"`);
  console.log(`           encabezado sin datos documentales ni periodicidad: van a B0-bis y B1`);

  const version = await una(`INSERT INTO programas_mantenimiento_versiones
      (programa_id, version, fecha_documento, vigencia_desde, vigencia_hasta,
       periodo_inicio, periodo_fin, estado, observaciones)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, vigencia_desde::text AS desde`,
    [programa.id, VERSION, FECHA_DOCUMENTO, VIGENCIA_DESDE, VIGENCIA_HASTA,
     PERIODO_INICIO, PERIODO_FIN, ESTADO_VERSION, OBSERVACION_V01]);
  console.log(`   B0-bis  version ${VERSION} · fecha_documento ${FECHA_DOCUMENTO} · vigencia_desde ${version.desde} · sin vigencia_hasta · ${ESTADO_VERSION}`);

  // version_id = NULL a proposito: la periodicidad pertenece al PROGRAMA
  const frec = await cliente.query(`INSERT INTO programa_mantenimiento_frecuencias
      (programa_id, version_id, tipo_equipo, nivel_mantenimiento, frecuencia_quincenas)
    SELECT $1, NULL, t.tipo, t.nivel, t.q
    FROM unnest($2::text[], $3::text[], $4::int[]) AS t(tipo, nivel, q)`,
    [programa.id, FRECUENCIAS.map(f => f[0]), FRECUENCIAS.map(f => f[1]), FRECUENCIAS.map(f => f[2])]);
  console.log(`   B1      ${frec.rowCount} periodicidades · version_id = NULL en todas`);

  const uni = await cliente.query(`INSERT INTO programa_mantenimiento_unidades (programa_id, placa)
    SELECT $1, p FROM unnest($2::text[]) AS p`, [programa.id, UNIDADES]);
  console.log(`   B2      ${uni.rowCount} unidades activas · V5K756 no entra (vendida, en BAJAS)`);
  console.log(`           quincena_incorporacion queda NULL: la fase de cada equipo vive en ciclos y anclas`);

  let cargadas = 0;
  const LOTE = 200;
  for (let i = 0; i < inventario.length; i += LOTE) {
    const trozo = inventario.slice(i, i + LOTE);
    const r = await cliente.query(`INSERT INTO vehiculo_equipos
        (placa, tipo_equipo, estado_inventario, marca, numero_serie,
         fecha_instalacion, observaciones, fuente)
      SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[],
                           $5::varchar[], $6::date[], $7::text[], $8::varchar[])`,
      [trozo.map(f => f[0]), trozo.map(f => f[1]), trozo.map(f => f[2]), trozo.map(f => f[3]),
       trozo.map(f => f[4]), trozo.map(f => f[5]), trozo.map(f => f[6]), trozo.map(f => f[7])]);
    cargadas += r.rowCount;
  }
  console.log(`   B3      ${cargadas} filas de inventario · ${PLACAS_STATUS.length} unidades`);

  // --- 5 · Conteos ANTES del COMMIT ----------------------------------------------
  sec('5 · CONTEOS ANTES DEL COMMIT');
  const c = await una(`SELECT
    (SELECT count(*)::int FROM programas_mantenimiento WHERE codigo=$1) AS programa,
    (SELECT count(*)::int FROM programas_mantenimiento_versiones) AS version,
    (SELECT count(*)::int FROM programa_mantenimiento_frecuencias) AS frecuencias,
    (SELECT count(*)::int FROM programa_mantenimiento_frecuencias WHERE version_id IS NULL) AS frec_sin_version,
    (SELECT count(*)::int FROM programa_mantenimiento_unidades) AS unidades,
    (SELECT count(*)::int FROM vehiculo_equipos) AS inventario,
    (SELECT count(DISTINCT placa)::int FROM vehiculo_equipos) AS placas,
    (SELECT count(*)::int FROM vehiculo_equipos e
       WHERE EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u WHERE u.placa=e.placa)) AS inv_activo,
    (SELECT count(*)::int FROM vehiculo_equipos e
       WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u WHERE u.placa=e.placa)) AS inv_historico,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
    (SELECT count(*)::int FROM programacion_mantenimiento) AS programaciones,
    (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS detalles,
    (SELECT count(*)::int FROM vehiculos) AS vehiculos,
    (SELECT count(*)::int FROM vehiculos WHERE dvr_instalado IS NOT NULL
       OR copiloto_instalado IS NOT NULL OR radio_base_instalado IS NOT NULL
       OR camaras_instaladas IS NOT NULL OR gps_instalado IS NOT NULL) AS booleanos_poblados`, [CODIGO]);
  for (const [etq, valor, esperado] of [
    ['programa',                 c.programa,        ESPERADO.programa],
    ['version documental',        c.version,         ESPERADO.version],
    ['frecuencias',               c.frecuencias,     ESPERADO.frecuencias],
    ['frecuencias con version_id NULL', c.frec_sin_version, ESPERADO.frecuencias],
    ['unidades del programa',     c.unidades,        ESPERADO.unidades],
    ['inventario total',          c.inventario,      ESPERADO.inventario_total],
    ['inventario de activas',     c.inv_activo,      ESPERADO.inventario_activo],
    ['inventario historico',      c.inv_historico,   ESPERADO.inventario_historico],
    ['placas con inventario',     c.placas,          ESPERADO.placas_inventario],
    ['ciclos',                    c.ciclos,          ESPERADO.ciclos],
    ['programaciones',            c.programaciones,  ESPERADO.programaciones],
    ['detalles de programacion',  c.detalles,        ESPERADO.detalles],
    ['vehiculos en el maestro',   c.vehiculos,       ESPERADO.vehiculos],
    ['booleanos legacy poblados', c.booleanos_poblados, 0],
  ]) chk(valor === esperado, etq, `${valor} (esperado ${esperado})`);

  const porTipo = await cliente.query(`SELECT tipo_equipo,
      count(*) FILTER (WHERE estado_inventario='INSTALADO')::int AS instalado,
      count(*) FILTER (WHERE estado_inventario='NO_APLICA')::int AS no_aplica,
      count(*) FILTER (WHERE estado_inventario='POR_VALIDAR')::int AS por_validar
    FROM vehiculo_equipos GROUP BY 1 ORDER BY 1`);
  console.log(`\n   tipo fisico          INSTALADO  NO_APLICA  POR_VALIDAR`);
  let tiposOk = true;
  for (const t of porTipo.rows) {
    const e = POR_TIPO[t.tipo_equipo];
    const bien = e && t.instalado === e.INSTALADO && t.no_aplica === e.NO_APLICA && t.por_validar === e.POR_VALIDAR;
    if (!bien) tiposOk = false;
    console.log(`   ${t.tipo_equipo.padEnd(18)} ${String(t.instalado).padStart(9)} ${String(t.no_aplica).padStart(10)} ${String(t.por_validar).padStart(12)}  ${bien ? '' : '<-- NO COINCIDE'}`);
  }
  chk(tiposOk && porTipo.rows.length === 8, 'conteos por tipo iguales a los validados', `${porTipo.rows.length} tipos`);

  // --- 6 · Validacion completa ----------------------------------------------------
  sec('6 · FICHERO DE VALIDACION COMPLETO');
  const textoVal = readFileSync(VALIDATION, 'utf8');
  const consultas = (() => {
    const salida = []; let acumulado = '', dolar = false;
    for (const linea of textoVal.replace(/\r\n/g, '\n').split('\n')) {
      const limpia = linea.replace(/--.*$/, '');
      if (/\$\$/.test(limpia)) {
        for (let i = 0; i < (limpia.match(/\$\$/g) || []).length; i++) dolar = !dolar;
      }
      acumulado += limpia + '\n';
      if (!dolar && /;\s*$/.test(limpia)) { if (acumulado.trim()) salida.push(acumulado.trim()); acumulado = ''; }
    }
    if (acumulado.trim()) salida.push(acumulado.trim());
    return salida.filter(s => /^\s*(SELECT|WITH)\b/i.test(s));
  })();
  const sinLiterales = s => s.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  const prohibidas = consultas.filter(s =>
    /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|COPY|MERGE|CALL|DO|VACUUM|REFRESH|SET|LOCK)\b/i
      .test(sinLiterales(s)));
  chk(prohibidas.length === 0, 'el fichero de validacion es de solo lectura',
    `${consultas.length} consultas, ${prohibidas.length} con verbos de escritura`);

  const recuento = { PASS: 0, FAIL: 0, 'N/A': 0 };
  const porClase = {};
  const enFallo = [];
  for (const consulta of consultas) {
    const { rows } = await cliente.query(consulta);
    for (const v of rows) {
      const estado = v.estado.startsWith('PASS') ? 'PASS'
                   : v.estado.startsWith('FAIL') ? 'FAIL' : 'N/A';
      recuento[estado]++;
      porClase[v.clase] = porClase[v.clase] || { PASS: 0, FAIL: 0, 'N/A': 0 };
      porClase[v.clase][estado]++;
      if (estado === 'FAIL') enFallo.push(`${v.id} · ${v.regla} · ${v.detalle}`);
      if (estado !== 'PASS') {
        console.log(`   [${estado === 'FAIL' ? 'FALLA' : 'N/A  '}] ${String(v.id).padEnd(6)} ${v.clase.padEnd(13)} ${v.regla}`);
        console.log(`            ${v.detalle}`);
      }
    }
  }
  console.log(`   ${recuento.PASS} PASS · ${recuento.FAIL} FAIL · ${recuento['N/A']} N/A  (de ${consultas.length} consultas)`);
  for (const [clase, v] of Object.entries(porClase).sort()) {
    console.log(`      ${clase.padEnd(14)} PASS=${v.PASS} FAIL=${v.FAIL} N/A=${v['N/A']}`);
  }
  chk(recuento.FAIL === 0, 'ninguna regla de validacion falla',
    enFallo.length ? enFallo.join(' | ') : `${recuento.PASS} PASS, ${recuento['N/A']} N/A declarados`);

  // --- 7 · Cierre -----------------------------------------------------------------
  sec(`7 · CIERRE · ${aciertos} OK · ${fallos} FALLAS`);
  if (fallos > 0) {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK ejecutado POR FALLOS. La base queda exactamente como estaba.');
  } else if (modo === 'ENSAYO') {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK ejecutado (modo ensayo). Nada se ha guardado.');
    console.log('   Para cargar de verdad: repetir con --confirmar');
  } else {
    await cliente.query('COMMIT');
    confirmado = true;
    console.log('   COMMIT ejecutado. La Fase B de TI-PR-01 queda cargada.');
  }
} catch (error) {
  fallos++;
  console.error(`\n   *** EXCEPCION ***  ${error.code || ''} ${error.message}`);
  if (error.detail)     console.error(`   detalle: ${error.detail}`);
  if (error.constraint) console.error(`   constraint: ${error.constraint}`);
  try { await cliente.query('ROLLBACK'); console.error('   ROLLBACK ejecutado. La base queda como estaba.'); }
  catch { /* la transaccion ya no existia */ }
} finally {
  cliente.release();
  await pool.end();
}

console.log(`\nRESULTADO: ${fallos > 0 ? 'NO CARGADA' : confirmado ? 'CARGADA (COMMIT)' : 'ensayo correcto, revertido'}`);
process.exit(fallos > 0 ? 2 : 0);
