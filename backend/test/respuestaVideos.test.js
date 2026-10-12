import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
let rol, llamadas, notificaciones, existe;
mock.module('../src/config/database.js', { namedExports: { pool: { query: async (sql, params) => {
  llamadas.push({ sql, params });
  if (sql.includes('u.rol')) return { rows: [{ rol, estado: 'activo', nombre_solicitante: 'Solicitante' }] };
  if (sql.includes('UPDATE solicitudes_descarga_videos')) return { rows: existe ? [{ id: 3, solicitado_por: 9, estado: params[0], enlaces_videos: JSON.parse(params[4] || '[]'), observaciones_atencion: params[5] }] : [] };
  return { rows: [] };
} } } });
mock.module('../src/services/cloudinaryService.js', { namedExports: { uploadToCloudinary: async () => {}, deleteFromCloudinary: async () => {} } });
mock.module('../src/services/auditService.js', { namedExports: { logAction: async () => {} } });
mock.module('../src/modules/notificaciones/repository.js', { namedExports: {
  crearNotificacionUsuario: async n => { notificaciones.push(n); }, crearNotificacionesPorRoles: async () => {}
} });
const { validarRespuestaSolicitudVideo } = await import('../src/modules/tickets/service.js');
const { cambiarEstadoSolicitudDescargaVideos } = await import('../src/modules/tickets/controller.js');
const respuesta = () => ({ statusCode: 200, status(n) { this.statusCode=n; return this; }, json(v) { this.body=v; return this; } });
const ejecutar = async body => { const res=respuesta(); await cambiarEstadoSolicitudDescargaVideos({ params: { id:'3' }, body, user: { id:6, clienteOperacionIds:[1] } },res); return res; };
beforeEach(() => { rol='ti'; llamadas=[]; notificaciones=[]; existe=true; });
test('Exige enlaces HTTP y rechaza protocolos ejecutables, credenciales y límites excedidos', () => {
  for (const enlaces_videos of [[], ['javascript:alert(1)'], ['https://user:pass@example.com'], ['texto'], Array(21).fill('https://example.com')]) {
    assert.throws(() => validarRespuestaSolicitudVideo({ enlaces_videos }), e=>e.status===400);
  }
  assert.throws(()=>validarRespuestaSolicitudVideo({ enlaces_videos:['https://example.com'], observaciones_atencion:'x'.repeat(4001) }));
  assert.deepEqual(validarRespuestaSolicitudVideo({ enlaces_videos:[' https://example.com/a ', 'https://example.com/a'], observaciones_atencion:' nota ' }),{ enlacesVideos:['https://example.com/a'],observacionesAtencion:'nota' });
});
test('Atendida sin respuesta devuelve 400 sin actualizar ni notificar',async()=>{
  const res=await ejecutar({estado:'Atendida'}); assert.equal(res.statusCode,400);
  assert.equal(llamadas.some(l=>l.sql.includes('UPDATE')),false); assert.equal(notificaciones.length,0);
});
test('TI y admin entregan enlaces y se notifica al solicitante',async()=>{
  for(const nuevoRol of ['ti','admin']){rol=nuevoRol;const res=await ejecutar({estado:'Atendida',enlaces_videos:['https://example.com/video'],observaciones_atencion:'Completo'});
   assert.equal(res.statusCode,200); const consulta=llamadas.findLast(l=>l.sql.includes('UPDATE'));
   assert.equal(consulta.params[6],6); assert.deepEqual(JSON.parse(consulta.params[4]),['https://example.com/video']);
   assert.equal(notificaciones.at(-1).usuarioId,9); assert.equal(notificaciones.at(-1).titulo,'Videos disponibles');
  }
});
test('Otros estados no exigen enlaces',async()=>{const res=await ejecutar({estado:'En proceso'}); assert.equal(res.statusCode,200);});
test('Supervisor no puede atender',async()=>{rol='supervisor';const res=await ejecutar({estado:'Atendida',enlaces_videos:['https://example.com']});assert.equal(res.statusCode,403);assert.equal(llamadas.some(l=>l.sql.includes('UPDATE')),false);});
test('Solicitud inexistente devuelve 404 sin notificar',async()=>{existe=false;const res=await ejecutar({estado:'Atendida',enlaces_videos:['https://example.com']});assert.equal(res.statusCode,404);assert.equal(notificaciones.length,0);});
