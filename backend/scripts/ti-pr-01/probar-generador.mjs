// =====================================================================================
// TI-PR-01 · BANCO DE CASOS DEL GENERADOR · A .. O
// =====================================================================================
//   node backend/scripts/ti-pr-01/probar-generador.mjs
//
// TODO ocurre dentro de una sola BEGIN ... ROLLBACK. No persiste nada, jamas. El ROLLBACK
// es incondicional: esta en el finally, asi que tambien se ejecuta si un caso lanza.
//
// Importa generador-nucleo.mjs, el MISMO codigo que usa generar-programacion.mjs. No
// reimplementa la regla: si la reimplementara, estas pruebas podrian pasar mientras el
// generador real divergiera.
//
// Octubre 2026 no contiene todos los escenarios -no hay ningun M3 regular, ninguna familia
// instalada sin fase, ningun GPS que deje de vencer-, asi que cada caso construye sus
// propias unidades sinteticas: placas reservadas en exclusiva, inventario explicito y las
// referencias de fase justas para que la obligacion caiga en la quincena buscada.
//
// Las unidades reales del programa siguen en los insumos, porque cargarInsumos lee el
// programa completo. Cada asercion filtra por el id de SU unidad, y al final se comprueba
// que las 174 reales y sus 543 ciclos / 772 anclas no se han movido.
// (688 y 1062 hasta la migracion 017, que retiro los 145 ciclos y 290 anclas de DVR.)
// =====================================================================================

import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CODIGO, REGULARES, ANUALES, ESTADO_INICIAL, FISICOS,
  idx, quin, cargarInsumos, generar, excepciones, materializar, codigoDeSalida,
} from './generador-nucleo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(AQUI, '..', '..');
const dotenv = (await import('dotenv')).default;
dotenv.config({ path: resolve(BACKEND, '.env') });

const sec = t => console.log(`\n${'='.repeat(96)}\n${t}\n${'='.repeat(96)}`);
let ok = 0, mal = 0; const fallos = [];
// Foto de partida izada al ambito del modulo: el bloque `finally` que verifica el
// ROLLBACK es hermano del `try` y no alcanza a `base`. Antes comparaba contra 688/1062
// cableados, que incluian los ciclos y anclas de DVR; la 017 los retiro.
let partida = null;
const chk = (b, e, t) => {
  if (b) { ok++; console.log(`   [OK]    ${e.padEnd(62)} ${t}`); }
  else { mal++; fallos.push(e); console.log(`   [FALLA] ${e.padEnd(62)} ${t}`); }
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

// --- la quincena objetivo de casi todos los casos ----------------------------------------
const Q = '2027-01-01';
const iQ = idx(Q);
const atras = n => quin(iQ - n);          // la quincena n posiciones antes de Q
const DESDE = Q, HASTA = '2027-01-31';    // el horizonte cubre 2027-01-01 y 2027-01-16

const { pool } = await import(pathToFileURL(resolve(BACKEND, 'src/config/database.js')).href);
{
  const u = new URL(process.env.DATABASE_URL);
  secretos.push(process.env.DATABASE_URL, u.href, u.host, u.hostname, u.username, u.password);
  secretos.sort((a, b) => (b || '').length - (a || '').length);
}
const cliente = await pool.connect();
const una = async (sql, p) => (await cliente.query(sql, p)).rows[0];
let programaId = null;
const PLACAS = new Set();
let contador = 0;

// --- fixtures ---------------------------------------------------------------------------
// inventario: un estado por FAMILIA; se expande a los tipos fisicos reales del inventario.
// Lo que no se nombra queda NO_APLICA, nunca POR_VALIDAR por descuido.
async function nuevaUnidad(inventario, marcaAdas = null) {
  const placa = `ZZ${String(++contador).padStart(4, '0')}`;   // reservada en exclusiva
  if (PLACAS.has(placa)) throw new Error(`colision de placa de prueba ${placa}`);
  PLACAS.add(placa);
  const choque = await una(`SELECT count(*)::int AS n FROM vehiculos WHERE placa=$1`, [placa]);
  if (choque.n !== 0) throw new Error(`la placa de prueba ${placa} ya existe en vehiculos`);
  await cliente.query(`INSERT INTO vehiculos (placa) VALUES ($1)`, [placa]);
  const fisicos = [];
  for (const fam of REGULARES)
    for (const f of FISICOS[fam]) fisicos.push([f, inventario[fam] || 'NO_APLICA']);
  for (const fam of ANUALES) fisicos.push([fam, inventario[fam] || 'NO_APLICA']);
  for (const [tipo, estado] of fisicos) {
    // chk_vehiculo_equipo_datos_solo_instalado: marca solo si INSTALADO
    const marca = estado === 'INSTALADO' && tipo === 'ADAS' ? marcaAdas : null;
    await cliente.query(`INSERT INTO vehiculo_equipos (placa, tipo_equipo, estado_inventario,
      marca, fuente) VALUES ($1,$2,$3,$4,'MANUAL')`, [placa, tipo, estado, marca]);
  }
  const { rows: [u] } = await cliente.query(`INSERT INTO programa_mantenimiento_unidades
    (programa_id, placa, observaciones) VALUES ($1,$2,$3) RETURNING id, placa`,
    [programaId, placa, 'FIXTURE de probar-generador.mjs · se revierte con el ROLLBACK']);
  return u;
}
const ciclo = (u, familia, nivel, q) => cliente.query(
  `INSERT INTO programa_mantenimiento_unidad_ciclos (programa_unidad_id, programa_id,
     tipo_equipo, nivel_mantenimiento, ultima_quincena, fuente)
   VALUES ($1,$2,$3,$4,$5::date,'MANUAL')`, [u.id, programaId, familia, nivel, q]);
const ancla = (u, familia, nivel, q) => cliente.query(
  `INSERT INTO programa_mantenimiento_unidad_anclas (programa_unidad_id, programa_id,
     tipo_equipo, nivel_mantenimiento, quincena_ancla, origen)
   VALUES ($1,$2,$3,$4,$5::date,'MANUAL')`, [u.id, programaId, familia, nivel, q]);

// las tres regulares con M1 vigente y M2/M3 deliberadamente DESFASADOS, para que en Q
// solo venza M1: diferencia 1 no es multiplo de 6 ni de 12.
async function regularesM1(u, familias = REGULARES) {
  for (const f of familias) {
    await ciclo(u, f, 'M1', atras(1));
    await ancla(u, f, 'M2', atras(1));
    await ancla(u, f, 'M3', atras(1));
  }
}
// vista de UNA unidad dentro de la proyeccion completa
const deUnidad = (g, u) => g.visitas.filter(v => v.unidad === u.id);
const enQ = (g, u, q = Q) => deUnidad(g, u).find(v => v.quincena === q) || null;
const fams = v => v ? [...v.detalles].map(d => `${d.familia}/${d.nivel}`).sort().join(' ') : '(sin visita)';

try {
  sec('TI-PR-01 · BANCO DE CASOS A..O · TODO DENTRO DE BEGIN ... ROLLBACK');
  const idb = await una(`SELECT current_database() AS db, current_schema() AS esq,
    pg_is_in_recovery() AS replica`);
  console.log(`   ${idb.db}/${idb.esq} · replica=${idb.replica}`);
  const p = await una(`SELECT id FROM programas_mantenimiento WHERE codigo=$1`, [CODIGO]);
  if (!p) throw new Error(`el programa ${CODIGO} no existe.`);
  programaId = p.id;

  await cliente.query('BEGIN');
  const txid = (await una(`SELECT txid_current()::text AS t`)).t;
  console.log(`   transaccion ${txid} abierta · quincena objetivo ${Q} · horizonte ${DESDE}..${HASTA}`);
  const base = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_unidades WHERE programa_id=$1) AS unidades,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS ciclos,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS anclas,
    (SELECT count(*)::int FROM programacion_mantenimiento) AS prog,
    (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS det,
    (SELECT count(*)::int FROM ordenes_trabajo) AS ot`, [programaId]);
  console.log(`   estado de partida: unidades=${base.unidades} ciclos=${base.ciclos}`
    + ` anclas=${base.anclas} programacion=${base.prog} detalles=${base.det} ot=${base.ot}`);
  partida = base;

  // ---------------------------------------------------------------- fixtures de cada caso
  // 017 · DVR ya no es familia programable: las regulares son tres.
  const TODO = { CAMARAS: 'INSTALADO', COPILOTO: 'INSTALADO', RADIO_BASE: 'INSTALADO' };

  const uA = await nuevaUnidad({ ...TODO });
  await regularesM1(uA);

  const uB = await nuevaUnidad({ ...TODO });
  await regularesM1(uB);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M2'`,
    [uB.id, atras(6)]);

  const uC = await nuevaUnidad({ ...TODO });
  await regularesM1(uC);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
    [uC.id, atras(12)]);

  const uD = await nuevaUnidad({ ...TODO, GPS: 'INSTALADO' });
  await regularesM1(uD);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M2'`,
    [uD.id, atras(6)]);
  await ciclo(uD, 'GPS', 'M3', atras(24));

  const uE = await nuevaUnidad({ ...TODO, ADAS: 'INSTALADO' }, 'EVO TRACKLOG');
  await regularesM1(uE);
  await ciclo(uE, 'ADAS', 'M3', atras(24));

  const uF = await nuevaUnidad({ GPS: 'INSTALADO' });            // las 3 regulares NO_APLICA
  await ciclo(uF, 'GPS', 'M3', atras(24));

  // G · RADIO_BASE instalado y APLICA, pero SIN ciclo y SIN ancla. CAMARAS origina M3.
  const uG = await nuevaUnidad({ ...TODO });
  await regularesM1(uG, ['CAMARAS', 'COPILOTO']);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
    [uG.id, atras(12)]);

  // H · una regular instalada y APLICA sin fase; nada mas aplica, asi que NADA origina
  // visita. Antes de 017 el fixture usaba DVR; ahora RADIO_BASE cumple esa condicion.
  const uH = await nuevaUnidad({ RADIO_BASE: 'INSTALADO' });

  // I · GPS instalado sin M3 conocido; ninguna regular aplica
  const uI = await nuevaUnidad({ GPS: 'INSTALADO' });

  // J · COPILOTO NO_APLICA sin fase; las otras dos con M1
  const uJ = await nuevaUnidad({ CAMARAS: 'INSTALADO', RADIO_BASE: 'INSTALADO',
    COPILOTO: 'NO_APLICA' });
  await regularesM1(uJ, ['CAMARAS', 'RADIO_BASE']);

  // K · RADIO_BASE POR_VALIDAR sin fase; las otras dos con M1
  const uK = await nuevaUnidad({ CAMARAS: 'INSTALADO', COPILOTO: 'INSTALADO',
    RADIO_BASE: 'POR_VALIDAR' });
  await regularesM1(uK, ['CAMARAS', 'COPILOTO']);

  // M · dos niveles regulares distintos en la MISMA quincena: CAMARAS M2 y las otras M1
  const uM = await nuevaUnidad({ ...TODO });
  await regularesM1(uM);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M2'`,
    [uM.id, atras(6)]);

  // N · M3 regular y un GPS que NO vence en Q: 23 no es multiplo de 24
  const uN = await nuevaUnidad({ ...TODO, GPS: 'INSTALADO' });
  await regularesM1(uN);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
    [uN.id, atras(12)]);
  await ciclo(uN, 'GPS', 'M3', atras(23));

  // O · M1 se repite cada quincena; el M2 tiene su propia ancla y no debe moverse
  const uO = await nuevaUnidad({ ...TODO });
  await regularesM1(uO);
  await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
    WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M2'`,
    [uO.id, atras(6)]);

  // ---------------------------------------------------------------- una sola proyeccion
  const ins = await cargarInsumos(cliente, programaId);
  const g = generar(ins, DESDE, HASTA);
  const exc = excepciones(ins);
  console.log(`\n   proyeccion de ${DESDE}..${HASTA}: ${g.visitas.length} visitas`
    + ` · ${g.detalles.length} detalles  (incluye las unidades reales del programa)`);

  // ============================================================== A
  sec('A · TRES REGULARES M1  ->  1 programacion, 3 detalles M1');
  {
    const v = enQ(g, uA);
    console.log(`   ${uA.placa} ${Q}: ${fams(v)}`);
    chk(deUnidad(g, uA).filter(x => x.quincena === Q).length === 1, 'A · una sola programacion en Q', '1');
    chk(v && v.detalles.length === 3, 'A · tres detalles', `${v?.detalles.length}`);
    chk(v && v.detalles.every(d => d.nivel === 'M1'), 'A · todos M1', 'M1');
    chk(v && v.nivel_regular === 'M1', 'A · nivel_regular = M1', `${v?.nivel_regular}`);
    chk(v && fams(v) === 'CAMARAS/M1 COPILOTO/M1 RADIO_BASE/M1',
      'A · las tres familias regulares', fams(v));
  }

  // ============================================================== B
  sec('B · UNA REGULAR ORIGINA M2  ->  todas las regulares APLICA en M2');
  {
    const v = enQ(g, uB);
    console.log(`   ${uB.placa} ${Q}: ${fams(v)}   (solo CAMARAS vencia M2)`);
    const brutas = g.regBruto.filter(o => o.unidad === uB.id && o.i === iQ)
      .map(o => `${o.familia}/${o.nivel}`).sort();
    console.log(`   obligaciones brutas en Q: ${brutas.join(' ')}`);
    chk(brutas.filter(x => x.endsWith('/M2')).length === 1, 'B · solo una obligacion M2 bruta',
      brutas.filter(x => x.endsWith('/M2')).join(' '));
    chk(v && v.nivel_regular === 'M2', 'B · nivel_regular = M2', `${v?.nivel_regular}`);
    chk(v && v.detalles.length === 3 && v.detalles.every(d => d.nivel === 'M2'),
      'B · las tres regulares elevadas a M2', fams(v));
    chk(deUnidad(g, uB).filter(x => x.quincena === Q).length === 1, 'B · una sola programacion', '1');
  }

  // ============================================================== C
  sec('C · UNA REGULAR ORIGINA M3  ->  todas las regulares APLICA en M3');
  {
    const v = enQ(g, uC);
    console.log(`   ${uC.placa} ${Q}: ${fams(v)}   (solo CAMARAS vencia M3)`);
    chk(v && v.nivel_regular === 'M3', 'C · nivel_regular = M3', `${v?.nivel_regular}`);
    chk(v && v.detalles.length === 3 && v.detalles.every(d => d.nivel === 'M3'),
      'C · las tres regulares elevadas a M3', fams(v));
    chk(v && v.nivel_cabecera === 'M3', 'C · cabecera M3', `${v?.nivel_cabecera}`);
  }

  // ============================================================== D
  sec('D · M2 REGULAR + GPS M3 EN LA MISMA QUINCENA  ->  1 programacion, niveles distintos');
  {
    const v = enQ(g, uD);
    console.log(`   ${uD.placa} ${Q}: ${fams(v)}`);
    chk(deUnidad(g, uD).filter(x => x.quincena === Q).length === 1, 'D · una sola programacion', '1');
    chk(v && v.nivel_regular === 'M2', 'D · nivel_regular = M2', `${v?.nivel_regular}`);
    chk(v && v.detalles.filter(d => REGULARES.includes(d.familia)).every(d => d.nivel === 'M2'),
      'D · las regulares en M2', 'M2');
    chk(v && v.detalles.some(d => d.familia === 'GPS' && d.nivel === 'M3'), 'D · GPS en M3', 'GPS/M3');
    chk(v && v.resumen_ui_maximo === 'M3' && v.nivel_cabecera === 'M2',
      'D · el maximo global seria M3 y la cabecera NO lo usa',
      `maximo=${v?.resumen_ui_maximo} cabecera=${v?.nivel_cabecera}`);
  }

  // ============================================================== E
  sec('E · M1 REGULAR + ADAS M3  ->  las regulares NO se elevan a M3');
  {
    const v = enQ(g, uE);
    console.log(`   ${uE.placa} ${Q}: ${fams(v)}`);
    chk(v && v.nivel_regular === 'M1', 'E · nivel_regular = M1', `${v?.nivel_regular}`);
    chk(v && v.detalles.filter(d => REGULARES.includes(d.familia)).every(d => d.nivel === 'M1'),
      'E · las tres regulares siguen en M1, NO elevadas', 'M1');
    chk(v && v.detalles.some(d => d.familia === 'ADAS' && d.nivel === 'M3'), 'E · ADAS en M3', 'ADAS/M3');
    chk(v && v.detalles.length === 4, 'E · tres regulares + ADAS', `${v?.detalles.length}`);
  }

  // ============================================================== F
  sec('F · SOLO GPS M3  ->  1 programacion con un unico detalle');
  {
    const v = enQ(g, uF);
    console.log(`   ${uF.placa} ${Q}: ${fams(v)}`);
    chk(deUnidad(g, uF).filter(x => x.quincena === Q).length === 1, 'F · una sola programacion', '1');
    chk(v && v.detalles.length === 1 && v.detalles[0].familia === 'GPS'
      && v.detalles[0].nivel === 'M3', 'F · un unico detalle GPS/M3', fams(v));
    chk(v && v.nivel_regular === null && v.solo_anual === true,
      'F · sin componente regular', `nivel_regular=${v?.nivel_regular}`);
    chk(v && v.nivel_cabecera === 'M3',
      'F · cabecera M3, unico nivel presente, dominio sin NULL', `${v?.nivel_cabecera}`);
  }

  // ============================================================== G
  sec('G · REGULAR APLICA SIN FASE + VISITA REGULAR YA EXISTENTE  ->  entra al nivel de la visita');
  {
    const v = enQ(g, uG);
    console.log(`   ${uG.placa} ${Q}: ${fams(v)}`);
    const rb = v?.detalles.find(d => d.familia === 'RADIO_BASE');
    chk(ins.APLICA.get(`${uG.id}|RADIO_BASE`) === 'APLICA', 'G · RADIO_BASE APLICA', 'INSTALADO');
    chk(!ins.conFase.has(`${uG.id}|RADIO_BASE`), 'G · RADIO_BASE no tiene ciclo ni ancla', 'sin fase');
    chk(g.bruto.filter(o => o.unidad === uG.id && o.familia === 'RADIO_BASE').length === 0,
      'G · RADIO_BASE no ORIGINA ninguna obligacion bruta', '0');
    chk(!!rb && rb.nivel === 'M3', 'G · RADIO_BASE PARTICIPA con el nivel_regular M3', `${rb?.nivel}`);
    chk(!!rb && rb.sin_fase_previa === true, 'G · queda marcado como sin fase previa', 'si');
    chk(v && v.detalles.length === 3, 'G · la visita lleva las tres regulares', `${v?.detalles.length}`);
  }

  // ============================================================== H
  sec('H · REGULAR APLICA SIN FASE Y NADA MAS ORIGINA VISITA  ->  no se inventa programacion');
  {
    const vs = deUnidad(g, uH);
    console.log(`   ${uH.placa}: ${vs.length} visitas en todo el horizonte`);
    chk(vs.length === 0, 'H · ninguna programacion creada', `${vs.length}`);
    chk(g.detalles.filter(d => d.unidad === uH.id).length === 0, 'H · ningun detalle', '0');
    chk(g.bruto.filter(o => o.unidad === uH.id).length === 0, 'H · ninguna obligacion bruta', '0');
    const e = exc.filter(x => x.unidad === uH.id);
    chk(e.length === 1 && e[0].familia === 'RADIO_BASE' && e[0].motivo === 'SIN_REFERENCIA_REGULAR',
      'H · reportado como SIN_REFERENCIA_REGULAR', e.map(x => `${x.familia}/${x.motivo}`).join(' '));
  }

  // ============================================================== I
  sec('I · GPS INSTALADO SIN M3 CONOCIDO  ->  sin programacion, reportado');
  {
    const vs = deUnidad(g, uI);
    chk(vs.length === 0, 'I · ninguna programacion creada', `${vs.length}`);
    chk(g.detalles.filter(d => d.unidad === uI.id && d.familia === 'GPS').length === 0,
      'I · ningun detalle GPS', '0');
    const e = exc.filter(x => x.unidad === uI.id && x.familia === 'GPS');
    chk(e.length === 1 && e[0].motivo === 'SIN_REFERENCIA_M3',
      'I · reportado como SIN_REFERENCIA_M3', e[0]?.motivo || '(nada)');
    chk(e.length === 1 && e[0].estado_inventario === 'INSTALADO',
      'I · el reporte conserva el estado de inventario', 'INSTALADO');
  }

  // ============================================================== J
  sec('J · FAMILIA NO_APLICA  ->  no aparece como detalle');
  {
    const v = enQ(g, uJ);
    console.log(`   ${uJ.placa} ${Q}: ${fams(v)}`);
    chk(ins.APLICA.get(`${uJ.id}|COPILOTO`) === 'NO_APLICA', 'J · COPILOTO es NO_APLICA', 'NO_APLICA');
    chk(v && !v.detalles.some(d => d.familia === 'COPILOTO'), 'J · COPILOTO no es detalle', 'ausente');
    chk(v && v.detalles.length === 2, 'J · solo las dos que aplican', `${v?.detalles.length}`);
    chk(exc.filter(x => x.unidad === uJ.id).length === 0,
      'J · NO_APLICA no es incumplimiento, no se reporta', '0 excepciones');
  }

  // ============================================================== K
  sec('K · POR_VALIDAR  ->  no aparece como detalle, nunca se lee como "si"');
  {
    const v = enQ(g, uK);
    console.log(`   ${uK.placa} ${Q}: ${fams(v)}`);
    chk(ins.APLICA.get(`${uK.id}|RADIO_BASE`) === 'PENDIENTE',
      'K · RADIO_BASE queda PENDIENTE', ins.APLICA.get(`${uK.id}|RADIO_BASE`));
    chk(v && !v.detalles.some(d => d.familia === 'RADIO_BASE'),
      'K · RADIO_BASE no es detalle', 'ausente');
    chk(v && v.detalles.length === 2, 'K · solo las dos INSTALADO', `${v?.detalles.length}`);
    chk(exc.filter(x => x.unidad === uK.id).length === 0,
      'K · POR_VALIDAR no se reporta como sin referencia', '0 excepciones');
  }

  // ============================================================== M
  sec('M · DOS NIVELES REGULARES DISTINTOS EN LA MISMA QUINCENA  ->  gana el maximo, uniforme');
  {
    const v = enQ(g, uM);
    const brutas = g.regBruto.filter(o => o.unidad === uM.id && o.i === iQ)
      .map(o => `${o.familia}/${o.nivel}`).sort();
    console.log(`   ${uM.placa} ${Q}`);
    console.log(`      brutas:     ${brutas.join(' ')}`);
    console.log(`      programado: ${fams(v)}`);
    chk(brutas.some(x => x.endsWith('/M1')) && brutas.some(x => x.endsWith('/M2')),
      'M · conviven obligaciones M1 y M2 en la misma quincena', brutas.length + ' brutas');
    chk(v && v.nivel_regular === 'M2', 'M · se materializa el nivel regular maximo', `${v?.nivel_regular}`);
    chk(v && new Set(v.detalles.map(d => d.nivel)).size === 1,
      'M · todas las regulares APLICA quedan uniformes', [...new Set(v.detalles.map(d => d.nivel))].join(','));
    chk(deUnidad(g, uM).filter(x => x.quincena === Q).length === 1,
      'M · una sola programacion, no una por nivel', '1');
  }

  // ============================================================== N
  sec('N · M3 REGULAR + GPS QUE NO VENCE  ->  el GPS no aparece');
  {
    const v = enQ(g, uN);
    console.log(`   ${uN.placa} ${Q}: ${fams(v)}   (su GPS vence 24 quincenas tras ${atras(23)})`);
    chk(v && v.nivel_regular === 'M3', 'N · nivel_regular = M3', `${v?.nivel_regular}`);
    chk(v && !v.detalles.some(d => d.familia === 'GPS'), 'N · GPS ausente de la visita M3', 'ausente');
    chk(g.anuBruto.filter(o => o.unidad === uN.id && o.i === iQ).length === 0,
      'N · el GPS no tiene obligacion bruta en Q', '0');
    chk(ins.APLICA.get(`${uN.id}|GPS`) === 'APLICA',
      'N · y no es porque no aplique: el GPS SI aplica', 'APLICA');
  }

  // ============================================================== O
  sec('O · M1 REPETIDOS ANTES DE M2  ->  el M2 conserva su fecha, no deriva del M1');
  {
    const refM1 = ins.refs.find(r => r.unidad === uO.id && r.familia === 'CAMARAS' && r.nivel === 'M1');
    const refM2 = ins.refs.find(r => r.unidad === uO.id && r.familia === 'CAMARAS' && r.nivel === 'M2');
    const iso = v => typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
    // horizonte ancho para ver la serie entera, no solo Q
    const ancho = generar(ins, Q, '2027-04-30');
    const m1 = ancho.regBruto.filter(o => o.unidad === uO.id && o.familia === 'CAMARAS' && o.nivel === 'M1')
      .map(o => quin(o.i));
    const m2 = ancho.regBruto.filter(o => o.unidad === uO.id && o.familia === 'CAMARAS' && o.nivel === 'M2')
      .map(o => quin(o.i));
    console.log(`   referencia M1 = ${iso(refM1.q_ref)} (${refM1.fase})`
      + ` · referencia M2 = ${iso(refM2.q_ref)} (${refM2.fase})`);
    console.log(`   serie M1 en 2027-01..04: ${m1.join(' ')}`);
    console.log(`   serie M2 en 2027-01..04: ${m2.join(' ')}`);
    // ASERCION CORREGIDA. El horizonte 2027-01..04 cubre 8 quincenas, asi que con frecuencia
    // 6 y ancla en atras(6) el M2 vence DOS veces: atras(6)+6 = Q y atras(6)+12 = Q+6. La
    // version anterior exigia un unico termino y era FALSA; el nucleo estaba bien y no se ha
    // tocado para que pase. Lo que hay que demostrar no es cuantos terminos hay, sino que
    // TODOS derivan del ancla del propio M2 por su propia frecuencia, y que el primero es Q.
    const esperadoM2 = [];
    for (let k = 1; idx(atras(6)) + 6 * k <= idx('2027-04-30'); k++)
      esperadoM2.push(quin(idx(atras(6)) + 6 * k));
    chk(m1.length === 8, 'O · el M1 se repite cada quincena', `${m1.length} terminos`);
    chk(m2.length === esperadoM2.length && m2.every((q, i) => q === esperadoM2[i]),
      'O · la serie M2 completa = su ancla + k x 6', `${m2.join(' ')} (esperado ${esperadoM2.join(' ')})`);
    chk(m2[0] === Q, 'O · y su primer termino cae en Q, no donde caeria el M1', m2[0]);
    chk(iso(refM2.q_ref) === atras(6), 'O · la referencia de M2 es su ancla, no el ultimo M1',
      `${iso(refM2.q_ref)} = ${atras(6)}`);
    chk(iso(refM2.q_ref) !== iso(refM1.q_ref),
      'O · M2 y M1 tienen referencias independientes', `M2 ${iso(refM2.q_ref)} vs M1 ${iso(refM1.q_ref)}`);
    // la prueba fuerte: mover el M1 no mueve el M2
    await cliente.query(`UPDATE programa_mantenimiento_unidad_ciclos SET ultima_quincena=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M1'`,
      [uO.id, atras(3)]);
    const ins2 = await cargarInsumos(cliente, programaId);
    const g2 = generar(ins2, Q, '2027-04-30');
    const m2b = g2.regBruto.filter(o => o.unidad === uO.id && o.familia === 'CAMARAS' && o.nivel === 'M2')
      .map(o => quin(o.i));
    chk(m2b.length === m2.length && m2b.every((q, i) => q === m2[i]),
      'O · tras mover el M1, la serie M2 no se mueve ni un termino',
      `${m2b.join(' ')} (antes ${m2.join(' ')})`);
    await cliente.query(`UPDATE programa_mantenimiento_unidad_ciclos SET ultima_quincena=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M1'`,
      [uO.id, atras(1)]);
  }

  // ============================================================== L
  sec('L · EJECUTAR EL GENERADOR DOS VECES EN EL MISMO HORIZONTE  ->  la segunda no duplica');
  {
    const ins3 = await cargarInsumos(cliente, programaId);
    const g3 = generar(ins3, DESDE, HASTA);
    chk(g3.colisiones.length === 0, 'L · con la base sin programacion no hay ninguna colision',
      `${g3.colisiones.length}`);
    chk(g3.seguras.length === g3.visitas.length, 'L · todas las visitas tienen su slot libre',
      `${g3.seguras.length} de ${g3.visitas.length}`);
    const r1 = await materializar(cliente, g3.seguras);
    console.log(`   primera corrida: ${r1.programaciones} programaciones · ${r1.detalles} detalles`
      + ` · ${r1.red_de_seguridad.length} paradas por el UNIQUE`);
    chk(r1.programaciones === g3.seguras.length, 'L · la primera corrida materializa todo',
      `${r1.programaciones} de ${g3.seguras.length}`);
    chk(r1.detalles === g3.detalles.length, 'L · y todos los detalles',
      `${r1.detalles} de ${g3.detalles.length}`);
    chk(r1.red_de_seguridad.length === 0, 'L · el UNIQUE no tuvo que intervenir', '0');
    // La segunda corrida se vuelve a LEER y a GENERAR: si el paso 1-bis funciona, no queda
    // ni una obligacion pendiente y no se forma ni una visita. La idempotencia es del
    // algoritmo; el indice unico solo es la red.
    const ins4 = await cargarInsumos(cliente, programaId);
    const g4 = generar(ins4, DESDE, HASTA);
    console.log(`   segunda corrida: ${g4.bruto.length} brutas · ${g4.yaMaterializado.length}`
      + ` ya materializadas · ${g4.pendiente.length} pendientes · ${g4.visitas.length} visitas`);
    chk(g4.bruto.length === g3.bruto.length, 'L · la cadencia no cambio', `${g4.bruto.length}`);
    chk(g4.pendiente.length === 0, 'L · no queda ninguna obligacion pendiente', `${g4.pendiente.length}`);
    chk(g4.visitas.length === 0, 'L · la segunda corrida no forma ninguna visita', `${g4.visitas.length}`);
    const r2 = await materializar(cliente, g4.seguras);
    chk(r2.programaciones === 0, 'L · la segunda no inserta ninguna programacion', `${r2.programaciones}`);
    chk(r2.detalles === 0, 'L · la segunda no inserta ningun detalle', `${r2.detalles}`);
    const dup = await una(`SELECT count(*)::int AS n FROM (
      SELECT programa_unidad_id, quincena_efectiva FROM programacion_mantenimiento
      WHERE estado <> 'CANCELADO' GROUP BY 1,2 HAVING count(*)>1) t`);
    chk(dup.n === 0, 'L · cero duplicados en la base', `${dup.n}`);
    const dupd = await una(`SELECT count(*)::int AS n FROM (
      SELECT programacion_id, tipo_equipo FROM programacion_mantenimiento_equipos
      GROUP BY 1,2 HAVING count(*)>1) t`);
    chk(dupd.n === 0, 'L · cero detalles duplicados', `${dupd.n}`);

    // lo materializado cumple las reglas tambien en la base, no solo en memoria
    sec('L.bis · LO MATERIALIZADO, VERIFICADO EN LA BASE');
    const w = await una(`SELECT
      (SELECT count(*)::int FROM programacion_mantenimiento WHERE estado<>$1) AS otro_estado,
      (SELECT count(*)::int FROM programacion_mantenimiento
        WHERE quincena_programada IS NULL) AS fecha,
      (SELECT count(*)::int FROM programacion_mantenimiento
        WHERE EXTRACT(day FROM quincena_programada) NOT IN (1,16)) AS dia,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos
        WHERE tipo_equipo = ANY($2) AND nivel_mantenimiento<>'M3') AS anual_no_m3,
      (SELECT count(*)::int FROM (SELECT p.id FROM programacion_mantenimiento p
        JOIN programacion_mantenimiento_equipos e ON e.programacion_id=p.id
        WHERE e.tipo_equipo = ANY($3) GROUP BY p.id
        HAVING count(DISTINCT e.nivel_mantenimiento)>1) t) AS mezcla,
      (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM ordenes_trabajo_detalle) AS otd`,
      [ESTADO_INICIAL, ANUALES, REGULARES]);
    chk(w.otro_estado === 0, `L.bis · todas en ${ESTADO_INICIAL}`, `${w.otro_estado}`);
    // fecha_programada ya no existe tras el 900: queda lo exigible de esta comprobacion.
    chk(w.fecha === 0, 'L.bis · quincena_programada nunca NULL', `${w.fecha}`);
    chk(w.dia === 0, 'L.bis · toda quincena en dia 1 o 16', `${w.dia}`);
    chk(w.anual_no_m3 === 0, 'L.bis · ningun GPS/ADAS fuera de M3', `${w.anual_no_m3}`);
    chk(w.mezcla === 0, 'L.bis · ninguna visita mezcla niveles regulares', `${w.mezcla}`);
    chk(w.ot === base.ot && w.otd === 0, 'L.bis · NINGUNA OT creada', `ot=${w.ot} detalle=${w.otd}`);
  }

  // =====================================================================================
  // P · MATERIALIZADAS, SLOTS, COLISIONES Y CODIGOS DE SALIDA
  // =====================================================================================
  // Cada caso vive en su propio SAVEPOINT: crea sus unidades, materializa SOLO lo suyo,
  // vuelve a leer los insumos y comprueba. Al revertir, ningun caso contamina al siguiente.
  const USUARIO = 1, TECNICO = 1;
  const HOY = (await una(`SELECT ((now() AT TIME ZONE 'America/Lima')::date)::text AS d`)).d;
  const FIS = (await una(`SELECT ($1::date - 5)::text AS d`, [HOY])).d;
  const QS = quin(iQ + 1), Q2 = quin(iQ + 2);
  const OCT = '2026-10-01', NOV = '2026-11-01';
  // Horizonte de UNA sola quincena: el de los casos A..O cubre Q y Q+1, y con M1 de
  // frecuencia 1 eso son dos obligaciones por familia. Estos casos necesitan aislar Q.
  const H1 = '2027-01-15';

  const proj = async (desde = Q, hasta = H1) => {
    const i = await cargarInsumos(cliente, programaId);
    return { ins: i, g: generar(i, desde, hasta) };
  };
  const soloDe = (g, u) => g.seguras.filter(v => v.unidad === u.id);
  const visitasDe = (g, u) => g.visitas.filter(v => v.unidad === u.id);
  const pendDe = (g, u) => g.pendiente.filter(o => o.unidad === u.id)
    .map(o => `${o.familia}/${o.nivel}@${quin(o.i)}`).sort();
  const yaMatDe = (g, u) => g.yaMaterializado.filter(o => o.unidad === u.id)
    .map(o => `${o.familia}/${o.nivel}@${o.quincena}`).sort();
  const cubreDe = (ins, u) => [...ins.materializadas.keys()]
    .filter(k => k.startsWith(`${u.id}|`)).map(k => k.split('|').slice(1).join('/')).sort();
  const colDe = (g, u) => g.colisiones.filter(c => c.programa_unidad_id === u.id);
  const filasDe = u => una(`SELECT count(*)::int AS n FROM programacion_mantenimiento
    WHERE programa_unidad_id=$1`, [u.id]);
  const equiposDe = async pid => (await cliente.query(`SELECT id, tipo_equipo,
      nivel_mantenimiento AS nivel FROM programacion_mantenimiento_equipos
    WHERE programacion_id=$1 ORDER BY tipo_equipo`, [pid])).rows;
  const instalar = (u, tipos) => cliente.query(`UPDATE vehiculo_equipos
    SET estado_inventario='INSTALADO' WHERE placa=$1 AND tipo_equipo = ANY($2)`,
    [u.placa, tipos]);
  const abrirOT = async pid => (await una(`INSERT INTO ordenes_trabajo
    (programacion_id, tecnico_id, abierta_por_id) VALUES ($1,$2,$3) RETURNING id`,
    [pid, TECNICO, USUARIO])).id;
  const detalleOT = (ot, pid, eq, estado, nivel) => cliente.query(
    `INSERT INTO ordenes_trabajo_detalle (orden_trabajo_id, programacion_id,
       programacion_equipo_id, estado, nivel_completado) VALUES ($1,$2,$3,$4,$5)`,
    [ot, pid, eq, estado, nivel]);
  const cerrarOT = (ot, fecha) => una(`SELECT * FROM cerrar_orden_trabajo($1,$2,$3::date,$4,$5)`,
    [ot, USUARIO, fecha, 30, 'prueba del banco']);
  const aislado = async fn => {
    await cliente.query('SAVEPOINT caso');
    try { await fn(); } finally { await cliente.query('ROLLBACK TO SAVEPOINT caso'); }
  };

  // ============================================================== P1
  sec('P1 · SEGUNDA CORRIDA IDENTICA  ->  ninguna obligacion ya materializada se reproyecta');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });
    await regularesM1(u);
    const a = await proj();
    chk(soloDe(a.g, u).length === 1, 'P1 · primera corrida: una visita', `${soloDe(a.g, u).length}`);
    chk(pendDe(a.g, u).length === 3, 'P1 · tres obligaciones pendientes', pendDe(a.g, u).join(' '));
    chk(yaMatDe(a.g, u).length === 0, 'P1 · ninguna ya materializada todavia', '0');
    const r = await materializar(cliente, soloDe(a.g, u));
    chk(r.programaciones === 1 && r.detalles === 3, 'P1 · se materializa 1 visita y 3 detalles',
      `${r.programaciones} / ${r.detalles}`);
    const b = await proj();
    console.log(`   tras materializar · cubre: ${cubreDe(b.ins, u).join(' ')}`);
    chk(yaMatDe(b.g, u).length === 3, 'P1 · las tres pasan a OBLIGACION_YA_MATERIALIZADA',
      yaMatDe(b.g, u).join(' '));
    chk(pendDe(b.g, u).length === 0, 'P1 · no queda ninguna pendiente', `${pendDe(b.g, u).length}`);
    chk(visitasDe(b.g, u).length === 0, 'P1 · la segunda corrida no forma ninguna visita', '0');
    const r2 = await materializar(cliente, soloDe(b.g, u));
    chk(r2.programaciones === 0 && r2.red_de_seguridad.length === 0,
      'P1 · nada que escribir, y el UNIQUE no tuvo que intervenir', '0 / 0');
    chk((await filasDe(u)).n === 1, 'P1 · una sola fila en la base', '1');
  });

  // ============================================================== P2
  sec('P2 · REPROGRAMACION  ->  la obligacion de octubre NO reaparece en octubre');
  await aislado(async () => {
    // una sola obligacion en el horizonte: GPS anual, 24 quincenas. Las regulares NO_APLICA.
    const u = await nuevaUnidad({ GPS: 'INSTALADO' });
    await ciclo(u, 'GPS', 'M3', quin(idx(OCT) - 24));
    const a = await proj(OCT, '2026-11-30');
    const v = soloDe(a.g, u);
    chk(v.length === 1 && v[0].quincena === OCT, 'P2 · una visita, en octubre',
      v.map(x => x.quincena).join(' '));
    await materializar(cliente, v);
    const pid = v[0].programacion_id;
    // reprogramar: la visita se mueve a noviembre y la quincena original NO se toca
    await cliente.query(`UPDATE programacion_mantenimiento SET estado='REPROGRAMADO',
      quincena_reprogramada=$2::date WHERE id=$1`, [pid, NOV]);
    const f = await una(`SELECT estado, quincena_programada::text AS qp,
      quincena_reprogramada::text AS qr, quincena_efectiva::text AS qe
      FROM programacion_mantenimiento WHERE id=$1`, [pid]);
    chk(f.qp === OCT && f.qr === NOV && f.qe === NOV && f.estado === 'REPROGRAMADO',
      'P2 · programada octubre · efectiva noviembre', `${f.qp} -> ${f.qe}`);
    const b = await proj(OCT, '2026-11-30');
    chk(yaMatDe(b.g, u).join(' ') === `GPS/M3@${OCT}`,
      'P2 · la obligacion sigue materializada por su quincena PROGRAMADA', yaMatDe(b.g, u).join(' '));
    chk(pendDe(b.g, u).length === 0, 'P2 · no vuelve a estar pendiente', `${pendDe(b.g, u).length}`);
    chk(visitasDe(b.g, u).length === 0, 'P2 · NO se forma ninguna visita en octubre', '0');
    chk(b.ins.slots.has(`${u.id}|${NOV}`) && !b.ins.slots.has(`${u.id}|${OCT}`),
      'P2 · el slot ocupado es el de noviembre, no el de octubre', 'quincena_efectiva');
    chk((await filasDe(u)).n === 1, 'P2 · sigue habiendo una sola fila', '1');
  });

  // ============================================================== P3
  sec('P3 · GRANO FINO  ->  una visita regular M1 no oculta un GPS/M3 de la misma quincena');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });       // GPS todavia NO_APLICA
    await regularesM1(u);
    const a = await proj();
    await materializar(cliente, soloDe(a.g, u));
    const pid = soloDe(a.g, u)[0].programacion_id;
    // ahora aparece el GPS, con su obligacion anual en la MISMA quincena
    await instalar(u, ['GPS']);
    await ciclo(u, 'GPS', 'M3', quin(iQ - 24));
    const b = await proj();
    chk(cubreDe(b.ins, u).every(k => !k.startsWith('GPS')),
      'P3 · la visita regular NO cubre nada de GPS', cubreDe(b.ins, u).filter(k => k.startsWith('GPS')).join(' ') || 'ninguna clave GPS');
    chk(pendDe(b.g, u).join(' ') === `GPS/M3@${Q}`, 'P3 · el GPS/M3 AFLORA como pendiente',
      pendDe(b.g, u).join(' '));
    chk(visitasDe(b.g, u).length === 1, 'P3 · se forma una visita para el GPS', '1');
    chk(colDe(b.g, u).length === 1 && soloDe(b.g, u).length === 0,
      'P3 · y como el slot esta ocupado, es COLISION y no se escribe', 'colision');
    const c = colDe(b.g, u)[0];
    chk(c.motivo === 'ANUAL_NO_REPRESENTADA', 'P3 · motivo ANUAL_NO_REPRESENTADA', c.motivo);
    chk(c.programacion_id_ocupa === pid && c.pendiente_intenta.join(' ') === 'GPS/M3',
      'P3 · el reporte identifica al ocupante y lo que intentaba entrar',
      `ocupa ${c.programacion_id_ocupa} · intenta ${c.pendiente_intenta.join(' ')}`);
  });

  // ============================================================== P4
  sec('P4 · CASO INVERSO  ->  una visita solo GPS/M3 no oculta obligaciones regulares');
  await aislado(async () => {
    const u = await nuevaUnidad({ GPS: 'INSTALADO' });
    await ciclo(u, 'GPS', 'M3', quin(iQ - 24));
    const a = await proj();
    chk(soloDe(a.g, u)[0].solo_anual === true, 'P4 · la primera visita es solo anual', 'solo_anual');
    await materializar(cliente, soloDe(a.g, u));
    const pid = soloDe(a.g, u)[0].programacion_id;
    // ahora se instalan las tres regulares, con su M1 venciendo en la MISMA quincena
    await instalar(u, [...FISICOS.CAMARAS, ...FISICOS.COPILOTO,
      ...FISICOS.RADIO_BASE]);
    await regularesM1(u);
    const b = await proj();
    chk(cubreDe(b.ins, u).join(' ') === `GPS/M3/${Q}`,
      'P4 · el GPS solo cubre GPS/M3, nada regular', cubreDe(b.ins, u).join(' '));
    chk(pendDe(b.g, u).length === 3 && pendDe(b.g, u).every(k => k.endsWith(`/M1@${Q}`)),
      'P4 · las tres regulares M1 AFLORAN como pendientes', pendDe(b.g, u).join(' '));
    chk(colDe(b.g, u).length === 1 && colDe(b.g, u)[0].motivo === 'REGULAR_NO_REPRESENTADA',
      'P4 · colision REGULAR_NO_REPRESENTADA', colDe(b.g, u)[0]?.motivo);
    chk(colDe(b.g, u)[0].existente_contiene.join(' ') === 'GPS/M3',
      'P4 · el reporte muestra que la existente solo contiene GPS/M3',
      colDe(b.g, u)[0].existente_contiene.join(' '));
    chk((await equiposDe(pid)).length === 1,
      'P4 · la visita existente NO recibio ningun detalle nuevo', '1 detalle');
  });

  // ============================================================== P5
  sec('P5 · ACUMULACION  ->  M2 cubre M2+M1 · M3 cubre M3+M2+M1 · nunca de mas');
  await aislado(async () => {
    const u2 = await nuevaUnidad({ ...TODO });
    await regularesM1(u2);
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M2'`,
      [u2.id, atras(6)]);
    const a2 = await proj();
    chk(soloDe(a2.g, u2)[0].nivel_regular === 'M2', 'P5 · la visita es M2', 'M2');
    await materializar(cliente, soloDe(a2.g, u2));
    const b2 = await proj();
    const c2 = cubreDe(b2.ins, u2);
    chk(REGULARES.every(f => c2.includes(`${f}/M2/${Q}`) && c2.includes(`${f}/M1/${Q}`)),
      'P5 · M2 cubre M2 y M1 de las tres familias', `${c2.length} claves`);
    chk(REGULARES.every(f => !c2.includes(`${f}/M3/${Q}`)),
      'P5 · y NO cubre M3: un M2 no afirma un M3', 'ningun M3');
    chk(pendDe(b2.g, u2).length === 0, 'P5 · sin pendientes en Q', `${pendDe(b2.g, u2).length}`);

    const u3 = await nuevaUnidad({ ...TODO });
    await regularesM1(u3);
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u3.id, atras(12)]);
    const a3 = await proj();
    chk(soloDe(a3.g, u3)[0].nivel_regular === 'M3', 'P5 · la visita es M3', 'M3');
    await materializar(cliente, soloDe(a3.g, u3));
    const b3 = await proj();
    const c3 = cubreDe(b3.ins, u3);
    chk(REGULARES.every(f => ['M1', 'M2', 'M3'].every(n => c3.includes(`${f}/${n}/${Q}`))),
      'P5 · M3 cubre M3, M2 y M1 de las tres familias', `${c3.length} claves`);
    chk(c3.length === 9, 'P5 · exactamente 9 claves (3 familias x 3 niveles), ni una mas', `${c3.length}`);
  });

  // ============================================================== P6
  sec('P6 · ESCALADA  ->  un M3 nuevo sigue aflorando aunque el M1 ya este materializado');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });
    await regularesM1(u);
    const a = await proj();
    await materializar(cliente, soloDe(a.g, u));
    const pid = soloDe(a.g, u)[0].programacion_id;
    chk((await equiposDe(pid)).every(e => e.nivel === 'M1'), 'P6 · lo materializado es M1', 'M1');
    // (a) el M3 vence en OTRA quincena: el slot esta libre y la visita es segura
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u.id, quin(iQ + 2 - 12)]);
    const b = await proj(Q, '2027-02-28');
    const vQ2 = visitasDe(b.g, u).find(v => v.quincena === Q2);
    chk(!!vQ2 && vQ2.nivel_regular === 'M3', 'P6.a · el M3 aflora en su quincena, nivel M3',
      `${vQ2?.quincena} ${vQ2?.nivel_regular}`);
    chk(!!vQ2 && vQ2.destino === 'MATERIALIZABLE', 'P6.a · con el slot libre es materializable',
      vQ2?.destino);
    chk(pendDe(b.g, u).includes(`CAMARAS/M3@${Q2}`), 'P6.a · CAMARAS/M3 esta entre las pendientes',
      pendDe(b.g, u).filter(k => k.includes('M3')).join(' '));
    // (b) el M3 vence en LA MISMA quincena ya materializada como M1
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u.id, atras(12)]);
    const c = await proj();
    chk(pendDe(c.g, u).join(' ') === `CAMARAS/M3@${Q}`,
      'P6.b · el M3 aflora pese a que M1 ya estaba materializado', pendDe(c.g, u).join(' '));
    chk(colDe(c.g, u).length === 1 && colDe(c.g, u)[0].motivo === 'ESCALADA_DE_NIVEL',
      'P6.b · en la misma quincena es ESCALADA_DE_NIVEL', colDe(c.g, u)[0]?.motivo);
    chk(colDe(c.g, u)[0].no_representado.some(x => x.includes('(existe M1)')),
      'P6.b · el reporte dice que existe M1 y se pedia M3',
      colDe(c.g, u)[0].no_representado.join(' '));
    chk((await equiposDe(pid)).every(e => e.nivel === 'M1'),
      'P6.b · y NO se elevo el nivel de la visita existente', 'sigue M1');
  });

  // ============================================================== P7
  sec('P7 · CANCELADO  ->  la obligacion vuelve a ser elegible y nace una sustituta');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });
    await regularesM1(u);
    const a = await proj();
    await materializar(cliente, soloDe(a.g, u));
    const vieja = soloDe(a.g, u)[0].programacion_id;
    const b = await proj();
    chk(pendDe(b.g, u).length === 0, 'P7 · con la visita viva no hay pendientes', '0');
    await cliente.query(`UPDATE programacion_mantenimiento SET estado='CANCELADO' WHERE id=$1`,
      [vieja]);
    const c = await proj();
    chk(cubreDe(c.ins, u).length === 0, 'P7 · la cancelada sale de materializadas', '0 claves');
    chk(!c.ins.slots.has(`${u.id}|${Q}`), 'P7 · y su slot queda libre', 'libre');
    chk(pendDe(c.g, u).length === 3, 'P7 · las tres obligaciones vuelven a ser elegibles',
      pendDe(c.g, u).join(' '));
    chk(soloDe(c.g, u).length === 1, 'P7 · se forma una visita sustituta, segura', '1');
    const r = await materializar(cliente, soloDe(c.g, u));
    const nueva = soloDe(c.g, u)[0].programacion_id;
    chk(r.programaciones === 1 && nueva !== vieja, 'P7 · la sustituta es una fila NUEVA',
      `${vieja} -> ${nueva}`);
    const f = await una(`SELECT count(*)::int AS n,
        count(*) FILTER (WHERE estado='CANCELADO')::int AS canc
      FROM programacion_mantenimiento WHERE programa_unidad_id=$1`, [u.id]);
    chk(f.n === 2 && f.canc === 1, 'P7 · la cancelada permanece como historial', `${f.n} filas`);
    chk((await equiposDe(vieja)).length === 3,
      'P7 · y conserva su alcance intacto, sin reciclarse', '3 detalles');
  });

  // ============================================================== P8
  sec('P8 · COLISION  ->  no se modifica, no se reutiliza, no se escribe nada');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });
    await regularesM1(u);
    const a = await proj();
    await materializar(cliente, soloDe(a.g, u));
    const pid = soloDe(a.g, u)[0].programacion_id;
    // nivel_mantenimiento sale de la lista: el 900 la retira de la cabecera. La prueba
    // sigue demostrando lo mismo -que la fila no se toco- con estado, observaciones,
    // updated_at y el numero de detalles.
    const antes = await una(`SELECT estado, observaciones,
        updated_at::text AS upd,
        (SELECT count(*)::int FROM programacion_mantenimiento_equipos WHERE programacion_id=$1) AS det
      FROM programacion_mantenimiento WHERE id=$1`, [pid]);
    // fuerza la colision: un M3 nuevo en la misma quincena
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u.id, atras(12)]);
    const b = await proj();
    chk(colDe(b.g, u).length === 1, 'P8 · una colision detectada', '1');
    const r = await materializar(cliente, soloDe(b.g, u));
    chk(r.programaciones === 0 && r.detalles === 0,
      'P8 · la materializacion no escribe nada para esa unidad', '0 / 0');
    const desp = await una(`SELECT estado, observaciones,
        updated_at::text AS upd,
        (SELECT count(*)::int FROM programacion_mantenimiento_equipos WHERE programacion_id=$1) AS det
      FROM programacion_mantenimiento WHERE id=$1`, [pid]);
    chk(desp.estado === antes.estado && desp.upd === antes.upd
      && desp.observaciones === antes.observaciones,
      'P8 · la programacion existente no se toco', `${desp.estado} · updated_at intacto`);
    chk(desp.det === antes.det, 'P8 · ni se le colgo ningun detalle', `${desp.det} detalles`);
    chk((await filasDe(u)).n === 1, 'P8 · ni se creo una segunda programacion', '1 fila');
  });

  // ============================================================== P9
  sec('P9 · CORRIDA MIXTA  ->  las seguras se materializan, las colisiones no · exit 3');
  await aislado(async () => {
    // segura: unidad limpia
    const libre = await nuevaUnidad({ ...TODO });
    await regularesM1(libre);
    // colision: unidad con su slot ya ocupado y un M3 nuevo encima
    const choca = await nuevaUnidad({ ...TODO });
    await regularesM1(choca);
    const a = await proj();
    await materializar(cliente, soloDe(a.g, choca));
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [choca.id, atras(12)]);
    const b = await proj();
    const mias = [...soloDe(b.g, libre), ...soloDe(b.g, choca)];
    console.log(`   seguras mias ${mias.length} · colisiones mias `
      + `${colDe(b.g, libre).length + colDe(b.g, choca).length}`);
    chk(soloDe(b.g, libre).length === 1 && soloDe(b.g, choca).length === 0,
      'P9 · una segura y una en colision', '1 / 1');
    const r = await materializar(cliente, mias);
    chk(r.programaciones === 1 && r.detalles === 3, 'P9 · se materializa SOLO la segura',
      `${r.programaciones} / ${r.detalles}`);
    chk((await filasDe(libre)).n === 1, 'P9 · la segura quedo escrita', '1');
    chk((await filasDe(choca)).n === 1, 'P9 · la unidad en colision sigue con su fila original', '1');
    // la misma funcion que decide en el runner
    chk(codigoDeSalida({ fallas: 0, colisiones: 0 }) === 0, 'P9 · exit 0 sin colisiones', '0');
    chk(codigoDeSalida({ fallas: 0, colisiones: b.g.colisiones.length }) === 3,
      'P9 · exit 3 con colisiones y sin fallas', '3');
    chk(codigoDeSalida({ fallas: 1, colisiones: 0 }) === 2, 'P9 · exit 2 por error tecnico', '2');
    chk(codigoDeSalida({ fallas: 1, colisiones: 5 }) === 2,
      'P9 · el error tecnico manda sobre la colision', '2');
  });

  // ============================================================== P10
  sec('P10 · UNA VISITA M3 REGULAR  ->  una programacion y una futura OT, no una por equipo');
  await aislado(async () => {
    const u = await nuevaUnidad({ ...TODO });
    await regularesM1(u);
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u.id, atras(12)]);
    const a = await proj();
    const r = await materializar(cliente, soloDe(a.g, u));
    chk(r.programaciones === 1 && r.detalles === 3,
      'P10 · una sola programacion con tres detalles', `${r.programaciones} / ${r.detalles}`);
    const eq = await equiposDe(soloDe(a.g, u)[0].programacion_id);
    chk(eq.length === 3 && eq.every(e => e.nivel === 'M3'),
      'P10 · las tres familias regulares en M3', eq.map(e => `${e.tipo_equipo}/${e.nivel}`).join(' '));
    const ot = await una(`SELECT count(*)::int AS n FROM ordenes_trabajo o
      JOIN programacion_mantenimiento p ON p.id=o.programacion_id
      WHERE p.programa_unidad_id=$1`, [u.id]);
    chk(ot.n === 0, 'P10 · el generador no abrio ninguna OT', `${ot.n}`);
  });

  // ============================================================== P11
  sec('P11 · GPS/ADAS  ->  independientes y solo M3, ni por cobertura ni por elevacion');
  await aislado(async () => {
    const u = await nuevaUnidad({ GPS: 'INSTALADO', ADAS: 'INSTALADO', ...TODO }, 'EVO TRACKLOG');
    await regularesM1(u);
    await ciclo(u, 'GPS', 'M3', quin(iQ - 24));
    await ciclo(u, 'ADAS', 'M3', quin(iQ - 24));
    await cliente.query(`UPDATE programa_mantenimiento_unidad_anclas SET quincena_ancla=$2::date
      WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M3'`,
      [u.id, atras(12)]);
    const a = await proj();
    const v = soloDe(a.g, u)[0];
    chk(v.nivel_regular === 'M3' && v.detalles.length === 5,
      'P11 · una visita M3 con las tres regulares y las dos anuales',
      `${v.detalles.length} detalles`);
    await materializar(cliente, [v]);
    const b = await proj();
    const c = cubreDe(b.ins, u);
    chk(ANUALES.every(f => c.includes(`${f}/M3/${Q}`)),
      'P11 · GPS y ADAS cubren su M3', c.filter(k => /^(GPS|ADAS)/.test(k)).join(' '));
    chk(ANUALES.every(f => !c.includes(`${f}/M1/${Q}`) && !c.includes(`${f}/M2/${Q}`)),
      'P11 · y NO cubren M1 ni M2: las anuales no acumulan', 'solo M3');
    chk(c.filter(k => /^(GPS|ADAS)/.test(k)).length === 2,
      'P11 · exactamente dos claves anuales', '2');
    const eq = await equiposDe(v.programacion_id);
    chk(eq.filter(e => ANUALES.includes(e.tipo_equipo)).every(e => e.nivel === 'M3'),
      'P11 · en la base, todo detalle anual es M3', 'M3');
  });

  // ============================================================== P12
  sec('P12 · MATERIALIZADA NO ES CUMPLIDA  ->  la fila existe, el ciclo no avanzo');
  await aislado(async () => {
    for (const [destino, estadoDetalle, nivelCompletado] of [
      ['NO_EJECUTADO', 'PENDIENTE', null], ['NO_APLICA', 'NO_APLICA', null]]) {
      const u = await nuevaUnidad({ ...TODO });
      await regularesM1(u);
      const a = await proj();
      const v = soloDe(a.g, u)[0];
      await materializar(cliente, [v]);
      const pid = v.programacion_id;
      const cicloAntes = await una(`SELECT ultima_quincena::text AS q, fuente
        FROM programa_mantenimiento_unidad_ciclos
        WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M1'`, [u.id]);
      // por la via legitima: promover, abrir OT, resolver detalles y cerrar
      await cliente.query(`UPDATE programacion_mantenimiento SET estado='PROGRAMADO'
        WHERE id=$1`, [pid]);
      const ot = await abrirOT(pid);
      for (const e of await equiposDe(pid))
        await detalleOT(ot, pid, e.id, estadoDetalle, nivelCompletado);
      const res = await cerrarOT(ot, FIS);
      chk(res.estado_programacion === destino, `P12 · la visita queda ${destino}`,
        res.estado_programacion);
      chk(res.ciclos_afectados === 0, `P12 · ${destino} no movio ningun ciclo`,
        `${res.ciclos_afectados}`);
      const cicloDesp = await una(`SELECT ultima_quincena::text AS q, fuente
        FROM programa_mantenimiento_unidad_ciclos
        WHERE programa_unidad_id=$1 AND tipo_equipo='CAMARAS' AND nivel_mantenimiento='M1'`, [u.id]);
      chk(cicloDesp.q === cicloAntes.q && cicloDesp.fuente === cicloAntes.fuente,
        `P12 · ${destino}: la referencia de fase NO avanzo`, `${cicloDesp.q} (${cicloDesp.fuente})`);
      const b = await proj();
      chk(yaMatDe(b.g, u).length === 3,
        `P12 · ${destino}: la obligacion de Q sigue MATERIALIZADA, no se duplica`,
        `${yaMatDe(b.g, u).length} claves`);
      chk(!visitasDe(b.g, u).some(x => x.quincena === Q),
        `P12 · ${destino}: no se forma otra visita en Q`, '0 en Q');
      // y como el ciclo no avanzo, el siguiente termino sigue naciendo de la misma referencia
      const c = await proj(Q, '2027-01-31');
      const sig = visitasDe(c.g, u).find(x => x.quincena === QS);
      chk(!!sig && sig.detalles.length === 3,
        `P12 · ${destino}: el termino de ${QS} sigue debiendose y se programa aparte`,
        `${sig?.quincena}`);
      chk(pendDe(c.g, u).every(k => !k.endsWith(`@${Q}`)),
        `P12 · ${destino}: y ninguna pendiente vuelve a ${Q}`, pendDe(c.g, u).join(' ') || 'ninguna');
    }
  });

  // ============================================================== las reales, intactas
  sec('LAS UNIDADES REALES NO SE HAN TOCADO');
  const fin = await una(`SELECT
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE programa_unidad_id NOT IN (SELECT id FROM programa_mantenimiento_unidades
        WHERE placa LIKE 'ZZ%')) AS ciclos,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas
      WHERE programa_unidad_id NOT IN (SELECT id FROM programa_mantenimiento_unidades
        WHERE placa LIKE 'ZZ%')) AS anclas,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos
      WHERE updated_at<>created_at) AS ciclos_tocados,
    (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas
      WHERE updated_at<>created_at) AS anclas_tocadas,
    (SELECT count(*)::int FROM programa_mantenimiento_unidades
      WHERE programa_id=$1 AND placa NOT LIKE 'ZZ%') AS unidades`, [programaId]);
  chk(fin.ciclos === base.ciclos, 'los 543 ciclos reales siguen ahi', `${fin.ciclos}`);
  chk(fin.anclas === base.anclas, 'las 772 anclas reales siguen ahi', `${fin.anclas}`);
  chk(fin.ciclos_tocados === 0, 'ningun ciclo modificado por el generador', `${fin.ciclos_tocados}`);
  chk(fin.anclas_tocadas === 0, 'ninguna ancla modificada', `${fin.anclas_tocadas}`);
  chk(fin.unidades === base.unidades, 'las 174 unidades reales intactas', `${fin.unidades}`);
} catch (e) {
  mal++;
  console.error(`\n   *** EXCEPCION *** ${e.code || ''} ${e.message}`);
  if (e.detail) console.error(`   detalle: ${e.detail}`);
  if (e.constraint) console.error(`   constraint: ${e.constraint}`);
  if (e.where) console.error(`   where: ${e.where}`);
} finally {
  // ROLLBACK INCONDICIONAL. Nada de este banco puede sobrevivir.
  try {
    await cliente.query('ROLLBACK');
    const t = await una(`SELECT
      (SELECT count(*)::int FROM programacion_mantenimiento) AS p,
      (SELECT count(*)::int FROM programacion_mantenimiento_equipos) AS d,
      (SELECT count(*)::int FROM programa_mantenimiento_unidades WHERE placa LIKE 'ZZ%') AS fix,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_ciclos) AS c,
      (SELECT count(*)::int FROM programa_mantenimiento_unidad_anclas) AS a,
      (SELECT count(*)::int FROM ordenes_trabajo) AS ot,
      (SELECT count(*)::int FROM vehiculos WHERE placa LIKE 'ZZ%') AS veh`);
    sec('ROLLBACK · ESTADO REAL TRAS REVERTIR');
    console.log(`   programacion_mantenimiento ......... ${t.p}`);
    console.log(`   programacion_..._equipos ........... ${t.d}`);
    console.log(`   unidades fixture supervivientes .... ${t.fix}`);
    console.log(`   vehiculos fixture supervivientes ... ${t.veh}`);
    console.log(`   ciclos ............................. ${t.c}`);
    console.log(`   anclas ............................. ${t.a}`);
    console.log(`   ordenes_trabajo .................... ${t.ot}`);
    chk(t.p === 0 && t.d === 0, 'el ROLLBACK dejo programacion y detalles en 0', `${t.p} / ${t.d}`);
    chk(t.fix === 0 && t.veh === 0, 'no sobrevivio ningun fixture', `${t.fix} unidades, ${t.veh} vehiculos`);
    // 017 · se compara contra la foto de partida, no contra un numero cableado: el banco
    // no necesita saber cuantos ciclos hay, solo que el ROLLBACK no los movio.
    chk(partida !== null && t.c === partida.ciclos && t.a === partida.anclas,
      'ciclos y anclas en su valor de partida',
      `${t.c} / ${t.a}` + (partida ? ` (partida ${partida.ciclos} / ${partida.anclas})` : ' (sin foto)'));
    chk(t.ot === 0, 'ordenes_trabajo sigue en 0', `${t.ot}`);
  } catch (e) { console.error(`   fallo el ROLLBACK o la verificacion: ${e.message}`); mal++; }
  cliente.release(); await pool.end();
}
sec(`${ok} OK · ${mal} FALLAS${fallos.length ? '\nfallos: ' + fallos.join(' | ') : ''}`);
console.log(`RESULTADO: ${mal ? 'CON FALLAS' : 'A..O + P1..P12 pasan, nada persistido'}`);
process.exit(mal ? 2 : 0);
