// =====================================================================================
// TI-PR-01 · GENERADOR DE PROGRAMACION · runner
// =====================================================================================
//   node backend/scripts/ti-pr-01/generar-programacion.mjs --desde 2026-10-01 --hasta 2026-10-31
//        sin bandera de escritura: SOLO LECTURA. Proyecta y reporta, no toca la base.
//   ... --ensayo      materializa dentro de BEGIN ... ROLLBACK y valida. No persiste.
//   ... --confirmar   materializa y hace COMMIT. Requiere autorizacion humana explicita.
//
//   Los dos modos que escriben exigen ademas  --endpoint <sufijo>  (o TI_PR_01_ENDPOINT):
//   el endpoint de Neon al que se pretende escribir, declarado a mano. Si no coincide con
//   current_setting('neon.endpoint_id'), el runner aborta ANTES de escribir.
//
//   CODIGOS DE SALIDA
//     0   corrida completa: todas las visitas seguras, ninguna colision de destino
//     3   visitas seguras materializadas, pero HAY colisiones que requieren atencion
//     2   error tecnico o precondicion incumplida: la operacion hizo rollback
//
// El algoritmo vive en generador-nucleo.mjs, compartido con probar-generador.mjs. Aqui solo
// hay precondiciones, reporte y materializacion.
//
// Crea EXCLUSIVAMENTE programacion_mantenimiento y programacion_mantenimiento_equipos.
// NO crea ordenes_trabajo ni ordenes_trabajo_detalle: programar no es abrir OT.
// NO toca programa_mantenimiento_unidad_ciclos ni ..._anclas: proyectar un horizonte nunca
// mueve una fase. Las fases solo avanzan al CERRAR una OT.
//
// -------------------------------------------------------------------------------------
// CUTOVER · 2026-10-01
// -------------------------------------------------------------------------------------
// Todo termino de la serie anterior a esa quincena es BACKLOG CALCULADO: se cuenta y se
// reporta, pero NO se materializa como programacion, OT, ejecucion, ciclo ni NO_EJECUTADO.
// Ver CUTOVER.md.
//
// -------------------------------------------------------------------------------------
// COLUMNAS VESTIGIALES NOT NULL · REGLA DE COEXISTENCIA, AUDITADA ANTES DE ELEGIR VALOR
// -------------------------------------------------------------------------------------
// La cabecera arrastra dos columnas NOT NULL que el cleanup 20261001_900 elimina y que hay
// que rellenar mientras existan. Ninguna se inventa: las dos se DERIVAN.
//
// 1) fecha_programada date NOT NULL, sin DEFAULT
//    20260918_001 la creo como la unidad de planificacion de entonces -"un unico evento por
//    unidad y fecha", respaldado por uq_programacion_mantenimiento_unidad_fecha-.
//    20260918_002 introdujo las quincenas y dejo escrito que la regla final del negocio es
//    el indice parcial por quincena efectiva, vigente al retirar el UNIQUE legacy.
//    20260925_013 lo retiro. El 900 dice "La quincena sustituye a la fecha suelta como
//    unidad de planificacion" y borra la columna. Nada en backend/src, el frontend,
//    initDb.js ni los loaders la lee; solo la usan dos indices NO unicos de consulta.
//
//        fecha_programada = quincena_programada        (dia 1 o 16 de la quincena)
//
//    Por que ese valor: es exactamente el ancla de la quincena administrativa, asi que no se
//    inventa nada; conserva el sentido original de la columna -la fecha prevista de la
//    visita-; es estable y reproducible, de modo que una segunda pasada calcula el mismo
//    valor y no puede provocar duplicados falsos; y mantiene utiles los dos indices por
//    fecha. NO se usa para la cadencia: la fase es siempre quincena_efectiva.
//
// 2) nivel_mantenimiento varchar NOT NULL, dominio M1/M2/M3
//    El 900 la borra con esta razon literal: "El nivel pasa al detalle por equipo: una
//    visita puede mezclar niveles". La fuente de verdad es, y sera,
//    programacion_mantenimiento_equipos.nivel_mantenimiento, por familia.
//
//        nivel_mantenimiento = nivel_regular      si la visita tiene componente regular
//                            = 'M3'               si la visita es solo anual
//
//    GENERADOR.md PROHIBE el maximo global sobre todos los detalles, porque afirmaria que el
//    mantenimiento REGULAR de la unidad fue M3 cuando en realidad fue M2 y coincidio con el
//    anual del GPS. Por eso va nivel_regular, NO el maximo. En una visita solo anual no hay
//    componente regular y el dominio no admite NULL: se escribe 'M3', el unico nivel
//    realmente presente. Queda anotado en observaciones y NUNCA se usa para propagar ciclos.
//
// -------------------------------------------------------------------------------------
// version_programa_id · REGLA DOCUMENTADA, NO ELEGIDA AQUI
// -------------------------------------------------------------------------------------
// 20260922_003 apartado 6, literal: "la version aplicada es la vigente para la QUINCENA
// EFECTIVA de la programacion, no la vigente el dia en que se creo el registro". Su
// validacion V22.b trata como defecto una visita EJECUTADO/NO_EJECUTADO con la version en
// NULL, porque "pierde para siempre la trazabilidad de con que reglas se calculo".
// Se estampa la vigente PARA CADA QUINCENA, con el intervalo semiabierto documentado. Si una
// quincena no tiene exactamente una version vigente se deja NULL y se reporta: la columna es
// nullable a proposito y el 901 confirma que sigue siendo OPCIONAL.
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CODIGO, CUTOVER, REGULARES, ANUALES, ESTADO_INICIAL,
  idx, cargarInsumos, generar, excepciones, materializar, codigoDeSalida,
} from './generador-nucleo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const DESDE = arg('--desde') || CUTOVER;
const HASTA = arg('--hasta') || '2026-10-31';
// Endpoint de destino, declarado A MANO. Los modos que escriben no arrancan sin el: es la
// evidencia POSITIVA de que quien ejecuta sabe contra que rama de Neon esta escribiendo.
const ENDPOINT_ESPERADO = (arg('--endpoint') || process.env.TI_PR_01_ENDPOINT || '').trim();
const modo = process.argv.includes('--confirmar') ? 'CONFIRMAR'
  : process.argv.includes('--ensayo') ? 'ENSAYO' : 'PROYECCION';

const sec = t => console.log(`\n${'='.repeat(96)}\n${t}\n${'='.repeat(96)}`);
let ok = 0, mal = 0; const fallos = [];
const chk = (b, e, t) => {
  if (b) { ok++; console.log(`   [OK]    ${e.padEnd(58)} ${t}`); }
  else { mal++; fallos.push(e); console.log(`   [FALLA] ${e.padEnd(58)} ${t}`); }
};
const abortar = m => { console.error(`\nABORTADO: ${m}\n`); process.exit(2); };
const secretos = [];
for (const flujo of [process.stdout, process.stderr]) {
  const original = flujo.write.bind(flujo);
  flujo.write = (trozo, cod, cb) => {
    let texto = typeof trozo === 'string' ? trozo : Buffer.from(trozo).toString('utf8');
    for (const s of secretos) if (s) texto = texto.split(s).join('[OCULTO]');
    return typeof cod === 'function' ? original(texto, cod) : original(texto, cod, cb);
  };
}

sec(`TI-PR-01 · GENERADOR DE PROGRAMACION · MODO ${modo}`);
console.log(`   horizonte ${DESDE} .. ${HASTA}   ·   cutover ${CUTOVER}`);
if (idx(DESDE) < idx(CUTOVER)) {
  abortar(`el horizonte empieza en ${DESDE}, antes del cutover ${CUTOVER}. `
    + `Lo anterior al cutover es BACKLOG CALCULADO y no se materializa.`);
}

const { pool } = await import(pathToFileURL(resolve(BACKEND, 'src/config/database.js')).href);
{
  const u = new URL(process.env.DATABASE_URL);
  secretos.push(process.env.DATABASE_URL, u.href, u.host, u.hostname, u.username, u.password);
  secretos.sort((a, b) => (b || '').length - (a || '').length);
}
const cliente = await pool.connect();
const una = async (sql, p) => (await cliente.query(sql, p)).rows[0];
let confirmado = false;
let colisiones = 0;   // colisiones de negocio: exit 3, nunca exit 2
try {
  // en modo proyeccion la propia base rechaza cualquier escritura
  if (modo === 'PROYECCION') await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  sec('1 · PRECONDICIONES');
  // ---------------------------------------------------------------- 1.a IDENTIDAD
  // EVIDENCIA POSITIVA. pg_is_in_recovery() se imprime como dato complementario y NUNCA
  // decide: un primario puede ser perfectamente produccion. Lo que decide es el nombre de
  // la base, el endpoint declarado a mano y la presencia de los objetos de este refactor.
  const id = await una(`SELECT current_database() AS db, current_schema() AS esq,
    current_setting('neon.endpoint_id', true) AS endpoint,
    pg_is_in_recovery() AS replica, (now() AT TIME ZONE 'America/Lima')::date::text AS hoy`);
  const suf = e => e ? `...${String(e).slice(-4)}` : '(no expuesto)';
  console.log(`   ${id.db}/${id.esq} · endpoint ${suf(id.endpoint)}`
    + ` · fecha de negocio ${id.hoy}`);
  console.log(`   pg_is_in_recovery=${id.replica}  (dato complementario, NO es prueba)`);
  chk(id.db === 'neondb', 'current_database() = neondb', id.db);
  chk(id.esq === 'public', 'current_schema() = public', id.esq);
  if (modo !== 'PROYECCION') {
    if (!ENDPOINT_ESPERADO) abortar(
      `para escribir hay que declarar el endpoint de destino:  --endpoint <sufijo>\n`
      + `           (o la variable de entorno TI_PR_01_ENDPOINT). Sin declararlo no se `
      + `puede demostrar\n           que esta es la rama de pruebas, y no se escribe nada. `
      + `El endpoint actual acaba en ${suf(id.endpoint)}.`);
    if (!id.endpoint) abortar(
      `neon.endpoint_id no esta expuesto en esta conexion: no hay evidencia POSITIVA de que `
      + `sea la rama de pruebas. No se escribe nada.`);
    if (!String(id.endpoint).endsWith(ENDPOINT_ESPERADO)) abortar(
      `el endpoint conectado acaba en ${suf(id.endpoint)} y se declaro `
      + `...${ENDPOINT_ESPERADO}. No coinciden: no se escribe nada.`);
    chk(true, 'neon.endpoint_id coincide con el endpoint declarado', suf(id.endpoint));
  }
  const prog = await una(`SELECT id FROM programas_mantenimiento WHERE codigo=$1`, [CODIGO]);
  if (!prog) abortar(`el programa ${CODIGO} no existe.`);

  // ------------------------------------------------- 1.b ESTRUCTURA 009/012/013 y dominio
  const est = await una(`SELECT
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_frecuencia_anual_solo_m3') AS m009,
    to_regclass('public.programa_mantenimiento_unidad_anclas') IS NOT NULL AS anclas,
    to_regclass('public.ordenes_trabajo') IS NOT NULL AS ot,
    to_regclass('public.ordenes_trabajo_detalle') IS NOT NULL AS otd,
    (SELECT count(*)::int FROM pg_indexes
      WHERE indexname='uq_programacion_unidad_quincena_efectiva') AS uq,
    (SELECT count(*)::int FROM pg_indexes WHERE indexname='uq_programacion_equipo') AS uqe,
    (SELECT count(*)::int FROM pg_indexes WHERE indexname='uq_ot_programacion_activa') AS uqot,
    (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_programacion_mantenimiento_estado'
      AND pg_get_constraintdef(oid) LIKE '%' || $1 || '%') AS estado_valido,
    (SELECT count(*)::int FROM pg_constraint
      WHERE conname='uq_programacion_mantenimiento_unidad_fecha') AS legacy,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='programacion_mantenimiento' AND column_name='quincena_programada') AS qprog,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='programacion_mantenimiento' AND column_name='quincena_reprogramada') AS qrep`,
    [ESTADO_INICIAL]);
  chk(est.m009, '009 aplicada: chk_frecuencia_anual_solo_m3', 'si');
  chk(est.anclas, '012 aplicada: tabla de anclas presente', 'si');
  chk(est.ot && est.otd, '013 aplicada: tablas de OT presentes', 'si');
  chk(est.uq === 1, 'una visita por unidad y quincena: indice parcial', 'presente');
  chk(est.uqe === 1, 'una fila por tipo_equipo en cada visita', 'uq_programacion_equipo');
  chk(est.uqot === 1, 'una OT activa por programacion', 'uq_ot_programacion_activa');
  chk(est.estado_valido === 1, `el dominio de estado admite ${ESTADO_INICIAL}`, 'si');
  chk(est.legacy === 0, 'el unique legacy por fecha esta retirado', 'lo retiro la 013');
  chk(est.qprog && est.qrep, 'quincena_programada y quincena_reprogramada presentes',
    'identidad + reprogramacion');

  // ------------------------------------------------- 1.c REGLAS VIVAS DE 014, 015 y 016
  // Se leen del catalogo, del cuerpo desplegado de cada funcion. El generador escribe
  // programaciones: si alguna de estas reglas no esta, el modelo no es el que se valido.
  const f = await una(`SELECT
    (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='validar_apertura_ot') AS apertura,
    (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='cerrar_orden_trabajo') AS cierre,
    (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='congelar_visita_con_ot') AS visita,
    (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='congelar_alcance_programado') AS alcance,
    (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='impedir_modificar_ot_cerrada') AS impedir,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='validar_coherencia_ciclo_ot') AS ciclo_ot,
    EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='chk_programacion_fecha_ejecucion_resultado' AND convalidated) AS chk_fecha,
    (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
      WHERE t.tgname='trg_congelar_visita_con_ot' AND NOT t.tgisinternal) AS trg_visita,
    (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
      WHERE t.tgname='trg_impedir_modificar_ot_cerrada' AND NOT t.tgisinternal) AS trg_ot,
    (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
      WHERE t.tgname='trg_congelar_alcance_programado' AND NOT t.tgisinternal) AS trg_alcance`);
  const R = (t, re) => typeof t === 'string' && re.test(t);
  // 014
  chk(R(f.apertura, /NOT IN \('PROGRAMADO', 'REPROGRAMADO'\)/),
    '014 · abrir OT solo sobre PROGRAMADO o REPROGRAMADO', 'restringida');
  chk(R(f.cierre, /GET DIAGNOSTICS v_escritas = ROW_COUNT/)
    && R(f.cierre, /v_ciclos := v_ciclos \+ v_escritas/),
    '014 · cerrar_orden_trabajo cuenta escrituras reales', 'ROW_COUNT');
  // 015
  chk(R(f.trg_visita, /BEFORE INSERT OR UPDATE/),
    '015 · trg_congelar_visita_con_ot = BEFORE INSERT OR UPDATE', 'los dos eventos');
  chk(R(f.visita, /NEW\.estado NOT IN \('PROYECTADO', 'PROGRAMADO'\)/),
    '015 · I · una visita solo nace PROYECTADO o PROGRAMADO', `este runner escribe ${ESTADO_INICIAL}`);
  chk(R(f.visita, /no puede nacer con fecha_ejecucion/),
    '015 · J · una visita nace con fecha_ejecucion NULL', 'si');
  chk(R(f.visita, /GET DIAGNOSTICS v_ctx = PG_CONTEXT/)
    && R(f.visita, /cerrar_orden_trabajo\(integer,integer,date,integer,text\)/),
    '015 · C · los resultados solo se escriben desde el cierre real', 'PG_CONTEXT');
  chk(R(f.visita, /es historica y no admite pasar a/), '015 · F · fecha post-cierre historica', 'si');
  chk(R(f.visita, /v_hoy := \(now\(\) AT TIME ZONE 'America\/Lima'\)::date/),
    '015 · G · fecha futura bloqueada con America/Lima', 'si');
  chk(R(f.visita, /es historica y no vuelve a un/), '015 · B · CANCELADO terminal', 'si');
  chk(R(f.visita, /v_cerradas > 0/), '015 · A · con OT CERRADA el resultado queda congelado', 'si');
  chk(R(f.impedir, /no tiene resultado/), '015 · D · una OT no cierra sin resultado', 'si');
  chk(f.ciclo_ot, '015 · H · validar_coherencia_ciclo_ot presente', 'si');
  chk(f.chk_fecha, '015 · E · chk_programacion_fecha_ejecucion_resultado validado', 'convalidated');
  // 016
  chk(R(f.impedir, /IF TG_OP = 'DELETE' THEN/) && R(f.impedir, /no puede borrarse \(esta %\)/),
    '016 · R1 · ninguna OT se borra fisicamente', 'prohibido');
  chk(R(f.trg_ot, /BEFORE/) && R(f.trg_ot, /DELETE/),
    '016 · R1 · el trigger cubre el DELETE', 'BEFORE DELETE');
  chk(R(f.alcance, /v_prog_old/) && R(f.alcance, /v_prog_new/)
    && R(f.alcance, /v_ots_old > 0 OR v_ots_new > 0/),
    '016 · R2 · alcance historico desde cualquier OT, los dos extremos', 'sin COALESCE');
  chk(R(f.trg_alcance, /INSERT/) && R(f.trg_alcance, /UPDATE/) && R(f.trg_alcance, /DELETE/),
    '016 · R2 · el trigger del alcance cubre los tres eventos', 'si');
  chk(R(f.visita, /no admite cambiar su identidad original/)
    && R(f.visita, /NEW\.programa_unidad_id  IS DISTINCT FROM OLD\.programa_unidad_id/)
    && R(f.visita, /NEW\.quincena_programada IS DISTINCT FROM OLD\.quincena_programada/),
    '016 · R3 · identidad original inmutable', 'unidad, programa, quincena programada');
  // R3 no debe congelar la reprogramacion: el bloque de R3 es el IF que precede a SU RAISE,
  // y ahi quincena_reprogramada NO puede aparecer. Mas abajo vive la regla de 013, que si la
  // nombra para congelarla cuando hay una OT no anulada; son reglas distintas.
  const iR3 = typeof f.visita === 'string'
    ? f.visita.indexOf('no admite cambiar su identidad original') : -1;
  const bloqueR3 = iR3 > 0 ? f.visita.slice(f.visita.lastIndexOf('IF NEW.', iR3), iR3) : '';
  chk(iR3 > 0 && !/quincena_reprogramada/.test(bloqueR3),
    '016 · R3 · quincena_reprogramada sigue siendo modificable', 'fuera de R3');
  if (mal > 0) abortar(`${mal} precondicion(es) no se cumplen: ${fallos.join(' | ')}.`
    + ` El modelo no es el que se valido. No se escribe nada.`);

  // --------------------------------------------------------------- 2 · INSUMOS
  sec('2 · INSUMOS · referencia de fase, precedencia ciclo > ancla');
  const ins = await cargarInsumos(cliente, prog.id);
  const deCiclo = ins.refs.filter(r => r.fase === 'CICLO_REAL').length;
  console.log(`   referencias de fase: ${ins.refs.length}`
    + `  (ciclo real ${deCiclo} · ancla ${ins.refs.length - deCiclo})`);
  const solapadas = await una(`SELECT count(*)::int AS n
    FROM programa_mantenimiento_unidad_ciclos c
    JOIN programa_mantenimiento_unidad_anclas x ON x.programa_unidad_id=c.programa_unidad_id
     AND x.tipo_equipo=c.tipo_equipo AND x.nivel_mantenimiento=c.nivel_mantenimiento`);
  console.log(`   combinaciones con ciclo Y ancla a la vez: ${solapadas.n}  (gana el ciclo)`);
  const cuenta = (f, v) => [...ins.APLICA].filter(([k, x]) => k.endsWith('|' + f) && x === v).length;
  console.log(`\n   familia      APLICA  NO_APLICA  PENDIENTE  OTRO_PROV  SIN_FILA`);
  for (const f of [...REGULARES, ...ANUALES])
    console.log(`   ${f.padEnd(12)} ${String(cuenta(f, 'APLICA')).padStart(6)}`
      + ` ${String(cuenta(f, 'NO_APLICA')).padStart(10)}`
      + ` ${String(cuenta(f, 'PENDIENTE')).padStart(10)}`
      + ` ${String(cuenta(f, 'OTRO_PROVEEDOR')).padStart(10)}`
      + ` ${String(cuenta(f, 'SIN_FILA')).padStart(9)}`);
  console.log(`   PENDIENTE = hay POR_VALIDAR y ningun INSTALADO. Nunca se lee como "si".`);
  console.log(`   OTRO_PROV = ADAS INSTALADO de un proveedor fuera del alcance del programa.`);

  // --------------------------------------------------------------- 3 · PROYECCION
  const g = generar(ins, DESDE, HASTA);
  colisiones = g.colisiones.length;
  const sinRef = excepciones(ins);
  const conVisita = new Set(g.visitas.map(v => v.unidad));
  const regSinFaseParticipan = g.detalles.filter(d => d.sin_fase_previa);
  const regSinFaseSinVisita = sinRef.filter(r => r.motivo === 'SIN_REFERENCIA_REGULAR'
    && !conVisita.has(r.unidad));

  sec(`3 · PROYECCION · ${DESDE} .. ${HASTA}`);
  const L = (t, v) => console.log(`   ${t.padEnd(52, '.')} ${String(v).padStart(6)}`);
  L('obligaciones brutas dentro del horizonte', g.bruto.length);
  L('BACKLOG CALCULADO anterior al cutover', g.backlog.length);
  console.log(`        no se materializa: ni programacion, ni OT, ni ciclo, ni NO_EJECUTADO`);
  console.log(`   paso 1-bis · grano (unidad, familia, nivel, QUINCENA_PROGRAMADA)`);
  L('   OBLIGACION_YA_MATERIALIZADA', g.yaMaterializado.length);
  L('   pendientes, que siguen a los pasos 2-6', g.pendiente.length);
  L('      de familias regulares', g.regBruto.length);
  L('      de familias anuales', g.anuBruto.length);
  L('visitas formadas con lo pendiente', g.visitas.length);
  L('   materializables, slot libre', g.seguras.length);
  L('   COLISION_DE_DESTINO, no se escriben', g.colisiones.length);
  L('detalles de las visitas formadas', g.detalles.length);
  if (ins.sinQuincenaProgramada.length)
    console.log(`   OJO · ${ins.sinQuincenaProgramada.length} detalle(s) de programaciones`
      + ` SIN quincena_programada: no pueden decir donde nacio su obligacion y quedan`
      + ` fuera de materializadas. Revisar a mano.`);
  const porNivel = { M1: 0, M2: 0, M3: 0 };
  for (const v of g.visitas) if (v.nivel_regular) porNivel[v.nivel_regular]++;
  L('visitas con nivel_regular M1', porNivel.M1);
  L('visitas con nivel_regular M2', porNivel.M2);
  L('visitas con nivel_regular M3', porNivel.M3);
  L('visitas solo anuales, sin componente regular', g.visitas.filter(v => v.solo_anual).length);
  L('detalles GPS M3', g.detalles.filter(d => d.familia === 'GPS').length);
  L('detalles ADAS M3', g.detalles.filter(d => d.familia === 'ADAS').length);
  L('regulares APLICA sin fase que PARTICIPAN', regSinFaseParticipan.length);
  L('regulares sin fase y sin visita generadora', regSinFaseSinVisita.length);
  L('SIN_REFERENCIA_REGULAR', sinRef.filter(r => r.motivo === 'SIN_REFERENCIA_REGULAR').length);
  L('SIN_REFERENCIA_M3', sinRef.filter(r => r.motivo === 'SIN_REFERENCIA_M3').length);
  L('combinaciones NO_APLICA excluidas', [...ins.APLICA].filter(([, v]) => v === 'NO_APLICA').length);
  L('combinaciones POR_VALIDAR excluidas', [...ins.APLICA].filter(([, v]) => v === 'PENDIENTE').length);
  L('anuales de OTRO PROVEEDOR excluidas', [...ins.APLICA].filter(([, v]) => v === 'OTRO_PROVEEDOR').length);
  L('combinaciones SIN_FILA de inventario', [...ins.APLICA].filter(([, v]) => v === 'SIN_FILA').length);
  L('duplicados de visita evitados por consolidacion', g.detalles.length - g.visitas.length);
  console.log(`        ${g.detalles.length} detalles colapsan en ${g.visitas.length} visitas`
    + ` y por tanto en ${g.visitas.length} futuras OT, no ${g.detalles.length}`);

  sec('4 · REPARTO POR QUINCENA');
  const porQ = {};
  for (const v of g.visitas) {
    const x = porQ[v.quincena] = porQ[v.quincena]
      || { visitas: 0, det: 0, M1: 0, M2: 0, M3: 0, anual: 0, soloAnual: 0, ver: v.version_etiqueta };
    x.visitas++; x.det += v.detalles.length;
    if (v.nivel_regular) x[v.nivel_regular]++; else x.soloAnual++;
    x.anual += v.detalles.filter(d => d.origen === 'ANUAL_PROPIA').length;
  }
  console.log(`   quincena     version  visitas  detalles    M1    M2    M3  solo-anual  det.anuales`);
  for (const q of Object.keys(porQ).sort()) {
    const x = porQ[q];
    console.log(`   ${q}  ${String(x.ver ?? '(ninguna)').padStart(7)}  ${String(x.visitas).padStart(7)}`
      + `  ${String(x.det).padStart(8)}  ${String(x.M1).padStart(4)}  ${String(x.M2).padStart(4)}`
      + `  ${String(x.M3).padStart(4)}  ${String(x.soloAnual).padStart(10)}  ${String(x.anual).padStart(11)}`);
  }
  const porFam = {};
  for (const d of g.detalles) {
    porFam[d.familia] = porFam[d.familia] || {};
    porFam[d.familia][d.nivel] = (porFam[d.familia][d.nivel] || 0) + 1;
  }
  console.log(`\n   familia      detalles por nivel`);
  for (const f of [...REGULARES, ...ANUALES]) if (porFam[f])
    console.log(`   ${f.padEnd(12)} ${Object.keys(porFam[f]).sort().map(k => `${k}=${porFam[f][k]}`).join('  ')}`);

  sec('5 · INVARIANTES DE LA REGLA CONGELADA');
  const claves = g.visitas.map(v => `${v.unidad}|${v.i}`);
  chk(new Set(claves).size === claves.length, 'paso 6 · una visita por (unidad, quincena)',
    `${claves.length} claves distintas`);
  chk(g.visitas.every(v => new Set(v.detalles.map(d => d.familia)).size === v.detalles.length),
    'paso 6 · ninguna visita repite familia', 'una fila por tipo_equipo');
  chk(g.visitas.every(v => v.detalles.filter(d => d.origen === 'REGULAR_ELEVADA')
    .every(d => d.nivel === v.nivel_regular)),
    'paso 4 · todo detalle regular lleva nivel_regular', 'M2/M3 general por unidad');
  chk(g.detalles.filter(d => ANUALES.includes(d.familia) && d.origen !== 'ANUAL_PROPIA').length === 0,
    'paso 5 · ningun GPS/ADAS entra por elevacion', '0');
  chk(g.detalles.filter(d => ANUALES.includes(d.familia) && d.nivel !== 'M3').length === 0,
    'paso 5 · todo detalle anual es M3', '0');
  chk(g.detalles.every(d => ins.APLICA.get(`${d.unidad}|${d.familia}`) === 'APLICA'),
    'paso 4 · ningun detalle sobre familia que no APLICA', 'POR_VALIDAR y NO_APLICA fuera');
  const soloReg = new Map();
  for (const o of g.regBruto) {
    const k = `${o.unidad}|${o.i}`, p = soloReg.get(k);
    if (!p || ({ M1: 1, M2: 2, M3: 3 })[o.nivel] > ({ M1: 1, M2: 2, M3: 3 })[p]) soloReg.set(k, o.nivel);
  }
  chk(g.visitas.every(v => v.nivel_regular === (soloReg.get(`${v.unidad}|${v.i}`) ?? null)),
    'paso 3 · nivel_regular no depende de GPS/ADAS', 'independencia comprobada');
  const mienten = g.visitas.filter(v => v.resumen_ui_maximo !== v.nivel_cabecera);
  chk(g.visitas.every(v => v.nivel_cabecera === (v.nivel_regular ?? 'M3')),
    'cabecera = nivel_regular, nunca el maximo global',
    `${mienten.length} visitas donde el maximo global habria mentido`);
  chk(g.visitas.every(v => idx(v.quincena) >= idx(CUTOVER)),
    'cutover · ninguna visita anterior al cutover', CUTOVER);
  const refMap = new Map(ins.refs.map(r => [`${r.unidad}|${r.familia}|${r.nivel}`, r]));
  const fuera = g.bruto.filter(o => {
    const r = refMap.get(`${o.unidad}|${o.familia}|${o.nivel}`);
    const d = o.i - idx(typeof r.q_ref === 'string' ? r.q_ref.slice(0, 10) : r.q_ref.toISOString().slice(0, 10));
    return d <= 0 || d % r.frec !== 0;
  });
  chk(fuera.length === 0, 'paso 1 · toda obligacion es referencia + k x frecuencia, k>=1',
    `${g.bruto.length} verificadas`);
  const m2Ancla = ins.refs.filter(r => r.nivel === 'M2' && REGULARES.includes(r.familia)
    && r.fase === 'ANCLA').length;
  chk(m2Ancla > 0, 'paso 1 · M2/M3 regulares se rigen por su ancla, no por el ultimo M1',
    `${m2Ancla} referencias M2 gobernadas por ancla`);
  chk(g.detalles.every(d => ins.frecOk.has(`${d.familia}|${d.nivel}`)),
    'fk_programacion_equipo_frecuencia · toda (familia,nivel) declarada',
    `${ins.frecOk.size} frecuencias`);
  chk(g.visitas.every(v => v.version_id !== null),
    'version vigente resuelta para cada quincena del horizonte',
    [...new Set(g.visitas.map(v => v.version_etiqueta))].join(', ') || 'ninguna');

  sec('6 · MUESTRA DE VISITAS, TAL COMO SE ESCRIBIRIAN');
  const muestra = [
    ['regular pura M1', g.visitas.find(v => v.nivel_regular === 'M1'
      && v.detalles.every(d => d.origen === 'REGULAR_ELEVADA'))],
    ['elevacion a M2', g.visitas.find(v => v.nivel_regular === 'M2')],
    ['elevacion a M3', g.visitas.find(v => v.nivel_regular === 'M3')],
    ['regular + anual propia', g.visitas.find(v => v.detalles.some(d => d.origen === 'ANUAL_PROPIA')
      && v.nivel_regular)],
    ['solo anual', g.visitas.find(v => v.solo_anual)],
    ['con familia sin fase previa', g.visitas.find(v => v.detalles.some(d => d.sin_fase_previa))],
  ].filter(([, v]) => v);
  for (const [etq, v] of muestra) {
    console.log(`\n   ${etq.toUpperCase()} · ${v.placa} · quincena ${v.quincena}`);
    console.log(`      cabecera: estado=${ESTADO_INICIAL} quincena_programada=${v.quincena}`
      + ` version_programa_id=${v.version_id}`);
    console.log(`                resumen de nivel=${v.nivel_cabecera}`
      + ` (= nivel_regular${v.solo_anual ? ', visita solo anual' : ''};`
      + ` NO se persiste: el nivel va por equipo)`);
    if (v.resumen_ui_maximo !== v.nivel_cabecera)
      console.log(`      OJO · el maximo global seria ${v.resumen_ui_maximo} y MENTIRIA:`
        + ` el regular fue ${v.nivel_regular}`);
    for (const d of [...v.detalles].sort((a, b) => a.familia.localeCompare(b.familia)))
      console.log(`      detalle  ${d.familia.padEnd(11)} ${d.nivel}`
        + `  ${d.origen === 'ANUAL_PROPIA' ? 'obligacion anual propia' : 'nivel de la visita'}`
        + (d.sin_fase_previa ? '  · APLICA SIN FASE PREVIA, sin ciclo hasta el cierre' : ''));
  }

  if (sinRef.length) {
    sec('7 · EXCEPCIONES OPERATIVAS · INSTALADO SIN REFERENCIA DE FASE');
    console.log(`   unidad     familia  estado_inventario  motivo                  participa por otra familia`);
    for (const r of sinRef)
      console.log(`   ${r.placa.padEnd(10)} ${r.familia.padEnd(8)} ${r.estado_inventario.padEnd(18)} `
        + `${r.motivo.padEnd(23)} ${conVisita.has(r.unidad) ? 'si' : 'no'}`);
    console.log(`\n   No generan obligacion y NO se les inventa fecha ni ancla. Quedan en el reporte`);
    console.log(`   para que TI ingrese una referencia real cuando exista evidencia valida.`);
  }

  if (g.yaMaterializado.length) {
    sec('7.bis · OBLIGACIONES QUE YA TIENEN UNA FILA QUE LAS REPRESENTA');
    console.log(`   No vuelven a proyectarse. La identidad es quincena_programada: una`);
    console.log(`   reprogramacion mueve la visita, no la obligacion.`);
    const porMot = {};
    for (const o of g.yaMaterializado) {
      const k = `${o.familia}/${o.nivel}`;
      porMot[k] = (porMot[k] || 0) + 1;
    }
    console.log(`\n   familia/nivel      obligaciones ya representadas`);
    for (const k of Object.keys(porMot).sort())
      console.log(`   ${k.padEnd(18)} ${String(porMot[k]).padStart(6)}`);
    const movidas = g.yaMaterializado.filter(o => o.q_efectiva_actual !== o.quincena);
    if (movidas.length) {
      console.log(`\n   de ellas, ${movidas.length} estan REPROGRAMADAS: su obligacion nacio en`);
      console.log(`   una quincena y su visita esta hoy en otra. Muestra:`);
      for (const o of movidas.slice(0, 10))
        console.log(`      ${String(ins.uni.get(o.unidad)?.placa ?? o.unidad).padEnd(10)}`
          + ` ${o.familia}/${o.nivel}  nacio ${o.quincena}  ->  esta en ${o.q_efectiva_actual}`
          + `  (programacion ${o.programacion_id}, ${o.estado_programacion})`);
    }
  }

  if (g.colisiones.length) {
    sec('7.ter · COLISIONES DE DESTINO · SE REPORTAN Y NO SE ESCRIBEN');
    console.log(`   Una obligacion pendiente legitima formo una visita cuyo slot`);
    console.log(`   (unidad, quincena_efectiva) ya lo ocupa otra programacion activa.`);
    console.log(`   NO se fusiona, NO se le cuelgan detalles, NO se crea una segunda`);
    console.log(`   programacion y NO se eleva su nivel. Requiere decision humana.\n`);
    for (const c of g.colisiones) {
      console.log(`   ${c.placa} · unidad ${c.programa_unidad_id} · ${c.motivo}`);
      console.log(`      obligacion nueva nacida en ...... ${c.quincena_obligacion}`);
      console.log(`      quincena efectiva de destino .... ${c.quincena_efectiva_destino}`);
      console.log(`      la ocupa la programacion ........ ${c.programacion_id_ocupa}`
        + ` (${c.estado_programacion_ocupa})`);
      console.log(`      su quincena programada .......... ${c.q_programada_ocupa}`
        + `  reprogramada ${c.q_reprogramada_ocupa ?? '(ninguna)'}`);
      console.log(`      sus ordenes de trabajo .......... ${c.ot_resumen}`
        + (c.ot_estados.length ? ` [${c.ot_estados.join(', ')}]` : ''));
      console.log(`      la obligacion nueva intenta ..... ${c.pendiente_intenta.join(' ')}`);
      console.log(`      la existente ya contiene ........ ${c.existente_contiene.join(' ') || '(sin detalles)'}`);
      console.log(`      no representado ................. ${c.no_representado.join(' ') || '(nada)'}`);
      if (c.motivos.length > 1) console.log(`      motivos concurrentes ............ ${c.motivos.join(', ')}`);
      if (c.motivo === 'OTRO') console.log(`      OTRO: el caso no encaja en ninguna`
        + ` clasificacion acordada. La evidencia cruda esta arriba.`);
    }
  }

  // ------------------------------------------------- 8 · MATERIALIZACION
  if (modo === 'PROYECCION') {
    sec('8 · MODO PROYECCION · NADA SE HA ESCRITO');
    const ro = await una(`SELECT current_setting('transaction_read_only') AS ro`);
    console.log(`   transaction_read_only = ${ro.ro}: la base rechazaria cualquier escritura.`);
    const t = await una(`SELECT (SELECT count(*)::int FROM programacion_mantenimiento) AS p,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS d,
      (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS c,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS a`);
    console.log(`   programacion=${t.p} equipos=${t.d} ordenes_trabajo=${t.ot}`
      + ` ciclos=${t.c} anclas=${t.a}  (sin cambios)`);
    console.log(`\n   para probar la materializacion sin persistir:  --ensayo   (BEGIN ... ROLLBACK)`);
    console.log(`   para persistirla de verdad:                    --confirmar`);
    await cliente.query('ROLLBACK');
  } else {
    sec(`8 · MATERIALIZACION · ${modo}`);
    await cliente.query('BEGIN');
    const antes = await una(`SELECT
      (SELECT count(*)::int FROM programacion_mantenimiento) AS p,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS d,
      (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM ordenes_trabajo_detalle) AS otd,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS anclas`);
    console.log(`   antes: programacion=${antes.p} equipos=${antes.d} ot=${antes.ot}`
      + ` ciclos=${antes.ciclos} anclas=${antes.anclas}`);
    // SOLO las seguras. Las colisiones ya se reportaron y no se escriben: una colision de
    // negocio no es un error tecnico y no aborta la corrida.
    const detSeguras = g.seguras.reduce((a, v) => a + v.detalles.length, 0);
    const r1 = await materializar(cliente, g.seguras);
    console.log(`   visitas seguras a escribir ........... ${g.seguras.length}`);
    console.log(`   programaciones insertadas ............ ${r1.programaciones}`);
    console.log(`   detalles insertados .................. ${r1.detalles}`);
    console.log(`   colisiones reportadas, no escritas ... ${g.colisiones.length}`);
    console.log(`   red de seguridad (UNIQUE) disparo .... ${r1.red_de_seguridad.length}`);
    for (const x of r1.red_de_seguridad)
      console.log(`      ${x.placa} ${x.quincena}: ${x.motivo} · intentaba`
        + ` ${x.pendiente_intenta.join(' ')}`);
    chk(r1.programaciones + r1.red_de_seguridad.length === g.seguras.length,
      'toda visita segura se inserto o la paro la red de seguridad',
      `${r1.programaciones} + ${r1.red_de_seguridad.length} = ${g.seguras.length}`);
    chk(r1.red_de_seguridad.length === 0,
      'la idempotencia la resolvio el algoritmo, no el UNIQUE',
      `${r1.red_de_seguridad.length} disparos de la red`);
    if (r1.red_de_seguridad.length === 0) chk(r1.detalles === detSeguras,
      'un detalle insertado por cada detalle de las visitas seguras',
      `${r1.detalles} de ${detSeguras}`);
    const ajenas = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
      WHERE id <> ALL($1::int[]) AND updated_at <> created_at`,
      [r1.escritas.map(x => x.programacion_id)]);
    chk(ajenas.n === 0, 'ninguna programacion ajena a esta corrida fue modificada',
      `${ajenas.n} tocadas`);

    sec('9 · VALIDACIONES SOBRE LO MATERIALIZADO');
    const v1 = await una(`SELECT count(*)::int AS n FROM (
      SELECT programa_unidad_id, quincena_efectiva FROM programacion_mantenimiento
      WHERE estado <> 'CANCELADO' GROUP BY 1,2 HAVING count(*)>1) t`);
    chk(v1.n === 0, 'una sola visita activa por unidad y quincena', `${v1.n} duplicados`);
    const v2 = await una(`SELECT count(*)::int AS n FROM (
      SELECT programacion_id, tipo_equipo FROM programacion_mantenimiento_equipos
      GROUP BY 1,2 HAVING count(*)>1) t`);
    chk(v2.n === 0, 'una fila por tipo_equipo en cada visita', `${v2.n} duplicados`);
    const v3 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento_equipos
      WHERE tipo_equipo = ANY($1) AND nivel_mantenimiento <> 'M3'`, [ANUALES]);
    chk(v3.n === 0, 'ningun GPS/ADAS programado fuera de M3', `${v3.n}`);
    const v4 = await una(`SELECT count(*)::int AS n FROM (
      SELECT p.id FROM programacion_mantenimiento p
      JOIN programacion_mantenimiento_equipos e ON e.programacion_id=p.id
      WHERE e.tipo_equipo = ANY($1) GROUP BY p.id
      HAVING count(DISTINCT e.nivel_mantenimiento) > 1) t`, [REGULARES]);
    chk(v4.n === 0, 'ninguna visita mezcla niveles entre familias regulares', `${v4.n}`);
    const v5 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
      WHERE quincena_programada < $1::date`, [CUTOVER]);
    chk(v5.n === 0, 'ninguna programacion anterior al cutover', `${v5.n}`);
    // La mitad que comparaba fecha_programada con quincena_programada cae con el 900: esa
    // columna ya no existe y no hay nada con lo que contrastar. Sobrevive la parte que
    // sigue siendo exigible; no se sustituye por una comprobacion inventada.
    const v6 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
      WHERE quincena_programada IS NULL`);
    chk(v6.n === 0, 'quincena_programada nunca NULL', `${v6.n} nulas`);
    const v7 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
      WHERE estado <> $1`, [ESTADO_INICIAL]);
    chk(v7.n === 0, `todas nacen en estado ${ESTADO_INICIAL}`, `${v7.n} con otro estado`);
    const v8 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento p
      JOIN programas_mantenimiento_versiones v ON v.id=p.version_programa_id
      WHERE NOT (v.vigencia_desde <= p.quincena_efectiva
        AND (v.vigencia_hasta IS NULL OR v.vigencia_hasta > p.quincena_efectiva))`);
    chk(v8.n === 0, 'la version estampada es la vigente para la quincena efectiva',
      `${v8.n} fuera de vigencia`);
    const v9 = await una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
      WHERE EXTRACT(day FROM quincena_programada) NOT IN (1,16)`);
    chk(v9.n === 0, 'toda quincena cae en dia 1 o 16', `${v9.n}`);
    const v10 = await una(`SELECT
      (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM ordenes_trabajo_detalle) AS otd,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
        WHERE updated_at<>created_at) AS toc,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS anclas,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas
        WHERE updated_at<>created_at) AS toc_a`);
    chk(v10.ot === antes.ot && v10.otd === antes.otd,
      'NINGUNA OT creada por el generador', `ot=${v10.ot} detalle=${v10.otd}`);
    chk(v10.ciclos === antes.ciclos && v10.toc === 0,
      'los ciclos intactos: ni uno creado ni uno movido', `${v10.ciclos}, ${v10.toc} tocados`);
    chk(v10.anclas === antes.anclas && v10.toc_a === 0,
      'las anclas intactas', `${v10.anclas}, ${v10.toc_a} tocadas`);

    sec('10 · IDEMPOTENCIA · SEGUNDA CORRIDA COMPLETA EN EL MISMO HORIZONTE');
    // La prueba de verdad no es volver a llamar a materializar con las mismas visitas: es
    // volver a LEER los insumos y volver a GENERAR. Si el paso 1-bis funciona, las
    // obligaciones que se acaban de materializar ya no son pendientes y no se forma ni una
    // visita. Asi la idempotencia la sostiene el algoritmo, no el indice unico.
    const ins2 = await cargarInsumos(cliente, prog.id);
    const g2 = generar(ins2, DESDE, HASTA);
    console.log(`   segunda corrida: ${g2.bruto.length} brutas · `
      + `${g2.yaMaterializado.length} ya materializadas · ${g2.pendiente.length} pendientes`);
    console.log(`                    ${g2.visitas.length} visitas formadas · `
      + `${g2.seguras.length} seguras · ${g2.colisiones.length} colisiones`);
    chk(g2.bruto.length === g.bruto.length,
      'la cadencia no cambio: mismas obligaciones brutas', `${g2.bruto.length}`);
    chk(g2.seguras.length === 0, 'la segunda corrida no forma ninguna visita nueva segura',
      `${g2.seguras.length}`);
    const r2 = await materializar(cliente, g2.seguras);
    const tras = await una(`SELECT
      (SELECT count(*)::int FROM programacion_mantenimiento) AS p,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS d`);
    chk(r2.programaciones === 0, 'la segunda pasada no inserta ninguna programacion',
      `${r2.programaciones}`);
    chk(r2.detalles === 0, 'la segunda pasada no inserta ningun detalle', `${r2.detalles}`);
    chk(tras.p === antes.p + r1.programaciones, 'el total de programaciones no cambio', `${tras.p}`);
    chk(tras.d === antes.d + r1.detalles, 'el total de detalles no cambio', `${tras.d}`);

    sec(`11 · CIERRE · ${ok} OK · ${mal} FALLAS`);
    if (mal > 0) {
      await cliente.query('ROLLBACK');
      console.log('   ROLLBACK POR FALLOS. La base queda exactamente como estaba.');
    } else if (modo === 'ENSAYO') {
      await cliente.query('ROLLBACK');
      console.log('   ROLLBACK ejecutado (modo ensayo). Nada se ha guardado.');
      const t = await una(`SELECT (SELECT count(*)::int FROM programacion_mantenimiento) AS p,
        (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS d`);
      chk(t.p === antes.p && t.d === antes.d, 'tras el ROLLBACK todo vuelve a su sitio',
        `${t.p} programaciones, ${t.d} detalles`);
    } else {
      await cliente.query('COMMIT');
      confirmado = true;
      console.log('   COMMIT ejecutado. La programacion queda materializada.');
    }
  }
} catch (e) {
  // ERROR TECNICO. Una colision de negocio NUNCA llega aqui: se reporta y se sigue.
  mal++;
  console.error(`\n   *** EXCEPCION TECNICA *** ${e.code || ''} ${e.message}`);
  if (e.visita) console.error(`   al escribir la visita: ${e.visita.placa}`
    + ` unidad ${e.visita.unidad} quincena ${e.visita.quincena}`);
  if (e.detail) console.error(`   detalle: ${e.detail}`);
  if (e.constraint) console.error(`   constraint: ${e.constraint}`);
  if (e.where) console.error(`   where: ${e.where}`);
  try { await cliente.query('ROLLBACK'); console.error('   ROLLBACK ejecutado.'); } catch { }
} finally { cliente.release(); await pool.end(); }
sec(`${ok} OK · ${mal} FALLAS${fallos.length ? '\nfallos: ' + fallos.join(' | ') : ''}`);
const salida = codigoDeSalida({ fallas: mal, colisiones });
console.log(`RESULTADO: ${mal > 0 ? 'ERROR TECNICO, revertido' : confirmado ? 'MATERIALIZADA (COMMIT)'
  : modo === 'ENSAYO' ? 'ensayo correcto, revertido' : 'proyeccion, sin escribir nada'}`);
if (colisiones && !mal) console.log(`ATENCION REQUERIDA: ${colisiones} colision(es) de destino`
  + ` no se materializaron. Estan en el apartado 7.ter y necesitan decision humana.`);
console.log(`CODIGO DE SALIDA: ${salida}`
  + `   (0 = completa · 3 = seguras materializadas con colisiones pendientes · 2 = error tecnico)`);
process.exit(salida);
