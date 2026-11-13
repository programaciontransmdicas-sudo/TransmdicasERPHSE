import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let consulta;
const datos = { fecha_negocio:'2026-11-12', unidades:[{placa:'ABC123',estado:'POR VENCER'}], ordenes:[
  { id:9, placa:'ABC123', fecha:'2026-11-11', fecha_cierre:'2026-11-12', hora:'10:30', resultado:'EJECUTADO_PARCIAL', equipos:[
    {tipo:'CAMARAS',estado:'COMPLETADO'}, {tipo:'GPS',estado:'NO_APLICA'}] }
] };
mock.module('../src/modules/stats/mantenimiento.js', {namedExports:{leerIndicadoresMantenimiento: async filtros => { consulta=filtros; return datos; }}});
mock.module('../src/modules/publico/repository.js', {namedExports:{
  obtenerTrabajosTI:async()=>[], obtenerUltimaInspeccionPublica:async()=>({img_tablet:'old.jpg'}), obtenerUltimoIncidentePublico:async()=>null
}});
mock.module('../src/modules/publico/service.js', {namedExports:{
  normalizarPlacaPublica:s=>s.replace('-', ''), construirUrlImagen:(_req,x)=>x ? `/uploads/${x}` : null
}});
const { consultarUnidadPublica, obtenerStatsPublicos } = await import('../src/modules/publico/controller.js');
const respuesta = () => ({ codigo:200, status(c){this.codigo=c;return this;}, json(d){this.datos=d;return this;} });
test('La consulta pública usa resultados de mantenimiento y etiqueta fotos históricas', async () => {
  const r=respuesta(); await consultarUnidadPublica({params:{placa:'ABC-123'}},r);
  assert.equal(r.codigo,200); assert.equal(consulta.placa,'ABC123');
  assert.equal(r.datos.estado_general,'POR VENCER'); assert.equal(r.datos.camaras,'COMPLETADO');
  assert.equal(r.datos.radio,'Sin registro'); assert.equal(r.datos.fotos[0].tipo,'Inspección histórica · Tablet');
  assert.equal(r.datos.timeline[0].estado,'EJECUTADO_PARCIAL');
});
test('La actividad pública usa las OT, sin publicar identificadores internos de fotos', async () => {
  const r=respuesta(); await obtenerStatsPublicos({},r);
  assert.equal(r.codigo,200); assert.equal(r.datos.ticker[0].estado,'EJECUTADO_PARCIAL');
  assert.equal(JSON.stringify(r.datos).includes('old.jpg'),false);
});
