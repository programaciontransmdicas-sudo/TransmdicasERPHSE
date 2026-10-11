// =====================================================================================
// TI-PR-01 · SIEMBRA DE LAS ANCLAS DE CADENCIA M2 / M3
// =====================================================================================
//   node backend/scripts/ti-pr-01/cargar-anclas-cadencia.mjs --ensayo     prueba, ROLLBACK
//   node backend/scripts/ti-pr-01/cargar-anclas-cadencia.mjs --confirmar  carga real, COMMIT
//
// Sin bandera no hace nada: obliga a declarar la intencion.
//
// Puebla EXCLUSIVAMENTE programa_mantenimiento_unidad_anclas. No toca los 688 ciclos, ni
// el inventario, ni las unidades, ni las periodicidades, ni la programacion. No crea
// programaciones ni ordenes de trabajo.
//
// Requiere la migracion 20260924_012 aplicada.
//
// -------------------------------------------------------------------------------------
// POR QUE NO HAY PUERTA DE SHA DEL EXCEL
// -------------------------------------------------------------------------------------
// Los otros loaders (cargar-fase-b, cargar-b4-ciclos-m1, cargar-m3-historico-anual) leen
// el libro y por eso fijan su SHA-256. Este NO abre el Excel: su fuente es la tabla
// programa_mantenimiento_unidad_ciclos, que ya esta cargada y validada. Poner aqui una
// constante de SHA seria decorativo y enganoso, porque nada la usaria.
//
// La trazabilidad al libro no se pierde: cada ciclo M1 del que se deriva un ancla ya cita
// en sus observaciones el SHA del Excel, la hoja y la fila de origen, y cada ancla cita a
// su vez el id del ciclo del que sale.
//
// -------------------------------------------------------------------------------------
// QUE SIEMBRA, Y POR QUE ESOS Y NO OTROS
// -------------------------------------------------------------------------------------
// Por cada fila M1 existente de CAMARAS, COPILOTO y RADIO_BASE, dos anclas:
// (hasta 017 tambien de DVR; la 20261007_017 retiro esa familia y sus 290 anclas)
//   ancla M2 = ultima_quincena de ese M1
//   ancla M3 = ultima_quincena de ese M1
//
// 531 filas M1 x 2 niveles = 1062 anclas, sobre 145 unidades.
//
// NO se crean:
//   * anclas M1    -> la fila de ciclo M1 ya ES la referencia de ese nivel;
//   * anclas GPS   -> tiene 156 ciclos M3 reales, esos gobiernan;
//   * anclas ADAS  -> tiene 1 ciclo M3 real;
//   * anclas para las 29 unidades sin ningun M1 -> no hay de donde derivarlas y no se
//     inventa una fecha. Quedan fuera del calendario hasta que exista evidencia.
//
// -------------------------------------------------------------------------------------
// QUE SIGNIFICA EL ANCLA
// -------------------------------------------------------------------------------------
// No es la proxima fecha. Es la referencia fija de fase desde la que se calcula el PRIMER
// vencimiento de un nivel que todavia nunca tuvo ejecucion real:
//
//   proximo(N) = COALESCE(ultima_quincena del ciclo N, quincena_ancla del nivel N)
//                + frecuencia_quincenas(N)
//
// El ciclo real SIEMPRE tiene precedencia. Un M1 posterior NO desplaza las anclas M2/M3:
// eso es justamente lo que esta tabla evita.
//
// -------------------------------------------------------------------------------------
// IDEMPOTENCIA
// -------------------------------------------------------------------------------------
// Siembra inicial, no sincronizador. Si ya existe alguna ancla, ABORTA en precondiciones
// antes de tocar nada y sin abrir transaccion de escritura: que hacer con lo ya cargado
// es una decision humana. Ni borra, ni fusiona, ni reescribe.
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

const CODIGO = 'TI-PR-01';
// 017 · DVR fuera: ya no es familia programable y chk_ancla_tipo_equipo lo rechaza.
const QUINCENALES = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
const ANUALES = ['GPS', 'ADAS'];
const NIVELES_ANCLA = ['M2', 'M3'];
const ORIGEN = 'DERIVADA_M1_INICIAL';

// Conteos de ESTA carga. Viven aqui y no en la migracion 20260924_012: describen el
// snapshot de esta base, no la estructura. La migracion solo comprueba invariantes
// estructurales, para poder desplegarse en otra base sin abortar sin motivo.
const ESPERADO = {
  frecuencias: 14,
  ciclos: 688,
  m1: 531,
  m1Quincenal: 531,
  anualM3: 157,
  m2m3Quincenal: 0,
  unidades: 174,
  unidadesConM1: 145,
  unidadesSinM1: 29,
  anclas: 1062,
};

const modo = process.argv.includes('--confirmar') ? 'CONFIRMAR'
  : process.argv.includes('--ensayo') ? 'ENSAYO' : null;
const sec = t => console.log(`\n${'='.repeat(94)}\n${t}\n${'='.repeat(94)}`);
let fallos = 0, aciertos = 0;
const chk = (bien, etiqueta, detalle) => {
  if (bien) { aciertos++; console.log(`   [OK]    ${etiqueta.padEnd(54)} ${detalle}`); }
  else { fallos++; console.log(`   [FALLA] ${etiqueta.padEnd(54)} ${detalle}`); }
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

sec(`TI-PR-01 · ANCLAS DE CADENCIA M2 / M3 · MODO ${modo}`);

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
let confirmado = false;

try {
  sec('1 · PRECONDICIONES');
  const id = await una(`SELECT current_database() AS db, current_schema() AS esquema,
    pg_is_in_recovery() AS replica, current_setting('default_transaction_read_only') AS ro,
    (now() AT TIME ZONE 'America/Lima')::text AS ahora_lima`);
  const endpoint = (anfitrion.split('.')[0] || '').replace(/-pooler$/, '').slice(-4);
  console.log(`   ${id.db} · ${id.esquema} · endpoint ...${endpoint} · ahora en Lima ${id.ahora_lima}`);
  chk(id.db === 'neondb' && id.esquema === 'public' && id.replica === false && id.ro === 'off',
    'base, esquema, no-replica y sesion escribible',
    `${id.db}/${id.esquema} replica=${id.replica} ro=${id.ro}`);

  const prog = await una(`SELECT id FROM programas_mantenimiento WHERE codigo = $1`, [CODIGO]);
  if (!prog) abortar(`el programa ${CODIGO} no existe.`);
  chk(true, `programa ${CODIGO} presente`, 'programa_id interno asignado');

  // 012 aplicada
  if ((await una(`SELECT to_regclass('public.programa_mantenimiento_unidad_anclas') IS NULL AS n`)).n) {
    abortar('la tabla programa_mantenimiento_unidad_anclas no existe. '
      + 'Ejecuta primero backend/migrations/20260924_012_ti_pr_01_anclas_cadencia_expand.sql');
  }
  const estruct = await una(`SELECT
    (SELECT count(*)::int FROM pg_constraint
      WHERE conrelid='programa_mantenimiento_unidad_anclas'::regclass AND contype='c') AS checks,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='uq_ancla_unidad_equipo_nivel') AS uq,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='fk_ancla_unidad' AND convalidated) AS fk,
    (SELECT count(*)::int FROM pg_trigger
      WHERE tgname='trg_set_updated_at_programa_mantenimiento_unidad_anclas' AND NOT tgisinternal) AS trg`);
  chk(estruct.checks >= 5 && estruct.uq === 1 && estruct.fk === 1 && estruct.trg === 1,
    'migracion 20260924_012 aplicada y completa',
    `checks=${estruct.checks} uq=${estruct.uq} fk=${estruct.fk} trg=${estruct.trg}`);

  // --- IDEMPOTENCIA: si ya hay anclas, no se toca nada --------------------------------
  const ya = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas`);
  if (ya.n > 0) {
    abortar(`programa_mantenimiento_unidad_anclas ya tiene ${ya.n} filas.\n`
      + `  Esta es una siembra inicial y no sobreescribe ni fusiona.\n`
      + `  Que hacer con lo ya cargado es una decision humana.\n`
      + `  No se ha abierto ninguna transaccion de escritura: la base queda intacta.`);
  }
  chk(ya.n === 0, 'la tabla de anclas esta vacia', '0 filas');

  // --- conteos de esta carga ---------------------------------------------------------
  sec('2 · CONTEOS DE ESTA CARGA (las guardas que no viven en la migracion)');
  const n = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_frecuencias) AS frecuencias,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE nivel_mantenimiento='M1') AS m1,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE nivel_mantenimiento='M1' AND tipo_equipo = ANY($1)) AS m1_quincenal,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE tipo_equipo = ANY($2) AND nivel_mantenimiento='M3') AS anual_m3,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE tipo_equipo = ANY($1) AND nivel_mantenimiento IN ('M2','M3')) AS m2m3_quincenal,
    (SELECT count(*)::int FROM programa_mantenimiento_unidades) AS unidades,
    (SELECT count(DISTINCT programa_unidad_id)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE nivel_mantenimiento='M1' AND tipo_equipo = ANY($1)) AS con_m1`,
    [QUINCENALES, ANUALES]);
  chk(n.frecuencias === ESPERADO.frecuencias, 'periodicidades', `${n.frecuencias}`);
  chk(n.ciclos === ESPERADO.ciclos, 'ciclos totales', `${n.ciclos}`);
  chk(n.m1 === ESPERADO.m1, 'ciclos M1', `${n.m1}`);
  chk(n.m1_quincenal === ESPERADO.m1Quincenal, 'ciclos M1 de familias quincenales', `${n.m1_quincenal}`);
  chk(n.anual_m3 === ESPERADO.anualM3, 'ciclos M3 anuales (GPS + ADAS)', `${n.anual_m3}`);
  chk(n.m2m3_quincenal === ESPERADO.m2m3Quincenal,
    'ciclos M2/M3 de familias quincenales', `${n.m2m3_quincenal} (si hubiera, el ancla ya no haria falta)`);
  chk(n.unidades === ESPERADO.unidades, 'unidades del programa', `${n.unidades}`);
  chk(n.con_m1 === ESPERADO.unidadesConM1, 'unidades con al menos un M1 quincenal', `${n.con_m1}`);
  if (fallos > 0) abortar(`${fallos} precondicion(es) no se cumplen. No se ha escrito nada.`);

  // --- insercion ---------------------------------------------------------------------
  sec('3 · SIEMBRA EN UNA SOLA TRANSACCION');
  await cliente.query('BEGIN');
  const r = await cliente.query(`INSERT INTO programa_mantenimiento_unidad_anclas
      (programa_unidad_id, programa_id, tipo_equipo, nivel_mantenimiento, quincena_ancla,
       origen, observaciones)
    SELECT c.programa_unidad_id, c.programa_id, c.tipo_equipo, n.nivel, c.ultima_quincena,
      $2,
      'Ancla de fase derivada del M1 historico de la propia unidad y familia (ciclo id '
      || c.id || ', ultima_quincena ' || c.ultima_quincena || '). NO es la proxima fecha: '
      || 'es la referencia fija desde la que se calcula el primer ' || n.nivel
      || '. Un M1 posterior no la desplaza. En cuanto exista un ' || n.nivel
      || ' ejecutado real, ese ciclo tiene precedencia sobre esta ancla.'
    FROM programa_mantenimiento_unidad_ciclos c
    CROSS JOIN unnest($3::text[]) AS n(nivel)
    WHERE c.nivel_mantenimiento = 'M1' AND c.tipo_equipo = ANY($1)`,
    [QUINCENALES, ORIGEN, NIVELES_ANCLA]);
  console.log(`   filas insertadas: ${r.rowCount}`);
  chk(r.rowCount === ESPERADO.anclas, 'total insertado', `${r.rowCount} (esperado ${ESPERADO.anclas})`);

  // --- validaciones dentro de la transaccion -----------------------------------------
  sec('4 · VALIDACIONES DENTRO DE LA TRANSACCION');
  const a = await una(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE nivel_mantenimiento='M1')::int AS m1,
    count(*) FILTER (WHERE nivel_mantenimiento='M2')::int AS m2,
    count(*) FILTER (WHERE nivel_mantenimiento='M3')::int AS m3,
    count(*) FILTER (WHERE tipo_equipo='GPS')::int AS gps,
    count(*) FILTER (WHERE tipo_equipo='ADAS')::int AS adas,
    count(*) FILTER (WHERE origen <> $1)::int AS otro_origen,
    count(*) FILTER (WHERE EXTRACT(day FROM quincena_ancla) NOT IN (1,16))::int AS q_mala,
    count(DISTINCT programa_unidad_id)::int AS unidades
    FROM programa_mantenimiento_unidad_anclas`, [ORIGEN]);
  chk(a.total === ESPERADO.anclas, 'anclas totales', `${a.total}`);
  chk(a.m2 === 531 && a.m3 === 531, 'reparto M2 / M3', `M2=${a.m2} M3=${a.m3}`);
  chk(a.m1 === 0, 'sin anclas M1', `${a.m1}`);
  chk(a.gps === 0 && a.adas === 0, 'sin anclas GPS ni ADAS', `GPS=${a.gps} ADAS=${a.adas}`);
  chk(a.otro_origen === 0, `todas con origen ${ORIGEN}`, `${a.otro_origen} con otro origen`);
  chk(a.q_mala === 0, 'toda quincena_ancla en dia 1 o 16', `${a.q_mala}`);
  chk(a.unidades === ESPERADO.unidadesConM1, 'unidades cubiertas', `${a.unidades}`);

  const dup = await una(`SELECT count(*)::int AS n FROM (
    SELECT programa_unidad_id, tipo_equipo, nivel_mantenimiento
    FROM programa_mantenimiento_unidad_anclas GROUP BY 1,2,3 HAVING count(*) > 1) t`);
  chk(dup.n === 0, 'sin duplicados de (unidad, tipo, nivel)', `${dup.n}`);

  // cada ancla debe igualar la ultima_quincena del M1 de su MISMA unidad y familia
  const coincide = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas x
    JOIN programa_mantenimiento_unidad_ciclos c
      ON c.programa_unidad_id = x.programa_unidad_id AND c.tipo_equipo = x.tipo_equipo
     AND c.nivel_mantenimiento = 'M1'
    WHERE x.quincena_ancla <> c.ultima_quincena`);
  chk(coincide.n === 0, 'toda ancla iguala la quincena del M1 de su familia', `${coincide.n} desviaciones`);
  const huerfanas = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas x
    WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidad_ciclos c
      WHERE c.programa_unidad_id = x.programa_unidad_id AND c.tipo_equipo = x.tipo_equipo
        AND c.nivel_mantenimiento = 'M1')`);
  chk(huerfanas.n === 0, 'ninguna ancla sin su M1 de origen', `${huerfanas.n}`);
  const fuera = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas x
    WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u
      WHERE u.id = x.programa_unidad_id AND u.programa_id = x.programa_id)`);
  chk(fuera.n === 0, 'ninguna ancla de unidad fuera del programa', `${fuera.n}`);
  const sinAncla = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidades u
    WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidad_anclas x
      WHERE x.programa_unidad_id = u.id)`);
  chk(sinAncla.n === ESPERADO.unidadesSinM1,
    'las unidades sin M1 siguen SIN ancla', `${sinAncla.n} (no se inventa fecha)`);

  // nada de lo existente se ha tocado
  const intacto = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE updated_at <> created_at) AS ciclos_tocados,
    (SELECT count(*)::int FROM programa_mantenimiento_frecuencias) AS frec,
    (SELECT count(*)::int FROM programa_mantenimiento_unidades) AS uni,
    (SELECT count(*)::int FROM vehiculo_equipos) AS inv,
    (SELECT count(*)::int FROM programacion_mantenimiento) AS prog,
    (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS det`);
  chk(intacto.ciclos === ESPERADO.ciclos, 'ciclos sin tocar', `${intacto.ciclos}`);
  chk(intacto.ciclos_tocados === 0, 'ningun ciclo con updated_at posterior a created_at', `${intacto.ciclos_tocados}`);
  chk(intacto.frec === ESPERADO.frecuencias, 'periodicidades sin tocar', `${intacto.frec}`);
  chk(intacto.uni === ESPERADO.unidades, 'unidades sin tocar', `${intacto.uni}`);
  chk(intacto.inv === 1400, 'inventario sin tocar', `${intacto.inv}`);
  chk(intacto.prog === 0, 'NO se creo ninguna programacion', `${intacto.prog}`);
  chk(intacto.det === 0, 'NO se creo ningun detalle', `${intacto.det}`);

  sec('5 · REGLA DE PRECEDENCIA · CICLO REAL > ANCLA');
  const { rows: fase } = await cliente.query(`SELECT f.tipo_equipo, f.nivel_mantenimiento AS nivel,
      count(*) FILTER (WHERE c.ultima_quincena IS NOT NULL)::int AS desde_ciclo,
      count(*) FILTER (WHERE c.ultima_quincena IS NULL AND x.quincena_ancla IS NOT NULL)::int AS desde_ancla,
      count(*) FILTER (WHERE c.ultima_quincena IS NULL AND x.quincena_ancla IS NULL)::int AS sin_referencia
    FROM programa_mantenimiento_unidades u
    JOIN programa_mantenimiento_frecuencias f ON f.programa_id = u.programa_id
    LEFT JOIN programa_mantenimiento_unidad_ciclos c
      ON c.programa_unidad_id = u.id AND c.tipo_equipo = f.tipo_equipo
     AND c.nivel_mantenimiento = f.nivel_mantenimiento
    LEFT JOIN programa_mantenimiento_unidad_anclas x
      ON x.programa_unidad_id = u.id AND x.tipo_equipo = f.tipo_equipo
     AND x.nivel_mantenimiento = f.nivel_mantenimiento
    GROUP BY 1,2 ORDER BY 1,2`);
  console.log(`   tipo         nivel  desde ciclo  desde ancla  sin referencia`);
  let tc = 0, ta = 0;
  for (const r of fase) {
    tc += r.desde_ciclo; ta += r.desde_ancla;
    console.log(`   ${r.tipo_equipo.padEnd(12)} ${r.nivel}    ${String(r.desde_ciclo).padStart(11)}`
      + `  ${String(r.desde_ancla).padStart(11)}  ${String(r.sin_referencia).padStart(14)}`);
  }
  chk(tc === ESPERADO.ciclos, 'niveles con ejecucion real gobernados por el CICLO', `${tc}`);
  chk(ta === ESPERADO.anclas, 'niveles sin ejecucion gobernados por el ANCLA', `${ta}`);

  sec(`6 · CIERRE · ${aciertos} OK · ${fallos} FALLAS`);
  if (fallos > 0) {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK POR FALLOS. La base queda exactamente como estaba.');
  } else if (modo === 'ENSAYO') {
    await cliente.query('ROLLBACK');
    console.log('   ROLLBACK ejecutado (modo ensayo). Nada se ha guardado.');
    const tras = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas`);
    chk(tras.n === 0, 'tras el ROLLBACK la tabla vuelve a estar vacia', `${tras.n}`);
    console.log('   Para cargar de verdad: repetir con --confirmar');
  } else {
    await cliente.query('COMMIT');
    confirmado = true;
    console.log('   COMMIT ejecutado. Las anclas de cadencia quedan sembradas.');
    const tras = await una(`SELECT count(*)::int AS n FROM programa_mantenimiento_unidad_anclas`);
    console.log(`   estado persistido: ${tras.n} anclas`);
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
console.log(`\nRESULTADO ANCLAS: ${fallos > 0 ? 'NO CARGADAS' : confirmado ? 'CARGADAS (COMMIT)' : 'ensayo correcto, revertido'}`);
process.exit(fallos > 0 ? 2 : 0);
