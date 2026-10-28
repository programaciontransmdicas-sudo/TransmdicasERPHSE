import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
let consultas, falloDetalle, rol;
const client = { query: async (sql, params) => {
  consultas.push({ sql, params });
  if (sql.includes('INSERT INTO solicitudes_descarga_videos')) return { rows: [{ id: 20 }] };
  if (sql.includes('INSERT INTO solicitud_descarga_video_placas') && falloDetalle) throw new Error('Detalle inválido');
  return { rows: [] };
}, release: () => consultas.push({ sql: 'RELEASE' }) };
mock.module('../src/config/database.js', { namedExports: { pool: {
  connect: async () => client,
  query: async sql => {
    if (sql.includes('u.rol')) return { rows: [{ rol, estado: 'activo' }] };
    if (sql.includes('FROM vehiculos v')) return { rows: ['ABC123', 'XYZ789'].map(placa => ({ placa, cliente_operacion_id: 15, cliente: 'Cliente', operacion: 'Operación' })) };
    throw new Error('Consulta inesperada');
  }
} } });
mock.module('../src/services/cloudinaryService.js', { namedExports: { uploadToCloudinary: async () => {}, deleteFromCloudinary: async () => {} } });
mock.module('../src/services/auditService.js', { namedExports: { logAction: async () => {} } });
mock.module('../src/modules/notificaciones/repository.js', { namedExports: { crearNotificacionUsuario: async () => {}, crearNotificacionesPorRoles: async () => {} } });
const { normalizarPlacasSolicitudVideo } = await import('../src/modules/tickets/service.js');
const { insertarSolicitudDescargaVideos } = await import('../src/modules/tickets/repository.js');
const { crearSolicitudDescargaVideos } = await import('../src/modules/tickets/controller.js');
const detalle = (placa = 'ABC123', fecha = '2026-10-25', inicio = '08:00', fin = '09:00') => ({ placa,
  fecha_llegada_unidad: fecha, hora_llegada_unidad: '14:00', fecha_descarga: fecha, hora_inicio: inicio, hora_fin: fin });
const datos = () => ({ clienteOperacionId: 15, operacion: 'Operación', motivo: 'Revisión', solicitadoPor: 8,
  detallesPlacas: [detalle(), detalle('XYZ789', '2026-10-26', '10:00', '11:00')] });
const respuesta = () => ({ codigo: 200, status(n) { this.codigo=n; return this; }, json(d) { this.datos=d; return this; } });
const ejecutar = async placas => { const res=respuesta(); await crearSolicitudDescargaVideos({ user: { id: 8 }, body: { cliente_operacion_id:15, placas, motivo:'Revisión' } },res); return res; };
beforeEach(() => { consultas=[]; falloDetalle=false; rol='supervisor'; });
test('Cada placa conserva sus fechas y horas independientes', () => {
  const placas = datos().detallesPlacas;
  assert.deepEqual(normalizarPlacasSolicitudVideo({ placas }), placas);
});
test('El formato anterior con fechas comunes se expande por placa', () => {
  const antiguo={ ...detalle(), placas:['ABC123','XYZ789'] };
  assert.deepEqual(normalizarPlacasSolicitudVideo(antiguo), [detalle(),detalle('XYZ789')]);
});
test('Rechaza fechas imposibles, campos ausentes, placas repetidas y horarios inválidos', () => {
  for (const placas of [[], [null], [{}], [detalle(),detalle(' abc123 ')], [detalle('ABC123','2026-02-30')],
    [{...detalle(),hora_llegada_unidad:''}], [detalle('ABC123','2026-10-25','09:00','08:00')],
    [detalle('ABC123','2026-10-25','08:00','08:00')], [detalle('ABC123','2026-10-25','25:00','26:00')]]) {
    assert.throws(() => normalizarPlacasSolicitudVideo({ placas }), e=>e.status===400);
  }
});
test('El repositorio guarda el conjunto completo en una transacción y no presenta fecha común ficticia', async () => {
  const entrada=datos();const resultado=await insertarSolicitudDescargaVideos(entrada);
  assert.deepEqual(resultado.detalles_placas,entrada.detallesPlacas);
  const cabecera=consultas.find(q=>q.sql.includes('INSERT INTO solicitudes_descarga_videos'));
  assert.equal(cabecera.params[4],null); assert.equal(cabecera.params[5],null); assert.equal(cabecera.params[6],null);
  const hijos=consultas.find(q=>q.sql.includes('INSERT INTO solicitud_descarga_video_placas'));
  assert.deepEqual(JSON.parse(hijos.params[1]),entrada.detallesPlacas);
  assert.deepEqual(consultas.filter(q=>['BEGIN','COMMIT','ROLLBACK','RELEASE'].includes(q.sql)).map(q=>q.sql),['BEGIN','COMMIT','RELEASE']);
});
test('Un fallo en una placa revierte toda la solicitud', async () => {
  falloDetalle=true;await assert.rejects(insertarSolicitudDescargaVideos(datos()));
  assert.deepEqual(consultas.filter(q=>['BEGIN','COMMIT','ROLLBACK','RELEASE'].includes(q.sql)).map(q=>q.sql),['BEGIN','ROLLBACK','RELEASE']);
});
test('POST del supervisor guarda dos placas con fechas y horarios distintos', async () => {
  const res=await ejecutar(datos().detallesPlacas);assert.equal(res.codigo,201);
  assert.deepEqual(res.datos.solicitud.detalles_placas,datos().detallesPlacas);
});
test('No crea la solicitud si la segunda placa es inválida o inexistente', async () => {
  let res=await ejecutar([detalle(),detalle('XYZ789','2026-02-30')]);assert.equal(res.codigo,400);assert.equal(consultas.length,0);
  res=await ejecutar([detalle(),detalle('NOEXISTE')]);assert.equal(res.codigo,403);assert.equal(consultas.length,0);
});
test('TI sigue sin poder crear solicitudes', async () => {
  rol='ti';const res=await ejecutar(datos().detallesPlacas);assert.equal(res.codigo,403);assert.equal(consultas.length,0);
});
