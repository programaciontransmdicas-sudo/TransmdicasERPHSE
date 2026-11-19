import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrarSoporte} from '../src/components/reportesSoporte/filtrarSoporte.js';
const vacios={texto:'',estado:'',cliente:'',operacion:'',categoria:'',desde:'',hasta:''};
test('busca resoluciones, combina filtros y usa fechas de Perú',()=>{
 const filas=[{id:1,estado:'Resuelto',resolucion_desc:'Cámara reemplazada',fecha_creacion:'2026-11-19T02:00:00Z',cliente:'REPSOL',operacion:'LAS BAMBAS'}, {id:2,estado:'Pendiente',descripcion:'Prueba',fecha_creacion:'2026-11-19T18:00:00Z',cliente:'PRIMAX',operacion:'COESTI'}];
 assert.deepEqual(filtrarSoporte('tickets',filas,{...vacios,texto:'camara',desde:'2026-11-18',hasta:'2026-11-18'}).map(x=>x.id),[1]);
 assert.deepEqual(filtrarSoporte('tickets',filas,{...vacios,estado:'Pendiente',cliente:'REPSOL'}),[]);
});
test('busca las placas de videos y a los receptores de pulseras',()=>{
 assert.equal(filtrarSoporte('videos',[{id:4,placas:['V0T715']}],{...vacios,texto:'v0t715'}).length,1);
 assert.equal(filtrarSoporte('pulseras',[{id:2,nombre_receptor:'JOSÉ LOPEZ'}],{...vacios,texto:'jose'}).length,1);
});
