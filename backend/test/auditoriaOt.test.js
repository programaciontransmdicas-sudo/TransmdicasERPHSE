import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
let consultas, ordenExiste, fallo;
mock.module('../src/config/database.js', { namedExports: { pool: {
  query: async (sql, valores) => {
    consultas.push({ sql, valores });
    if (fallo) throw new Error('Detalle interno que no debe publicarse');
    return { rows: [{ total: 1, movimientos: [{ id: 7, accion: 'Cerró la orden' }] }] };
  }
} } });
mock.module('../src/modules/programas/programacion/ordenes/repository.js', { namedExports: {
  obtenerOrdenPorId: async (programa, visita, ot) => ordenExiste && programa === 1 && visita === 20 && ot === 10 ? { id: 10 } : null
} });
const { filtrosAuditoria, listarAuditoriaOrden } = await import('../src/modules/programas/programacion/ordenes/auditoria.js');
beforeEach(() => { consultas = []; ordenExiste = true; fallo = false; });
const request = extra => ({ user: { id: 6, rol: 'admin' }, params: { programaId: '1', programacionId: '20', otId: '10' }, query: {}, ...extra });
const response = () => ({ codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(cuerpo) { this.cuerpo = cuerpo; return this; } });
test('normaliza filtros válidos', () => {
  assert.deepEqual(filtrosAuditoria({ busqueda: ' foto ', desde: '2026-10-01', hasta: '2026-10-10', limite: '50', desplazamiento: '25' }), { busqueda: 'foto', desde: '2026-10-01', hasta: '2026-10-10', limite: 50, desplazamiento: 25 });
});
test('rechaza fechas y paginación inválidas', () => {
  for (const query of [{ limite: '0' }, { limite: '101' }, { limite: '1.5' }, { desplazamiento: '-1' }, { desplazamiento: '1000001' }, { busqueda: [] }, { desde: '2026-02-30' }, { desde: '2026-10-11', hasta: '2026-10-10' }]) assert.throws(() => filtrosAuditoria(query));
});
test('requiere sesión', async () => {
  const res = response(); await listarAuditoriaOrden(request({ user: null }), res);
  assert.equal(res.codigo, 401); assert.equal(consultas.length, 0);
});
test('rechaza orden ajena a la jerarquía solicitada', async () => {
  ordenExiste = false;
  const res = response(); await listarAuditoriaOrden(request(), res);
  assert.equal(res.codigo, 404); assert.equal(consultas.length, 0);
});
test('envía búsqueda mediante parámetros y devuelve página', async () => {
  const res = response(); await listarAuditoriaOrden(request({ query: { busqueda: "' OR TRUE --" } }), res);
  assert.equal(res.codigo, 200); assert.equal(res.cuerpo.total, 1);
  assert.deepEqual(consultas[0].valores, [10, 20, "' OR TRUE --", null, null, 25, 0]);
});
test('oculta detalles internos de errores', async () => {
  fallo = true;
  const res = response(); await listarAuditoriaOrden(request(), res);
  assert.equal(res.codigo, 500); assert.equal(res.cuerpo.error, 'No se pudieron consultar los movimientos de la orden');
});


test('TI y supervisor no pueden consultar auditoría, incluso con IDs válidos', async () => {
  for (const rol of ['ti', 'supervisor', '', 'auditor']) {
    const res = response();
    await listarAuditoriaOrden(request({ user: { id: 6, rol } }), res);
    assert.equal(res.codigo, 403);
    assert.equal(consultas.length, 0);
  }
});

test('El alias administrador conserva acceso', async () => {
  const res = response();
  await listarAuditoriaOrden(request({ user: { id: 6, rol: ' Administrador ' } }), res);
  assert.equal(res.codigo, 200);
});
