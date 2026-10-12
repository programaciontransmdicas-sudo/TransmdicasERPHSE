import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.JWT_SECRET = 'clave_de_prueba_sin_validez_real_'.repeat(3);
let consulta;
let filas = { total: 0, visitas: [] };
mock.module('../src/config/database.js', {
  namedExports: { pool: { query: async (sql, parametros) => {
    consulta = { sql, parametros };
    return { rows: [filas] };
  } } }
});
const { authorizeRequest } = await import('../src/middlewares/security.js');
const { ROLE_PERMISSIONS } = await import('../src/config/permissions.js');
const { validarConsultaHistorial, listarHistorialSupervisor } = await import('../src/modules/programas/historialSupervisor.js');
const supervisor = { id: 8, rol: 'supervisor', clienteOperacionIds: [15, 19], permisos: ROLE_PERMISSIONS.supervisor };
const respuesta = () => ({
  codigo: 200, datos: null, cabeceras: {},
  status(codigo) { this.codigo = codigo; return this; },
  json(datos) { this.datos = datos; return this; },
  setHeader(nombre, valor) { this.cabeceras[nombre] = valor; }
});

const rutasRestringidas = [
  '/mantenimientos', '/mantenimientos/V0R-739',
  '/api/programas-mantenimiento', '/api/programas-mantenimiento/1',
  '/api/programas-mantenimiento/tecnicos',
  '/api/programas-mantenimiento/1/unidades',
  '/api/programas-mantenimiento/1/frecuencias',
  '/api/programas-mantenimiento/1/programacion',
  '/api/programas-mantenimiento/1/programacion/1/ordenes-trabajo/1',
  '/api/programas-mantenimiento/1/programacion/1/ordenes-trabajo/1/evidencias',
  '/api/programas-mantenimiento/1/programacion/1/ordenes-trabajo/1/auditoria'
];

test('Supervisor solo accede al GET del historial; bloquea legacy, detalles y escrituras', () => {
  for (const path of rutasRestringidas) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = respuesta(); let siguiente = false;
      authorizeRequest({ path, method, user: supervisor }, res, () => { siguiente = true; });
      assert.equal(siguiente, false, `${method} ${path}`);
      assert.equal(res.codigo, 403);
    }
  }
  for (const method of ['HEAD', 'POST', 'PATCH', 'DELETE']) {
    const res = respuesta();
    authorizeRequest({ path: '/api/programas-mantenimiento/historial-supervisor', method, user: supervisor }, res, () => assert.fail());
    assert.equal(res.codigo, 403);
  }
  for (const path of ['/api/programas-mantenimiento/historial-supervisor', '/api/programas-mantenimiento/historial-supervisor/']) {
    let siguiente = false;
    authorizeRequest({ path, method: 'GET', user: supervisor }, respuesta(), () => { siguiente = true; });
    assert.equal(siguiente, true);
  }
});

test('Admin y TI mantienen lectura y edición de mantenimiento', () => {
  for (const rol of ['admin', 'ti']) {
    for (const path of rutasRestringidas) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        let siguiente = false;
        authorizeRequest({ path, method, user: { rol, permisos: ROLE_PERMISSIONS[rol] } }, respuesta(), () => { siguiente = true; });
        assert.equal(siguiente, true, `${rol}: ${method} ${path}`);
      }
    }
  }
});

test('No se permite consultar sin asignaciones ni imponer el alcance en filtros', () => {
  assert.throws(() => validarConsultaHistorial({ ...supervisor, clienteOperacionIds: [] }), e => e.status === 403);
  assert.throws(() => validarConsultaHistorial({ ...supervisor, rol: 'ti' }), e => e.status === 403);
  for (const query of [{ clienteOperacionIds: '99' }, { usuario_id: '99' }, { programa_id: '1' }, { limite: '0' }, { limite: '1001' }, { desde: '2026-02-30' }, { desde: '2026-10-16', hasta: '2026-10-01' }]) {
    assert.throws(() => validarConsultaHistorial(supervisor, query), e => e.status === 400);
  }
});

test('El controlador usa el usuario autenticado y devuelve historial vacío sin datos ajenos', async () => {
  filas = { total: 0, visitas: [] };
  const res = respuesta();
  await listarHistorialSupervisor({ user: supervisor, query: { desde: '2026-10-01' } }, res);
  assert.equal(res.codigo, 200);
  assert.deepEqual(consulta.parametros, [8, [15, 19], '2026-10-01', null, 500, 0]);
  assert.deepEqual(res.datos.visitas, []);
  assert.deepEqual(res.datos.ordenes, []);
  assert.equal(res.cabeceras['Cache-Control'], 'no-store');
});

test('Una petición inválida se rechaza antes de consultar la base', async () => {
  consulta = null;
  const res = respuesta();
  await listarHistorialSupervisor({ user: supervisor, query: { cliente_id: '2' } }, res);
  assert.equal(res.codigo, 400);
  assert.equal(consulta, null);
});

test('La respuesta agrupa órdenes sin perder el total de visitas de la paginación', async () => {
  filas = { total: 4, visitas: [{ id: 1, unidad: { placa: 'ABC-123' }, ordenes: [{ id: 9, programacion_id: 1 }] }] };
  const res = respuesta();
  await listarHistorialSupervisor({ user: supervisor, query: {} }, res);
  assert.equal(res.datos.total, 4);
  assert.equal(res.datos.visitas[0].ordenes_trabajo.total, 1);
  assert.equal('ordenes' in res.datos.visitas[0], false);
  assert.equal(res.datos.ordenes[0].id, 9);
});
