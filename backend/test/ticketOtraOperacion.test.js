import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.JWT_SECRET = 'solo_pruebas_de_ticket_otra_operacion_'.repeat(3);
let guardados = [];
let rol = 'supervisor';
let activa = true;
mock.module('../src/config/database.js', { namedExports: { pool: { query: async (sql, params) => {
  if (sql.includes('u.rol')) return { rows: [{ rol, estado: 'activo', persona_id: 334 }] };
  if (sql.includes('FROM vehiculos v') && sql.includes('LIMIT 1')) {
    const permitido = params[1] === true || params[2]?.includes(17);
    return { rows: permitido && activa ? [{ placa: 'V0J700', cliente_operacion_id: 17 }] : [] };
  }
  if (sql.includes('FROM personal') && sql.includes('WHERE id')) return { rows: [{ id: 334, dni: '00000000', nombre_completo: 'SOLICITANTE DE PRUEBA' }] };
  if (sql.includes('INSERT INTO tickets_unidades')) {
    guardados.push(params);
    return { rows: [{ id: 99, placa: params[0] }] };
  }
  throw new Error('Consulta inesperada en la prueba: ' + sql.slice(0, 80));
} } } });
mock.module('../src/services/cloudinaryService.js', { namedExports: { uploadToCloudinary: async () => { throw new Error('No se debe subir una foto retirada'); }, deleteFromCloudinary: async () => {} } });
mock.module('../src/services/auditService.js', { namedExports: { logAction: async () => {} } });
mock.module('../src/modules/notificaciones/repository.js', { namedExports: { crearNotificacionUsuario: async () => {}, crearNotificacionesPorRoles: async () => {} } });
const { createSupportTicket } = await import('../src/modules/tickets/controller.js');
const respuesta = () => ({ codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(body) { this.body = body; return this; } });
const ejecutar = async ids => {
  const req = { method: 'POST', user: { id: 8, rol: 'supervisor', clienteOperacionIds: ids }, files: [],
    body: { placa: 'V0J700', tipo_solicitud: 'Soporte Técnico', implemento: 'Tablet', descripcion: 'Unidad prestada a otra operación', fecha_llegada_unidad: '2026-10-21', hora_llegada_unidad: '09:00' } };
  const res = respuesta();
  await createSupportTicket(req, res);
  return res;
};

test('POST real del controlador crea un ticket en la operación 17 con asignación a la 15', async () => {
  guardados = [];
  const res = await ejecutar([15]);
  assert.equal(res.codigo, 201, JSON.stringify(res.body));
  assert.equal(res.body.ticket.placa, 'V0J700');
  assert.equal(guardados.length, 1);
});

test('El mismo POST funciona sin asignaciones y sin fotografías seleccionadas', async () => {
  const res = await ejecutar([]);
  assert.equal(res.codigo, 201, JSON.stringify(res.body));
});

test('Una placa inexistente o inactiva sigue sin permitir crear el ticket', async () => {
  activa = false;
  const previos = guardados.length;
  try {
    const res = await ejecutar([]);
    assert.equal(res.codigo, 403);
    assert.equal(guardados.length, previos);
  } finally { activa = true; }
});

test('TI no adquiere permiso de creación de tickets al cambiar el alcance', async () => {
  rol = 'ti';
  const previos = guardados.length;
  try {
    const res = await ejecutar([]);
    assert.equal(res.codigo, 403);
    assert.equal(guardados.length, previos);
  } finally { rol = 'supervisor'; }
});
