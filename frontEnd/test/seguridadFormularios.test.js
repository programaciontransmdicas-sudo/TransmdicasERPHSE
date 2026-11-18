import test from 'node:test';
import assert from 'node:assert/strict';
import { nuevoId, validarBienes, separarSeries, recogerRetorno, devueltos, seriesDevueltas } from '../src/components/seguridad/bienesFormulario.js';

test('los identificadores de formulario y reintento son UUID v4 distintos', () => {
  const ids = Array.from({ length: 50 }, nuevoId);
  assert.equal(new Set(ids).size, 50);
  for (const id of ids) assert.match(id, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
});
test('permite registrar cien unidades con una serie por unidad', () => {
  const series = Array.from({ length: 100 }, (_, i) => `SERIE-${i + 1}`).join('\n');
  const bienes = validarBienes([{ id: nuevoId(), descripcion: ' Radios ', cantidad: '100', seriesTexto: series }]);
  assert.equal(bienes[0].descripcion, 'Radios'); assert.equal(bienes[0].cantidad, 100); assert.equal(bienes[0].series.length, 100);
  assert.deepEqual(separarSeries(' A\nB;C\tD\r\n'), ['A', 'B', 'C', 'D']);
});
test('rechaza cantidades inválidas y series repetidas entre bienes', () => {
  assert.throws(() => validarBienes([{ id: nuevoId(), descripcion: 'Radio', cantidad: 2, seriesTexto: 'A' }]), /serie por unidad/);
  assert.throws(() => validarBienes([{ id: nuevoId(), descripcion: 'Radio', cantidad: 0, seriesTexto: '' }]), /cantidades/);
  assert.throws(() => validarBienes([{ id: nuevoId(), descripcion: 'Radio', cantidad: 1, seriesTexto: 'ABC' }, { id: nuevoId(), descripcion: 'Otro', cantidad: 1, seriesTexto: 'abc' }]), /repetida/);
});
test('calcula saldos y excluye series ya retornadas', () => {
  const radio = { id: 'radio', cantidad: 3, series: ['A', 'B', 'C'] }, caja = { id: 'caja', cantidad: 5, series: [] };
  const registro = { bienes: [radio, caja], retornos: [{ bienes: [{ bienId: 'radio', cantidad: 1, series: ['A'] }, { bienId: 'caja', cantidad: 2, series: [] }] }] };
  assert.equal(devueltos(registro, radio), 1); assert.deepEqual([...seriesDevueltas(registro, radio)], ['A']);
  assert.deepEqual(recogerRetorno(registro, { radio: { series: ['B'] }, caja: { cantidad: '3' } }), { radio: { series: ['B'] }, caja: { cantidad: 3 } });
  assert.throws(() => recogerRetorno(registro, { radio: { series: ['A'] } }), /series/);
  assert.throws(() => recogerRetorno(registro, { caja: { cantidad: 4 } }), /saldo/);
  assert.throws(() => recogerRetorno(registro, {}), /al menos/);
});
