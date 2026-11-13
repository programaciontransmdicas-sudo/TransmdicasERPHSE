import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'x'.repeat(64);
const { ROLE_MODULES, ROLE_PERMISSIONS } = await import('../src/config/permissions.js');
const { authorizeRequest } = await import('../src/middlewares/security.js');
const { tieneAccesoTotalFlota, requireAdmin } = await import('../src/middlewares/auth.js');
const { pool } = await import('../src/config/database.js');
const { contextoTicket } = await import('../src/modules/tickets/service.js');

const permisos = ROLE_PERMISSIONS.gerencia;
const autorizar = (metodo, ruta, rol = 'gerencia') => {
  const req = { method: metodo, path: ruta, user: { id: 1, rol, permisos: ROLE_PERMISSIONS[rol] } };
  const respuesta = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let siguiente = false;
  authorizeRequest(req, respuesta, () => { siguiente = true; });
  return { respuesta, siguiente };
};

test('Gerencia ve todos los módulos sin permisos de escritura', () => {
  for (const modulo of ROLE_MODULES) {
    assert.equal(permisos[modulo]?.ver, true, modulo);
    assert.equal(permisos[modulo]?.editar, false, modulo);
  }
  assert.equal(permisos.tickets.crear, false);
  assert.equal(permisos.tickets.gestionar, false);
});

test('Puede consultar las familias protegidas, incluidos usuarios y seguridad', () => {
  for (const ruta of ['/api/usuarios', '/api/personal', '/api/maestro', '/vehiculos', '/inspecciones', '/api/incidentes', '/api/incidentes_soporte', '/mantenimientos', '/api/entregas', '/entregas', '/api/reportes', '/reportes', '/stats', '/api/programas-mantenimiento/90', '/api/seguridad-patrimonial/resumen', '/api/notificaciones']) {
    const { siguiente, respuesta } = autorizar('GET', ruta);
    assert.equal(siguiente, true, `${ruta}: ${JSON.stringify(respuesta.body)}`);
  }
  assert.equal(tieneAccesoTotalFlota({ user: { rol: 'gerencia' } }), true);
});

test('Deniega escrituras en cada familia, aun con permiso de solo autenticación', () => {
  for (const ruta of ['/api/usuarios', '/api/personal', '/vehiculos', '/inspecciones', '/api/incidentes/10', '/mantenimientos', '/api/entregas', '/api/reportes', '/api/programas-mantenimiento/90', '/api/seguridad-patrimonial/registros/activos', '/api/notificaciones']) {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { siguiente, respuesta } = autorizar(metodo, ruta);
      assert.equal(siguiente, false, `${metodo} ${ruta}`);
      assert.equal(respuesta.statusCode, 403, `${metodo} ${ruta}`);
    }
  }
});

test('El administrador y el supervisor conservan sus permisos anteriores', () => {
  assert.equal(autorizar('POST', '/api/usuarios', 'admin').siguiente, true);
  assert.equal(autorizar('POST', '/api/incidentes_soporte', 'supervisor').siguiente, true);
  assert.equal(autorizar('POST', '/api/usuarios', 'supervisor').respuesta.statusCode, 403);
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } };
  let llamada = false;
  requireAdmin({ user: { rol: 'gerencia' } }, res, () => { llamada = true; });
  assert.equal(llamada, false);
  assert.equal(res.statusCode, 403);
});

test('El alcance de lectura de tickets de Gerencia incluye todas las operaciones', async () => {
  const anterior = pool.query;
  pool.query = async () => ({ rows: [{ rol: 'gerencia', estado: 'activo', persona_id: 8, nombre_solicitante: 'Gerencia' }] });
  try {
    const contexto = await contextoTicket({ user: { id: 1, clienteOperacionIds: [] } }, 'ver');
    assert.equal(contexto.accesoTotal, true);
    await assert.rejects(contextoTicket({ user: { id: 1 } }, 'gestionar'), /no tiene permiso/);
  } finally { pool.query = anterior; }
});
