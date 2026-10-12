import assert from 'node:assert/strict';
import {mock,beforeEach,test} from 'node:test';
let llamadas, estadoOrden, existeOrden, existeActividad, pendientes, fallaAuditoria;
const client={
  query: async (sql,params) => {
    llamadas.push({sql,params});
    if(sql.includes('SELECT a.*'))return {rows:existeActividad?[{id:7,orden_trabajo_detalle_id:9,estado:'PENDIENTE'}]:[]};
    if(sql.includes('UPDATE ordenes_trabajo_detalle_actividades'))return {rows:[{id:7,estado:params[1],observacion:params[2],actualizado_en:'2026-10-12T12:00:00Z'}]};
    if(sql.includes('a.descripcion_snapshot AS descripcion'))return {rows:pendientes};
    return {rows:[]};
  },release:()=>llamadas.push({sql:'RELEASE'})
};
mock.module('../src/config/database.js',{namedExports:{pool:{connect:async()=>client,query:async()=>({rows:[]})}}});
mock.module('../src/modules/programas/programacion/ordenes/repository.js',{namedExports:{
  obtenerOrdenPorId:async()=>existeOrden?{estado:estadoOrden}:null,
  obtenerOrdenParaEscritura:async(p,v,o)=>existeOrden&&p===1&&v===2&&o===3?{estado:estadoOrden}:null
}});
mock.module('../src/services/auditService.js',{namedExports:{logAction:async(...args)=>{
  llamadas.push({sql:'AUDIT',args});if(fallaAuditoria)throw new Error('Fallo simulado');
}}});
const {prepararActividadChecklist,listarChecklistOrden,editarActividadChecklist,validarChecklistAlCerrar}=await import('../src/modules/programas/programacion/ordenes/checklist.js');
beforeEach(()=>{llamadas=[];estadoOrden='ABIERTA';existeOrden=true;existeActividad=true;pendientes=[];fallaAuditoria=false;});
const req=(rol='ti',extra={})=>({user:{id:6,rol},params:{programaId:'1',programacionId:'2',otId:'3',actividadId:'7'},body:{estado:'REALIZADO',observacion:''},...extra});
const res=()=>({codigo:200,status(n){this.codigo=n;return this;},json(d){this.datos=d;return this;},setHeader(){}});
const transacciones=()=>llamadas.map(l=>l.sql).filter(s=>['BEGIN','COMMIT','ROLLBACK'].includes(s));
test('Permite estados exactos, normaliza observaciones y no convierte pendientes en realizadas',()=>{
 assert.deepEqual(prepararActividadChecklist({estado:'PENDIENTE',observacion:'  '}),{estado:'PENDIENTE',observacion:null});
 assert.deepEqual(prepararActividadChecklist({estado:'NO_APLICA',observacion:' motivo '}),{estado:'NO_APLICA',observacion:'motivo'});
 for(const datos of [null,[],{}, {estado:'realizado',observacion:null},{estado:'REALIZADO',observacion:3},{estado:'REALIZADO',observacion:'x'.repeat(4001)},{estado:'REALIZADO',observacion:null,actualizado_por_id:99}])assert.throws(()=>prepararActividadChecklist(datos));
});
test('Supervisor no consulta ni modifica actividades aunque conozca sus IDs',async()=>{
 for(const handler of [listarChecklistOrden,editarActividadChecklist]){const r=res();await handler(req('supervisor'),r);assert.equal(r.codigo,403);}
 assert.equal(llamadas.length,0);
});
test('Requiere sesión',async()=>{const r=res();await listarChecklistOrden(req('ti',{user:null}),r);assert.equal(r.codigo,401);});
test('TI y Admin editan con su identidad autenticada y auditoría dentro de la transacción',async()=>{
 for(const rol of ['ti','admin','administrador']){
  llamadas=[];const r=res();await editarActividadChecklist(req(rol),r);
  assert.equal(r.codigo,200);assert.equal(r.datos.actividad.estado,'REALIZADO');
  assert.deepEqual(transacciones(),['BEGIN','COMMIT']);
  assert.equal(llamadas.find(l=>l.sql.startsWith('UPDATE')).params[3],6);
  const audit=llamadas.find(l=>l.sql==='AUDIT');assert.equal(audit.args.at(-1).propagarError,true);
 }
});
test('Una actividad ajena a la OT no se actualiza',async()=>{
 existeActividad=false;const r=res();await editarActividadChecklist(req(),r);assert.equal(r.codigo,404);assert.deepEqual(transacciones(),['BEGIN','ROLLBACK']);
 assert.equal(llamadas.some(l=>l.sql.startsWith('UPDATE')),false);
});
test('Una jerarquía ajena se rechaza antes de mirar la actividad',async()=>{
 const r=res();await editarActividadChecklist(req('ti',{params:{programaId:'99',programacionId:'2',otId:'3',actividadId:'7'}}),r);
 assert.equal(r.codigo,404);assert.equal(llamadas.some(l=>l.sql.includes('SELECT a.*')),false);
});
test('Cerrada y anulada son de solo lectura incluso para admin',async()=>{
 for(const estado of ['CERRADA','ANULADA']){estadoOrden=estado;const r=res();await editarActividadChecklist(req('admin'),r);assert.equal(r.codigo,409);}
 assert.equal(llamadas.some(l=>l.sql.startsWith('UPDATE')),false);
});
test('Un fallo de auditoría revierte la actividad',async()=>{
 fallaAuditoria=true;const r=res();await editarActividadChecklist(req(),r);assert.equal(r.codigo,500);assert.deepEqual(transacciones(),['BEGIN','ROLLBACK']);
});
test('El cierre publica todos los motivos faltantes como errores estructurados',async()=>{
 pendientes=[{id:7,descripcion:'Fixture A',tipo_equipo:'CAMARAS',detalle_id:9,estado:'PENDIENTE'},{id:8,descripcion:'Fixture B',tipo_equipo:'CAMARAS',detalle_id:9,estado:'NO_APLICA'}];
 await assert.rejects(validarChecklistAlCerrar(3,client),e=>e.status===409&&e.code==='CHECKLIST_INCOMPLETO'&&e.incumplimientos.length===2);
 pendientes=[];await validarChecklistAlCerrar(3,client);
});
