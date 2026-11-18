import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { crearRutasTipos, normalizarTipo } from '../src/modules/entregas/configuracionTipos.js';
const modulo = process.env.PGLITE_MODULE || (() => { try { return import.meta.resolve('@electric-sql/pglite'); } catch { return null; } })();
test('catálogo y permisos: solo Admin y TI gestionan opciones', { skip: !modulo }, async () => {
 const { PGlite } = await import(modulo);
 const db = new PGlite(); const sql = await readFile(new URL('../migrations/20261118_catalogo_entregas_ti.sql', import.meta.url), 'utf8');
 const pool = { query: (q, p) => db.query(q, p) }; await db.exec(sql);
 const app = express(); app.use(express.json()); app.use((req,_res,next)=>{req.user={rol:req.headers['x-test-rol']}; next();}); app.use('/tipos', crearRutasTipos(pool, {error(){}}));
 const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}); const url = `http://127.0.0.1:${server.address().port}/tipos`;
 async function pedir(rol, ruta='', opts={}) { const r=await fetch(url+ruta,{...opts,headers:{'x-test-rol':rol,'Content-Type':'application/json',...opts.headers}}); return { status:r.status, data:await r.json() }; }
 try {
  let r = await pedir('gerencia'); assert.equal(r.status,200); assert.equal(r.data.tipos.length,9);
  assert.equal((await pedir('gerencia','?todos=1')).status,403);
  assert.equal((await pedir('supervisor','',{method:'POST',body:JSON.stringify({valor:'TECLADO'})})).status,403);
  assert.equal((await pedir('gerencia','',{method:'POST',body:JSON.stringify({valor:'TECLADO'})})).status,403);
  r=await pedir('TI','',{method:'POST',body:JSON.stringify({valor:'  teclado   usb '})}); assert.equal(r.status,201); assert.equal(r.data.valor,'TECLADO USB'); const id=r.data.id;
  assert.equal((await pedir('admin','',{method:'POST',body:JSON.stringify({valor:'teclado usb'})})).status,409);
  assert.equal((await pedir('TI',`/${id}`,{method:'PATCH',body:JSON.stringify({activo:false})})).status,200);
  await db.exec(sql);
  assert.equal((await pedir('gerencia')).data.tipos.some(t=>t.id===id),false);
  assert.equal((await pedir('TI','?todos=1')).data.tipos.find(t=>t.id===id).activo,false);
  assert.equal((await pedir('admin',`/${id}`,{method:'PATCH',body:JSON.stringify({activo:true})})).status,200);
  const pulsera=(await pedir('TI')).data.tipos.find(t=>t.valor==='PULSERA');
  assert.equal((await pedir('ti',`/${pulsera.id}`,{method:'PATCH',body:JSON.stringify({activo:false})})).status,409);
  assert.equal(normalizarTipo('  '),null);
 } finally { await new Promise(resolve=>server.close(resolve)); await db.close(); }
});
