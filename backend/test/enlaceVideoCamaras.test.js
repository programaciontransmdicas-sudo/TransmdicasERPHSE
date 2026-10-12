import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepararActualizacionDetalle, normalizarEnlaceVideo, validarEnlaceVideoDelEquipo } from '../src/modules/programas/programacion/ordenes/service.js';
test('Enlace opcional: retirar no borra otros campos',()=>{
 assert.equal(normalizarEnlaceVideo(null),null);assert.equal(normalizarEnlaceVideo('  '),null);
 const p=prepararActualizacionDetalle({enlace_video:null});assert.deepEqual(p.campos,['enlace_video']);assert.equal(p.data.enlace_video,null);assert.equal(p.data.observaciones,undefined);
});
test('Acepta HTTP/HTTPS completos y recorta espacios',()=>{
 assert.equal(normalizarEnlaceVideo(' https://example.com/video?id=1 '),'https://example.com/video?id=1');assert.equal(normalizarEnlaceVideo('http://example.com/video'),'http://example.com/video');
});
test('Rechaza protocolos ejecutables, credenciales, enlaces incompletos y valores inválidos',()=>{
 for(const v of ['javascript:alert(1)','data:text/html,test','ftp://example.com/video','https://user:pass@example.com/video','example.com/video',7,[],'https://example.com/'+'x'.repeat(2048)])assert.throws(()=>normalizarEnlaceVideo(v),e=>e.status===400);
});
test('Solo Cámaras admite el campo',()=>{
 assert.doesNotThrow(()=>validarEnlaceVideoDelEquipo({tipo_equipo:'CAMARAS'},['enlace_video']));
 for(const tipo_equipo of ['COPILOTO','RADIO_BASE','GPS','ADAS','DVR']){
 assert.throws(()=>validarEnlaceVideoDelEquipo({tipo_equipo},['enlace_video']),e=>e.status===400);
 assert.doesNotThrow(()=>validarEnlaceVideoDelEquipo({tipo_equipo},['observaciones']));
 }
});
