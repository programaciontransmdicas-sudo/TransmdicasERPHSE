import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.JWT_SECRET = 'clave_exclusiva_para_pruebas_locales_'.repeat(3);
let rolBase = 'supervisor';
let estadoBase = 'activo';
let ultimaConsulta;

mock.module('../src/config/database.js', {
  namedExports: { pool: { query: async (sql, parametros) => {
    ultimaConsulta = { sql, parametros };
    if (sql.includes('u.rol')) {
      return { rows: [{ rol: rolBase, estado: estadoBase, nombre_solicitante: 'Supervisor' }] };
    }
    return { rows: [] };
  } } }
});

const auth = await import('../src/middlewares/auth.js');
const { contextoTicket } = await import('../src/modules/tickets/service.js');
const { requireAdmin } = auth;
const { obtenerTickets } = await import('../src/modules/tickets/repository.js');
const { obtenerHistorial } = await import('../src/modules/inspecciones/repository.js');
const { ROLE_PERMISSIONS } = await import('../src/config/permissions.js');

const req = (method, ids = []) => ({
  method,
  user: { id: 8, rol: 'supervisor', clienteOperacionIds: ids,
    permisos: ROLE_PERMISSIONS.supervisor }
});

test('Consulta global GET y HEAD incluso sin clientes asignados', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const ids of [[], [15]]) {
      const solicitud = req(method, ids);
      assert.equal(auth.tieneAccesoTotalFlota(solicitud), true);
      assert.equal(auth.obtenerClienteOperacionIds(solicitud), null);
      assert.equal(auth.puedeAccederClienteOperacion(solicitud, 17), true);
    }
  }
});

test('Las escrituras conservan el alcance asignado y no reciben consulta global', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', undefined]) {
    const solicitud = req(method, [15]);
    assert.equal(auth.tieneAccesoTotalFlota(solicitud), false);
    assert.deepEqual(auth.obtenerClienteOperacionIds(solicitud), [15]);
    assert.equal(auth.puedeAccederClienteOperacion(solicitud, 17), false);
    assert.equal(auth.puedeAccederClienteOperacion(solicitud, 15), true);
  }
});

test('Admin, administrador y TI conservan su alcance; otros roles no lo obtienen', () => {
  for (const rol of ['admin', 'administrador', 'ti']) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      assert.equal(auth.tieneAccesoTotalFlota({ method, user: { rol } }), true);
    }
  }
  for (const rol of ['', 'auditor', 'publico']) {
    assert.equal(auth.tieneAccesoTotalFlota({ method: 'GET', user: { rol } }), false);
  }
});

test('Tickets y opciones de videos permiten consulta sin asignaciones', async () => {
  for (const accion of ['ver', 'crear']) {
    const contexto = await contextoTicket(req('GET'), accion);
    assert.equal(contexto.accesoTotal, true);
    assert.deepEqual(contexto.clienteOperacionIds, []);
  }
});

test('Crear tickets mantiene las asignaciones y gestionar sigue prohibido', async () => {
  const contexto = await contextoTicket(req('POST', [15]), 'crear');
  assert.equal(contexto.accesoTotal, false);
  assert.deepEqual(contexto.clienteOperacionIds, [15]);
  await assert.rejects(contextoTicket(req('POST'), 'crear'), error => error.status === 403);
  for (const accion of ['editar', 'gestionar']) {
    await assert.rejects(contextoTicket(req('GET'), accion), error => error.status === 403);
  }
});

test('Un rol falso en la petición no suplanta el rol leído en la base', async () => {
  const solicitud = req('GET');
  solicitud.user.rol = 'admin';
  const contexto = await contextoTicket(solicitud);
  assert.equal(contexto.rol, 'supervisor');
  await assert.rejects(contextoTicket(solicitud, 'gestionar'), error => error.status === 403);
});

test('La cuenta inactiva no obtiene acceso global', async () => {
  estadoBase = 'inactivo';
  try {
    await assert.rejects(contextoTicket(req('GET')), error => error.status === 403);
  } finally { estadoBase = 'activo'; }
});

test('Los repositorios reciben consulta global para tickets e inspecciones', async () => {
  const solicitud = req('GET', [15]);
  const contexto = await contextoTicket(solicitud);
  await obtenerTickets(contexto);
  assert.deepEqual(ultimaConsulta.parametros, [true, []]);
  await obtenerHistorial({ placa: 'V0J700',
    accesoTotal: auth.tieneAccesoTotalFlota(solicitud),
    clienteOperacionIds: auth.obtenerClienteOperacionIds(solicitud) });
  assert.deepEqual(ultimaConsulta.parametros, ['V0J700', true, []]);
});

test('Consultar todas las placas no concede administración', () => {
  const res = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json() {} };
  requireAdmin(req('GET'), res, () => assert.fail('Supervisor no debe convertirse en admin'));
  assert.equal(res.codigo, 403);
});
