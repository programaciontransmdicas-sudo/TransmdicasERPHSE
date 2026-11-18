import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exigirPuedeReemplazarEvidencia } from '../src/modules/programas/programacion/ordenes/service.js';

test('un administrador autenticado puede reemplazar fotografías en una OT cerrada', () => {
  for (const rol of ['admin', 'administrador']) {
    assert.doesNotThrow(() => exigirPuedeReemplazarEvidencia({ estado: 'CERRADA' }, { id: 1, rol }));
  }
});

test('TI, gerencia y usuarios sin identificación no pueden reemplazar fotografías', () => {
  for (const usuario of [{ id: 2, rol: 'ti' }, { id: 3, rol: 'gerencia' }, { rol: 'admin' }]) {
    assert.throws(() => exigirPuedeReemplazarEvidencia({ estado: 'CERRADA' }, usuario), e => e.status === 403 || e.statusCode === 403);
  }
});

test('el administrador no usa este flujo en OT abiertas o anuladas', () => {
  for (const estado of ['ABIERTA', 'ANULADA']) {
    assert.throws(() => exigirPuedeReemplazarEvidencia({ estado }, { id: 1, rol: 'admin' }), e => e.status === 409 || e.statusCode === 409);
  }
});
