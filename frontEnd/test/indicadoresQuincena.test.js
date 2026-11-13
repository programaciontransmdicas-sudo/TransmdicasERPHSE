import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quincenaActual, estadoEnQuincena } from '../src/utils/indicadoresQuincena.js';

test('La quincena actual cambia los días 1 y 16', () => {
  assert.equal(quincenaActual('2026-11-15'), '2026-11-01');
  assert.equal(quincenaActual('2026-11-16'), '2026-11-16');
  assert.equal(quincenaActual(null), null);
});

test('El estado corresponde a la quincena efectiva y al plazo real', () => {
  const visitas = [{ estado: 'REPROGRAMADO', quincena_efectiva: '2026-11-16' }];
  assert.equal(estadoEnQuincena(visitas, '2026-11-01', '2026-11-20'), 'SIN INFORMACIÓN');
  assert.equal(estadoEnQuincena(visitas, '2026-11-16', '2026-12-01'), 'VENCIDA');
  assert.equal(estadoEnQuincena(visitas, '2026-11-16', '2026-11-16'), 'AL DÍA');
  assert.equal(estadoEnQuincena(visitas, '2026-11-16', '2026-11-24'), 'POR VENCER');
});

test('Los resultados y visitas canceladas mantienen su significado', () => {
  const estado = s => estadoEnQuincena([{ estado: s, quincena_efectiva: '2026-11-01' }], '2026-11-01', '2026-12-01');
  assert.equal(estado('EJECUTADO'), 'AL DÍA');
  assert.equal(estado('EJECUTADO_PARCIAL'), 'PARCIAL');
  assert.equal(estado('NO_EJECUTADO'), 'NO EJECUTADO');
  assert.equal(estado('NO_APLICA'), 'NO APLICA');
  assert.equal(estado('CANCELADO'), 'SIN INFORMACIÓN');
});
