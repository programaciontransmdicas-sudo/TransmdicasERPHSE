import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoVisual } from '../src/components/tiPr01/dominio.js';

test('Una visita reprogramada vence al terminar su nueva quincena', () => {
  const visita = { estado:'REPROGRAMADO', quincena_programada:'2026-10-16', quincena_efectiva:'2026-11-01' };
  assert.equal(estadoVisual(visita, '2026-11-15'), 'REPROGRAMADO');
  assert.equal(estadoVisual(visita, '2026-11-16'), 'VENCIDA');
});
test('Las visitas con resultado o canceladas no se marcan vencidas', () => {
  for (const estado of ['EJECUTADO', 'EJECUTADO_PARCIAL', 'NO_EJECUTADO', 'NO_APLICA', 'CANCELADO']) {
    assert.equal(estadoVisual({estado,quincena_efectiva:'2026-10-01'}, '2026-11-16'), estado);
  }
});
