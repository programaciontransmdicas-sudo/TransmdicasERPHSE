import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
process.env.JWT_SECRET = 'solo_pruebas_sin_validez_real_'.repeat(4);
let consultas = [], consultar = async () => ({ rows: [] });
mock.module('../src/config/database.js', { namedExports: { pool: { query: async (sql, params = []) => { consultas.push({ sql, params }); return consultar(sql, params); } } } });
mock.module('../src/services/auditService.js', { namedExports: { logAction: async () => {} } });
mock.module('../src/services/cloudinaryService.js', { namedExports: { uploadToCloudinary: async () => 'https://example.invalid/evidencia.png', deleteFromCloudinary: async () => {} } });
mock.module('../src/modules/notificaciones/repository.js', { namedExports: { crearNotificacionUsuario: async () => {}, crearNotificacionesPorRoles: async () => {} } });
const personal = await import('../src/modules/personal/controller.js');
const flota = await import('../src/modules/flota/controller.js');
const { validarDatosPersonal } = await import('../src/modules/personal/service.js');
const { createSupportTicket } = await import('../src/modules/tickets/controller.js');
const { formatearPlaca } = await import('../../frontEnd/src/utils/formatos.js');
const { estadoVisual } = await import('../../frontEnd/src/components/tiPr01/dominio.js');
const res = () => ({ codigo: 200, datos: null, status(codigo) { this.codigo = codigo; return this; }, json(datos) { this.datos = datos; return this; } });
const req = (rol, body = {}, params = {}) => ({ user: { id: 8, rol }, body, params });
const relacion = { id: 17, cliente: 'REPSOL', operacion: 'QUELLAVECO' };
for (const [tipo, editar, params, campo] of [['personal', personal.editarPersonal, { id: '5' }, 'dni'], ['flota', flota.editarVehiculo, { placa: 'V0J700' }, 'marca_tracto']]) {
  test(`TI no modifica ${campo} ni campos ocultos en ${tipo}`, async () => {
    consultas = []; const r = res(); await editar(req('ti', { cliente_operacion_id: 17, [campo]: 'ALTERADO' }, params), r);
    assert.equal(r.codigo, 403); assert.equal(consultas.length, 0);
  });
  test(`TI actualiza únicamente la asignación validada de ${tipo}`, async () => {
    consultas = []; consultar = async sql => {
      if (sql.includes('FROM cliente_operaciones')) return { rows: [relacion] };
      if (sql.startsWith('SELECT *')) return { rows: [{ placa: 'V0J700' }] };
      if (sql.includes('UPDATE')) return { rows: [{ id: 5, placa: 'V0J700', ...relacion }] };
      return { rows: [] };
    };
    const r = res(); await editar(req('ti', { cliente_operacion_id: 17 }, params), r); assert.equal(r.codigo, 200);
    const update = consultas.find(q => q.sql.includes('UPDATE')); assert.ok(update); assert.match(update.sql, /cliente_operacion_id =/);
    assert.doesNotMatch(update.sql, /SET\s+(dni|nombre_completo|marca_tracto|estado|activo)\s*=/);
  });
}
test('DELETE de personal bloqueado para TI y admin; no borra historial', async () => {
  consultas = []; for (const rol of ['ti', 'admin']) { const r = res(); await personal.borrarPersonal(req(rol, {}, { id: '5' }), r); assert.equal(r.codigo, 405); } assert.equal(consultas.length, 0);
});
test('TI no puede borrar una unidad ni reactivarla', async () => {
  consultas = []; const r = res(); await flota.borrarVehiculo(req('ti', {}, { placa: 'V0J700' }), r); assert.equal(r.codigo, 403);
  const activar = res(); await flota.cambiarEstadoVehiculo(req('ti', { activo: true }, { placa: 'V0J700' }), activar); assert.equal(activar.codigo, 403); assert.equal(consultas.length, 0);
});
test('La baja de TI actualiza el estado sin ejecutar DELETE', async () => {
  consultas = []; consultar = async () => ({ rows: [{ id: 5, estado: 'Inactivo', placa: 'V0J700', activo: false }] });
  for (const [accion, body, params] of [[personal.cambiarEstadoPersonal, { estado: 'Inactivo' }, { id: '5' }], [flota.cambiarEstadoVehiculo, { activo: false }, { placa: 'V0J700' }]]) { const r = res(); await accion(req('ti', body, params), r); assert.equal(r.codigo, 200); }
  assert.ok(consultas.every(q => q.sql.includes('UPDATE') && !q.sql.includes('DELETE')));
});
test('TI y supervisor filtran activos; admin puede ver todos', async () => {
  consultar = async () => ({ rows: [] }); consultas = []; for (const rol of ['ti', 'supervisor', 'admin']) await personal.listarPersonal(req(rol), res());
  assert.deepEqual(consultas.map(q => q.params[0]), [false, false, true]); assert.ok(consultas.every(q => q.sql.includes("LOWER(BTRIM(estado)) = 'activo'")));
});
test('Relación inexistente se rechaza sin actualizar la persona', async () => {
  consultas = []; consultar = async () => ({ rows: [] }); const r = res(); await personal.editarPersonal(req('ti', { cliente_operacion_id: 999 }, { id: '5' }), r);
  assert.equal(r.codigo, 400); assert.ok(consultas.every(q => !q.sql.includes('UPDATE')));
});
test('Nombre exige separación explícita y normaliza espacios y coma', () => {
  assert.equal(validarDatosPersonal({ nombre_completo: '  Pérez   Cruz , Juan  Luis ', dni: '00000001' }).nombre_completo, 'PÉREZ CRUZ, JUAN LUIS');
  assert.throws(() => validarDatosPersonal({ nombre_completo: 'JORGE JUAN PFOCCOLATA ANCALLA', dni: '00000001' }), /APELLIDOS, NOMBRES/);
  assert.deepEqual(validarDatosPersonal({ cliente_operacion_id: 17 }, true), { cliente_operacion_id: 17 });
});
test('Ticket con placa formateada usa clave real y guarda llegada y persona', async () => {
  consultas = []; consultar = async sql => {
    if (sql.includes('u.rol')) return { rows: [{ rol: 'admin', estado: 'activo', persona_id: 5 }] };
    if (sql.includes('FROM vehiculos')) return { rows: [{ placa: 'V0J700', cliente_operacion_id: 17 }] };
    if (sql.includes('FROM personal')) return { rows: [{ id: 5, nombre_completo: 'PEREZ, JUAN' }] };
    if (sql.includes('INSERT INTO tickets_unidades')) return { rows: [{ id: 100 }] };
    throw new Error('Consulta inesperada');
  };
  const r = res(); await createSupportTicket(req('admin', { placa: 'V0J-700', persona_id: 5, tipo_solicitud: 'Soporte Técnico', implemento: 'Tablet', descripcion: 'Pantalla sin respuesta', fecha_llegada_unidad: '2026-10-16', hora_llegada_unidad: '14:30' }), r);
  assert.equal(r.codigo, 201); const insert = consultas.find(q => q.sql.includes('INSERT INTO tickets_unidades'));
  assert.deepEqual([insert.params[0],insert.params[1],insert.params[6],insert.params[7]], ['V0J700',5,'2026-10-16','14:30']);
});
test('Formato conserva ceros y letras y respeta identificadores especiales', () => {
  assert.equal(formatearPlaca('V0J700'), 'V0J-700'); assert.equal(formatearPlaca('VDO898'), 'VDO-898'); assert.equal(formatearPlaca('V0I-941'), 'V0I-941'); assert.equal(formatearPlaca('DEMO'), 'DEMO');
});
test('Reprogramación mantiene azul aunque la quincena haya vencido', () => {
  const v = { estado: 'REPROGRAMADO', quincena_efectiva: '2026-10-01' }; assert.equal(estadoVisual(v, '2026-10-16'), 'REPROGRAMADO'); assert.equal(estadoVisual({ ...v, estado: 'PROGRAMADO' }, '2026-10-16'), 'VENCIDA');
});
