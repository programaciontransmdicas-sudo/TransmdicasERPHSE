import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diaPeru, fechaVisibleOt, fechaEjecucionOt, filtrarYOrdenarFechasOt } from '../src/components/tiPr01/fechasOt.js';

const registro = (id, ejecucion, cierre, estado = 'CERRADA') => ({ orden: {
  id, estado, fecha_cierre: cierre, fecha_apertura: '2026-10-10T15:00:00Z',
  visita: { fecha_ejecucion: ejecucion, quincena_efectiva: '2026-10-01' }
} });
const ejemplo = registro(1852, '2026-10-13', '2026-10-27T20:00:00Z');
const ids = filas => filas.map(r => r.orden.id);

test('Distingue el día físico del trabajo y el sello de cierre en Perú', () => {
  assert.equal(fechaEjecucionOt(ejemplo.orden), '2026-10-13');
  assert.equal(fechaVisibleOt(ejemplo.orden.fecha_cierre), '27/10/2026');
  assert.equal(diaPeru('2026-10-28T02:00:00Z'), '2026-10-27');
  assert.equal(diaPeru('2026-10-28T05:00:00Z'), '2026-10-28');
  assert.equal(diaPeru('2026-10-13'), '2026-10-13');
});
test('Filtrar el 27 por cierre encuentra la OT ejecutada el 13; por ejecución no', () => {
  const rango = { desde: '2026-10-27', hasta: '2026-10-27' };
  assert.deepEqual(ids(filtrarYOrdenarFechasOt([ejemplo], { ...rango, filtrarPor: 'cierre' })), [1852]);
  assert.deepEqual(filtrarYOrdenarFechasOt([ejemplo], { ...rango, filtrarPor: 'ejecucion' }), []);
  assert.deepEqual(ids(filtrarYOrdenarFechasOt([ejemplo], { desde:'2026-10-13', hasta:'2026-10-13' })), [1852]);
});
test('La misma fecha filtra por quincena o apertura sin sustituir la ejecución', () => {
  assert.equal(filtrarYOrdenarFechasOt([ejemplo], { filtrarPor:'quincena', desde:'2026-10-01', hasta:'2026-10-01' }).length, 1);
  assert.equal(filtrarYOrdenarFechasOt([ejemplo], { filtrarPor:'apertura', desde:'2026-10-10', hasta:'2026-10-10' }).length, 1);
});
test('Ordena por ejecución o cierre, ascendente o descendente, sin mutar la lista', () => {
  const otro=registro(1862,'2026-10-16','2026-10-26T17:00:00Z');
  const filas=[ejemplo,otro];
  assert.deepEqual(ids(filtrarYOrdenarFechasOt(filas)),[1862,1852]);
  assert.deepEqual(ids(filtrarYOrdenarFechasOt(filas,{ordenarPor:'cierre'})),[1852,1862]);
  assert.deepEqual(ids(filtrarYOrdenarFechasOt(filas,{sentido:'asc'})),[1852,1862]);
  assert.deepEqual(ids(filas),[1852,1862]);
});
test('No inventa ejecuciones para abiertas o anuladas ni hereda fechas de su sustituta', () => {
  for (const estado of ['ABIERTA','ANULADA']) assert.equal(fechaEjecucionOt(registro(1,'2026-10-13',null,estado).orden),null);
  assert.equal(fechaEjecucionOt({estado:'CERRADA',visita:{fecha_ejecucion:null}},{fecha_ejecucion:'2026-10-13'}),null);
  assert.equal(fechaEjecucionOt({estado:'CERRADA'},{fecha_ejecucion:'2026-10-13'}),'2026-10-13');
});
test('Sin rango conserva abiertas y canceladas; con rango exige la fecha seleccionada', () => {
  const abierta=registro(9,null,null,'ABIERTA');
  const cancelada={visita:{id:8,estado:'CANCELADO',quincena_efectiva:'2026-10-01'}};
  const filas=[abierta,cancelada,ejemplo];
  assert.equal(filtrarYOrdenarFechasOt(filas).length,3);
  assert.equal(filtrarYOrdenarFechasOt(filas,{desde:'2026-10-01',hasta:'2026-10-31'}).length,1);
  assert.equal(filtrarYOrdenarFechasOt(filas,{filtrarPor:'quincena',desde:'2026-10-01',hasta:'2026-10-01'}).length,3);
  assert.equal(filtrarYOrdenarFechasOt(filas,{sentido:'asc'})[0].orden.id,1852);
});
test('Rechaza rangos invertidos y fechas imposibles; no usa el cierre como ejecución faltante', () => {
  assert.equal(diaPeru('2026-02-30'),null);
  assert.equal(fechaVisibleOt('fecha inválida'),'—');
  assert.deepEqual(filtrarYOrdenarFechasOt([ejemplo],{desde:'2026-10-28',hasta:'2026-10-01'}),[]);
  assert.deepEqual(filtrarYOrdenarFechasOt([ejemplo],{desde:'2026-02-30'}),[]);
  assert.equal(fechaEjecucionOt(registro(1,null,'2026-10-27T12:00:00Z').orden),null);
});
