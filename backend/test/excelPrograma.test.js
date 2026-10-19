import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import ExcelJS from 'exceljs';

const registros = [];
let fallar = false;
let instantanea = null;
const cliente = {
  query: async (sql, params) => {
    registros.push({ sql, params });
    if (fallar && sql.includes('FROM vehiculos')) throw new Error('fallo de prueba');
    if (sql.includes('FROM programas_mantenimiento p')) return { rows: instantanea ? [{ ...instantanea.programa, fecha_negocio: instantanea.fecha_negocio }] : [] };
    if (sql.includes('LEFT JOIN programas_mantenimiento_versiones')) return { rows: [{ fecha_negocio: instantanea.fecha_negocio, ...instantanea.version }] };
    if (sql.includes('JOIN vehiculos')) { if (fallar) throw new Error('fallo de prueba'); return { rows: instantanea.unidades }; }
    if (sql.includes('FROM programacion_mantenimiento p')) return { rows: instantanea.visitas };
    if (sql.includes('FROM programa_mantenimiento_unidad_ciclos')) return { rows: instantanea.ciclos };
    return { rows: [] };
  },
  release: () => registros.push({ sql: 'RELEASE' })
};
mock.module('../src/config/database.js', { namedExports: { pool: { connect: async () => cliente } } });
const { prepararReporte, filtrosExcel, finQuincena } = await import('../src/modules/programas/programacion/excel/service.js');
const { leerProgramaExcel } = await import('../src/modules/programas/programacion/excel/repository.js');
const { descargarProgramaExcel } = await import('../src/modules/programas/programacion/excel/controller.js');
const { generarExcelPrograma } = await import('../src/reports/excelProgramaTiPr01.js');
const tipos = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
function visita(id, q, nivel = 'M1', estado = 'PROYECTADO', tiposEquipo = tipos) {
  return { id, programa_unidad_id: 10, estado, quincena_programada: q, quincena_efectiva: q,
    equipos: tiposEquipo.map((tipo_equipo, i) => ({ id: id * 10 + i, tipo_equipo, nivel_mantenimiento: nivel })),
    resultados: [], ajustes: [], fecha_ejecucion: null };
}
function datos(visitas = [visita(1, '2026-10-01'), visita(2, '2026-10-16', 'M3')]) {
  return { programa: { id: 90, codigo: 'TI-PR-01', nombre: 'MANTENIMIENTO DE EQUIPOS TECNOLÓGICOS - TRACTO / CAMIONETAS' },
    version: { id: 63, version: '01', fecha_documento: '2026-09-25', periodo_inicio: '2026-09-01', periodo_fin: '2026-12-31' },
    fecha_negocio: '2026-10-15', unidades: [{ id: 10, placa: 'V0I941', tipo_vehiculo: 'TRACTO', cliente: 'REPSOL', operacion: 'QUELLAVECO', marca_tracto: 'INTERNATIONAL', modelo_tracto: 'PROSTAR', anio_fabricacion: 2020, quincena_incorporacion: null }],
    visitas, ciclos: [] };
}

test('Valida filtros y conserva O y 0 sin imponer filtros SQL', () => {
  assert.deepEqual(filtrosExcel({ busqueda: ' v0i-941 ', operacion: 'quellaveco', estado: 'PROGRAMADO' }), { busqueda: 'V0I941', operacion: 'QUELLAVECO', estado: 'PROGRAMADO' });
  for (const q of [{ estado: 'INVALIDO' }, { busqueda: ['a'] }, { operacion: {} }, { busqueda: 'a'.repeat(151) }, { usuario_id: '8' }]) assert.throws(() => filtrosExcel(q), e => e.status === 400);
  assert.equal(prepararReporte(datos(), filtrosExcel({ busqueda: 'VOI941' })).filas.length, 0);
  assert.equal(prepararReporte(datos(), filtrosExcel({ busqueda: 'V0I-941' })).filas.length, 1);
});

test('Quincenas de calendario: no usa saltos de 15 días; incluye período vacío', () => {
  const r = prepararReporte(datos([]));
  assert.deepEqual(r.quincenas, ['2026-09-01','2026-09-16','2026-10-01','2026-10-16','2026-11-01','2026-11-16','2026-12-01','2026-12-16']);
  assert.equal(finQuincena('2028-02-16'), '2028-02-29');
  assert.equal(finQuincena('2026-10-16'), '2026-10-31');
  assert.deepEqual(r.filas, []);
});

test('No exporta unidades sin visitas, con solo ciclos o con visitas fuera del período', () => {
  const d = datos();
  d.unidades.push(
    { id: 20, placa: 'SIN001', operacion: 'QUELLAVECO' },
    { id: 30, placa: 'CIC001', operacion: 'QUELLAVECO' },
    { id: 40, placa: 'ANT001', operacion: 'QUELLAVECO' }
  );
  d.ciclos.push({ programa_unidad_id: 30, tipo_equipo: 'CAMARAS', nivel_mantenimiento: 'M1', ultima_fecha_real: '2026-08-20' });
  d.visitas.push({ ...visita(50, '2026-08-01'), programa_unidad_id: 40 });
  const r = prepararReporte(d);
  assert.deepEqual(r.filas.map(f => f.unidad.placa), ['V0I941']);
  assert.equal(r.filas[0].programados, 2);
  assert.deepEqual(prepararReporte(d, filtrosExcel({ busqueda: 'SIN001' })).filas, []);
});

test('La quincena no vence en su primer día: misma regla que Programa', () => {
  const d=datos([visita(1,'2026-10-01')]);
  d.fecha_negocio='2026-10-01';
  assert.equal(prepararReporte(d).filas[0].estado,'AL DÍA');
  d.fecha_negocio='2026-10-15';
  assert.equal(prepararReporte(d).filas[0].estado,'POR VENCER');
  d.fecha_negocio='2026-10-16';
  assert.equal(prepararReporte(d).filas[0].estado,'VENCIDO');
});

test('M3 y M2 próximos salen de visitas reales; GPS M3 no eleva el regular', () => {
  const v=visita(1,'2026-10-01');
  v.equipos.push({ id: 19, tipo_equipo:'GPS', nivel_mantenimiento:'M3' });
  const r=prepararReporte(datos([v,visita(2,'2026-10-16','M2'),visita(3,'2026-12-16','M3')]));
  assert.equal(r.filas[0].matriz.get('2026-10-01').texto,'M1');
  assert.deepEqual(r.filas[0].proximas,['2026-10-01','2026-10-16','2026-12-16']);
  assert.match(r.filas[0].observaciones,/GPS M3/);
  assert.equal(prepararReporte(datos([visita(4,'2026-11-01','M3','PROYECTADO',['GPS'])])).filas[0].matriz.get('2026-11-01').texto,'AN');
});

test('Últimas fechas cubren todas las familias; M3 cubre M2/M1 pero GPS no', () => {
  const d=datos();
  d.ciclos=[{ programa_unidad_id:10,tipo_equipo:'GPS',nivel_mantenimiento:'M3',ultima_fecha_real:'2026-10-14' },
    ...tipos.map(tipo_equipo=>({programa_unidad_id:10,tipo_equipo,nivel_mantenimiento:'M3',ultima_fecha_real:'2026-10-05'}))];
  assert.deepEqual(prepararReporte(d).filas[0].ultimas, ['2026-10-05','2026-10-05','2026-10-05']);
  d.ciclos=d.ciclos.filter(c=>c.tipo_equipo!=='RADIO_BASE');
  const f=prepararReporte(d).filas[0];
  assert.deepEqual(f.ultimas,[null,null,null]);
  assert.match(f.observaciones,/RADIO_BASE: sin registro/);
});

test('Reprogramado en origen y nivel en destino: no duplica el denominador; incluye extensión de año', () => {
  const v=visita(1,'2026-12-16','M3','REPROGRAMADO');
  v.quincena_efectiva='2027-01-01';
  v.ajustes=[{ tipo:'REPROGRAMACION', origen:'2026-12-16',destino:'2027-01-01',motivo:'La unidad no llegó a base.' }];
  const r=prepararReporte(datos([v]));
  const f=r.filas[0];
  assert.equal(f.matriz.get('2026-12-16').texto,'Reprogramado');
  assert.equal(f.matriz.get('2027-01-01').texto,'M3');
  assert.equal(r.quincenas.at(-1),'2027-01-01');
  assert.equal(f.programados,1);
  assert.match(f.observaciones,/La unidad no llegó a base/);
});

test('Origen ocupado conserva ambos niveles y rastro; canceladas no desplazan activas', () => {
  const a=visita(1,'2026-10-01','M2','REPROGRAMADO'); a.quincena_efectiva='2026-10-16';
  const b=visita(2,'2026-10-01');
  const c=visita(3,'2026-10-01','M3','CANCELADO');
  const f=prepararReporte(datos([c,a,b])).filas[0];
  assert.equal(f.matriz.get('2026-10-01').texto,'M1\nReprogramado');
  assert.equal(f.programados,2);
  assert.throws(()=>prepararReporte(datos([a,b,visita(5,'2026-10-01') ])), e=>e.status===409);
});

test('Cumplimiento por visita con OT cerrada y completa; excluye canceladas/no aplica, sin contar parciales', () => {
  const completa=visita(1,'2026-10-01','M3','EJECUTADO');
  completa.fecha_ejecucion='2026-10-05';
  completa.resultados=completa.equipos.map(e=>({equipo_id:e.id,estado:'COMPLETADO',nivel_completado:'M3',ot_id:8}));
  const parcial=visita(2,'2026-10-16','M2','EJECUTADO_PARCIAL');
  const sinOT=visita(3,'2026-11-01','M1','EJECUTADO'); sinOT.fecha_ejecucion='2026-11-02';
  const r=prepararReporte(datos([completa,parcial,sinOT,visita(4,'2026-11-16','M1','CANCELADO'),visita(5,'2026-12-01','M1','NO_APLICA')]));
  assert.equal(r.filas[0].programados,3);
  assert.equal(r.filas[0].ejecutados,1);
  assert.equal(r.filas[0].porcentaje,1/3);
});

test('Filtros de operación, placa y estado coinciden con los controles de Programa', () => {
  const d=datos();d.unidades.push({id:20,placa:'CAR943',operacion:null});
  d.visitas.push({...visita(3,'2026-10-01','M1','PROGRAMADO'),programa_unidad_id:20});
  assert.equal(prepararReporte(d,filtrosExcel({operacion:'QUELLAVECO'})).filas.length,1);
  assert.equal(prepararReporte(d,filtrosExcel({operacion:'__SIN_OPERACION__'})).filas[0].unidad.placa,'CAR943');
  assert.equal(prepararReporte(d,filtrosExcel({estado:'PROGRAMADO'})).filas[0].unidad.placa,'CAR943');
  assert.throws(()=>prepararReporte({...d,version:{...d.version,periodo_inicio:'2026-02-30'}}),e=>e.status===409);
});

test('XLSX tiene encabezado y fechas tipadas, fórmula de cumplimiento, filtros, paneles y colores', async () => {
  const reporte=prepararReporte(datos());
  const wb=await generarExcelPrograma(reporte);
  const buffer=await wb.xlsx.writeBuffer();
  const leido=new ExcelJS.Workbook(); await leido.xlsx.load(buffer);
  const s=leido.getWorksheet('TI-PR-01');
  assert.equal(leido.worksheets.length,1);
  assert.equal(s.getCell('C8').value,'V0I-941');
  assert.equal(s.getCell('G8').value,'QUELLAVECO');
  assert.equal(s.getCell('H8').value,'REPSOL');
  assert.equal(s.getCell('AB3').value.toISOString().slice(0,10),'2026-09-25');
  assert.equal(s.getCell('AB2').value,'01');
  assert.equal(s.getCell('AB2').numFmt,'@');
  assert.equal(s.getCell('Q7').value.toISOString().slice(0,10),'2026-09-01');
  assert.equal(s.getCell('J8').value.toISOString().slice(0,10),'2026-10-01');
  assert.equal(s.getCell('AA8').formula,'IF(Y8=0,"",Z8/Y8)');
  assert.equal(s.getCell('Y8').value,2);
  assert.equal(s.getCell('Z8').value,0);
  assert.equal(s.views[0].xSplit,3);assert.equal(s.views[0].ySplit,7);
  assert.equal(s.autoFilter,'A7:AB8');
  assert.equal(s.pageSetup.printTitlesRow,'1:7');
  assert.equal(s.conditionalFormattings.length,8);
  assert.equal(s.getCell('Q8').value,null);
  assert.equal(s.getCell('AB8').value,null);
});

test('Ancho dinámico y porcentajes sin división por cero; texto de usuario no se convierte en fórmula', async () => {
  const d=datos();d.version.periodo_fin='2026-10-31';
  d.unidades[0].modelo_tracto='=HYPERLINK("http://example.invalid")';
  const r=prepararReporte(d,filtrosExcel({estado:'CANCELADO'}));
  r.filas=[{...prepararReporte(d).filas[0],programados:0,ejecutados:0,porcentaje:null}];
  const w=await generarExcelPrograma(r),s=w.getWorksheet('TI-PR-01');
  assert.equal(s.getCell('W8').formula,'IF(U8=0,"",V8/U8)');
  assert.equal(s.getCell('E8').type,ExcelJS.ValueType.String);
  assert.match(s.getCell('E8').value,/^=HYPERLINK/);
  assert.equal(s.getCell('X6').value,'CUMPLIMIENTO DEL PERIODO');
});

test('Snapshot en transacción de solo lectura, sin límite ni N+1; libera al fallar', async () => {
  instantanea=datos();registros.length=0;
  const r=await leerProgramaExcel(90,{connect:async()=>cliente});
  assert.equal(r.unidades.length,1);
  assert.equal(registros[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(registros.at(-2).sql,'COMMIT');assert.equal(registros.at(-1).sql,'RELEASE');
  assert.equal(registros.filter(c=>c.sql.trim().startsWith('SELECT')).length,5);
  assert.ok(registros.every(c=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(c.sql)));
  assert.ok(registros.every(c=>!c.sql.includes('LIMIT')));
  fallar=true;registros.length=0;
  await assert.rejects(leerProgramaExcel(90,{connect:async()=>cliente}),/fallo de prueba/);
  assert.equal(registros.at(-2).sql,'ROLLBACK');assert.equal(registros.at(-1).sql,'RELEASE');
  fallar=false;
});

const res = () => ({codigo:200,headers:{},status(n){this.codigo=n;return this;},json(d){this.datos=d;return this;},setHeader(k,v){this.headers[k]=v;},send(d){this.buffer=d;return this;}});
test('Controlador devuelve Excel solo a admin/TI; 400, 403, 404 y 409 antes de enviar archivo', async () => {
  for (const rol of ['admin','ti']) {
    instantanea=datos();const r=res();
    await descargarProgramaExcel({user:{rol},params:{programaId:'90'},query:{}},r);
    assert.equal(r.codigo,200);assert.equal(r.headers['Cache-Control'],'no-store');
    assert.ok(r.buffer.length>5000);assert.match(r.headers['Content-Disposition'],/TI-PR-01/);
  }
  registros.length=0;const prohibido=res();
  await descargarProgramaExcel({user:{rol:'supervisor'},params:{programaId:'90'},query:{}},prohibido);
  assert.equal(prohibido.codigo,403);assert.equal(registros.length,0);
  const invalido=res();await descargarProgramaExcel({user:{rol:'admin'},params:{programaId:'90'},query:{estado:['a']}},invalido);
  assert.equal(invalido.codigo,400);assert.equal(registros.length,0);
  instantanea=null;const inexistente=res();await descargarProgramaExcel({user:{rol:'admin'},params:{programaId:'999'},query:{}},inexistente);assert.equal(inexistente.codigo,404);
  instantanea=datos();instantanea.version={id:null};const sinVersion=res();await descargarProgramaExcel({user:{rol:'admin'},params:{programaId:'90'},query:{}},sinVersion);assert.equal(sinVersion.codigo,409);
  instantanea=datos([]);const sinVisitas=res();await descargarProgramaExcel({user:{rol:'admin'},params:{programaId:'90'},query:{}},sinVisitas);
  assert.equal(sinVisitas.codigo,404);assert.equal(sinVisitas.buffer,undefined);
});
