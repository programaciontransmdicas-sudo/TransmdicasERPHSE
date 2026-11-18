import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearRepositorio } from '../src/modules/seguridad/repository.js';
import { crearServicio, sanearDatos } from '../src/modules/seguridad/service.js';
import { validarFiltros } from '../src/modules/seguridad/validaciones.js';
import { construirExcel } from '../src/modules/seguridad/excel.js';
import { crearControladores } from '../src/modules/seguridad/controller.js';
import ExcelJS from 'exceljs';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { crearEscrituraService } from '../src/modules/seguridad/formularios/service.js';
import { crearCargaERP, crearControladoresEscritura } from '../src/modules/seguridad/formularios/controller.js';
import { identificarArchivo } from '../src/modules/seguridad/formularios/archivos.js';

// La prueba SQL utiliza PGlite cuando PGLITE_MODULE apunta al paquete instalado.
// No consulta Neon ni requiere credenciales reales.
const modulo = process.env.PGLITE_MODULE || (() => {
  try { return import.meta.resolve('@electric-sql/pglite'); } catch { return null; }
})();
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let db, servicio, servidor, baseUrl, pgPool, escritura;
const subidas = [], borradas = [];
const almacen = { subir: async (archivo, publicId) => subidas.push(publicId), borrar: async archivo => borradas.push(archivo.publicId) };
const poolTemporal = { connect: async () => ({ query: (...args) => db.query(...args), release() {} }) };
const tercero = (extra = {}) => ({ id: randomUUID(), base: 'Peruarbo', fechaIngreso: '2026-10-30', responsableSolicitud: 'Responsable', nombre: 'Juan Pérez', dni: '12345678', fechaSalida: '2026-10-30', empresa: 'Empresa de prueba', responsableSitio: 'Jefe', area: 'Mantenimiento', horaIngreso: '08:30', motivo: 'Mantenimiento', ...extra });
const activo = (extra = {}) => ({ id: randomUUID(), base: 'Espinar', fecha: '2026-10-30T08:30', movimiento: 'Salida', nombre: 'Juan', area: 'Mantenimiento', motivo: 'Calibración', documento: 'Guía de Remisión Remitente', numero: 'T001-001', autoriza: 'Jefe', retorna: 'Sí', fechaPrevista: '2026-11-05', agente: 'Agente', observaciones: '', bienes: [{ id: randomUUID(), descripcion: 'Radio', cantidad: 2, series: ['S001', 'S002'] }, { id: randomUUID(), descripcion: 'Cargador', cantidad: 3, series: [] }], ...extra });
const pdf = () => ({ originalname: 'sustento.pdf', buffer: Buffer.from('%PDF-1.4\nDocumento de prueba\n%%EOF') });

before(async () => {
  if (!modulo) return;
  const { PGlite } = await import(modulo);
  db = new PGlite();
  await db.exec('CREATE TABLE public.vehiculos(placa varchar PRIMARY KEY); CREATE TABLE public.cliente_operaciones(id integer PRIMARY KEY);');
  for (const nombre of ['001_controles_vehiculos.sql', '002_movimientos_vehiculos.sql', '003_fotos_vehiculos.sql', '004_backend_completo.sql']) {
    await db.exec(await readFile(new URL(`./fixtures/seguridad/${nombre}`, import.meta.url), 'utf8'));
  }
  await db.query(`INSERT INTO transreport.controles_vehiculos(id,base,placa,conductor,dni,operacion,ingreso_registrado,estado,creado_en)
    VALUES($1,'Peruarbo','ABC123','José Pérez','12345678','Operación',true,'En base','2026-10-28 04:59:59+00'),
    ($2,'Espinar','BCD234','Ana Torres','12345679','Operación',true,'Salida registrada','2026-10-28 05:00:00+00')`, [uuid(1), uuid(2)]);
  await db.query(`INSERT INTO transreport.movimientos_vehiculos(id,control_id,tipo,fecha,agente,kilometraje,conductor,dni,origen,condicion,repuesto,carga)
    VALUES($1,$2,'INGRESO','2026-10-28 04:50+00','Agente',100,'José Pérez','12345678','Origen','Operativo','Presente','Sin carga')`, [uuid(200), uuid(1)]);
  await db.query(`INSERT INTO transreport.fotos_vehiculos(id,movimiento_id,vista,cloudinary_public_id,formato,bytes)
    VALUES($1,$2,'Frente','privado/foto','jpg',100)`, [uuid(300), uuid(200)]);
  await db.query(`INSERT INTO transreport.archivos(id,tipo,registro_id,base,nombre,public_id,recurso,formato,mime,bytes)
    VALUES($1,'vehiculos',$2,'Peruarbo','Frente.jpg','privado/foto','image','jpg','image/jpeg',100)`, [uuid(300), uuid(1)]);
  for (let n = 10; n < 37; n++) {
    const datos = { id: uuid(n), base: n === 36 ? 'Moquegua' : 'Peruarbo', nombre: `Persona ${n}`, dni: `100000${n}`, estado: n === 36 ? 'Salida registrada' : 'En instalaciones', fecha: '2026-10-28T10:00:00Z' };
    await db.query('INSERT INTO transreport.registros(id,tipo,base,datos,creado_en) VALUES($1,$2,$3,$4,$5)', [datos.id, 'personal', datos.base, datos, '2026-10-28T10:00:00Z']);
  }
  const ronda = { id: uuid(40), base: 'Peruarbo', nombre: 'Supervisor', estado: 'Registrada', presentaAnomalias: 'Sí', anomalias: 'Luminaria', fecha: '2026-10-29T12:00:00Z' };
  await db.query('INSERT INTO transreport.registros(id,tipo,base,datos,creado_en) VALUES($1,$2,$3,$4,$5)', [ronda.id, 'rondas', ronda.base, ronda, ronda.fecha]);
  const bien = { id: uuid(41), base: 'Espinar', nombre: '=HYPERLINK("https://example.invalid")', estado: 'Pendiente de retorno', bienes: [{ id: uuid(42), descripcion: 'Radio', cantidad: 2, series: ['A001', 'A002'] }], retornos: [{ retorno: '2026-10-29T18:00:00Z', recibe: 'Jefe', documentoRetorno: 'R001', bienes: [{ bienId: uuid(42), descripcion: 'Radio', cantidad: 1, series: ['A001'] }] }] };
  await db.query('INSERT INTO transreport.registros(id,tipo,base,datos) VALUES($1,$2,$3,$4)', [bien.id, 'activos', bien.base, bien]);
  servicio = crearServicio(crearRepositorio(db));
  escritura = crearEscrituraService({ pool: poolTemporal, almacen });
  process.env.DATABASE_URL = 'postgres://prueba:prueba@127.0.0.1:1/prueba';
  process.env.JWT_SECRET = 'x'.repeat(64);
  const { authorizeRequest } = await import('../src/middlewares/security.js');
  const { authenticateRequest } = await import('../src/middlewares/security.js');
  const { ROLE_PERMISSIONS } = await import('../src/config/permissions.js');
  ({ pool: pgPool } = await import('../src/config/database.js'));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const rol = req.headers['x-rol-prueba'];
    if (!rol) return authenticateRequest(req, res, next);
    req.user = { id: 1, rol, permisos: rol === 'lector' ? { seguridad: { ver: true, editar: false } } : ROLE_PERMISSIONS[rol] || {} }; next();
  });
  app.use(authorizeRequest);
  const c = crearControladores(servicio, { config: () => ({}) });
  app.get('/api/seguridad-patrimonial/resumen', c.resumen);
  app.get('/api/seguridad-patrimonial/registros/:tipo/exportar', c.exportar);
  app.get('/api/seguridad-patrimonial/registros/:tipo/:id/archivos/:archivoId', c.archivo);
  app.get('/api/seguridad-patrimonial/registros/:tipo/:id', c.detalle);
  app.get('/api/seguridad-patrimonial/registros/:tipo', c.listar);
  const { requirePermiso } = await import('../src/middlewares/auth.js');
  const e = crearControladoresEscritura(escritura);
  app.post('/api/seguridad-patrimonial/registros/:tipo', requirePermiso('seguridad', 'editar'), crearCargaERP, e.crear);
  app.post('/api/seguridad-patrimonial/registros/:tipo/:id/:accion', requirePermiso('seguridad', 'editar'), e.cerrar);
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${servidor.address().port}/api/seguridad-patrimonial`;
});

after(async () => {
  if (servidor) await new Promise(resolve => servidor.close(resolve));
  if (pgPool) await pgPool.end();
  if (db) await db.close();
});

test('valida bases, tipos de parámetro, fechas reales y orden del periodo', () => {
  assert.throws(() => validarFiltros({ base: 'Otra' }), /base válida/);
  assert.throws(() => validarFiltros({ base: ['Peruarbo'] }), /base/);
  assert.throws(() => validarFiltros({ desde: '2026-02-30' }), /fecha/);
  assert.throws(() => validarFiltros({ desde: '2026-10-30', hasta: '2026-10-01' }), /inicial/);
  assert.throws(() => validarFiltros({ pagina: '0' }), /página/);
  assert.throws(() => validarFiltros({ busqueda: 'a'.repeat(101) }), /búsqueda/);
  assert.equal(validarFiltros({ desde: '2024-02-29' }).desde, '2024-02-29');
});

test('elimina ubicaciones de almacenamiento y secretos de datos anidados', () => {
  assert.deepEqual(sanearDatos({ nombre: 'Juan', fotos: [{ id: '1', publicId: 'secreto', url: '/api/anterior' }], token_hash: 'secreto' }), { nombre: 'Juan', fotos: [{ id: '1' }] });
});

const sql = (nombre, accion) => test(nombre, { skip: !modulo }, accion);
sql('resumen conserva los siete controles y cuenta estados actuales', async () => {
  const r = await servicio.resumen({});
  assert.equal(r.controles.length, 7); assert.equal(r.total, 31);
  assert.equal(r.controles.find(c => c.id === 'personal').pendientes, 26);
  assert.equal(r.controles.find(c => c.id === 'vehiculos').pendientes, 1);
  assert.equal(r.controles.find(c => c.id === 'rondas').anomalias, 1);
});
sql('filtro de fechas utiliza medianoche de Perú y fin inclusivo', async () => {
  const r = await servicio.listar('vehiculos', { desde: '2026-10-28', hasta: '2026-10-28' });
  assert.equal(r.total, 1); assert.equal(r.registros[0].id, uuid(2));
  const anterior = await servicio.listar('vehiculos', { hasta: '2026-10-27' });
  assert.equal(anterior.total, 1); assert.equal(anterior.registros[0].id, uuid(1));
});
sql('busca vehículos históricos sin JSON, acentos y placas con guion', async () => {
  assert.equal((await servicio.listar('vehiculos', { busqueda: 'jose' })).total, 1);
  assert.equal((await servicio.listar('vehiculos', { busqueda: 'ABC-123' })).total, 1);
  assert.equal((await servicio.listar('vehiculos', { busqueda: "' OR true --" })).total, 0);
  assert.equal((await servicio.listar('vehiculos', { base: 'Moquegua' })).total, 0);
});
sql('paginación, estados y total estable en página vacía', async () => {
  assert.equal((await servicio.listar('personal', {})).registros.length, 25);
  assert.equal((await servicio.listar('personal', { pagina: '2' })).registros.length, 2);
  const fuera = await servicio.listar('personal', { pagina: '3' });
  assert.equal(fuera.total, 27); assert.deepEqual(fuera.registros, []);
  const filtrado = await servicio.listar('personal', { base: 'Peruarbo', estado: 'En instalaciones' });
  assert.equal(filtrado.total, 26);
  assert.ok(filtrado.estados.includes('En instalaciones'));
});
sql('detalle hidrata movimientos históricos y fotografías', async () => {
  const d = await servicio.detalle('vehiculos', uuid(1));
  assert.equal(d.datos.movimientos.length, 1); assert.equal(d.datos.placa, 'ABC123');
  assert.equal(d.archivos[0].vista, 'Frente'); assert.equal(d.archivos[0].etapa, 'INGRESO');
  assert.equal(d.archivos[0].public_id, undefined);
  await assert.rejects(() => servicio.detalle('personal', uuid(1)), e => e.status === 404);
});
sql('archivo exige correspondencia entre control, registro y base', async () => {
  assert.equal((await servicio.archivo('vehiculos', uuid(1), uuid(300))).id, uuid(300));
  await assert.rejects(() => servicio.archivo('vehiculos', uuid(2), uuid(300)), e => e.status === 404);
  await assert.rejects(() => servicio.archivo('personal', uuid(1), uuid(300)), e => e.status === 404);
});
sql('Excel exporta todas las páginas y conserva series y retornos', async () => {
  const exportacion = await servicio.exportar('personal', { pagina: '2' });
  assert.equal(exportacion.registros.length, 27);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await construirExcel(await servicio.exportar('activos', {})));
  assert.equal(libro.getWorksheet('Bienes').rowCount, 2);
  assert.equal(libro.getWorksheet('Series').rowCount, 3);
  assert.equal(libro.getWorksheet('Retornos').rowCount, 2);
  assert.equal(libro.getWorksheet('Series devueltas').rowCount, 2);
  const celda = libro.getWorksheet('Registros').getRow(2).getCell(6);
  assert.equal(typeof celda.value, 'string'); assert.ok(celda.value.startsWith('=HYPERLINK'));
});
sql('limita exportaciones antes de cargar sus detalles', async () => {
  let detalles = false;
  const s = crearServicio({ listar: async () => ({ total: 5001, registros: [] }), detalles: async () => { detalles = true; return []; } });
  await assert.rejects(() => s.exportar('personal', {}), e => e.status === 413);
  assert.equal(detalles, false);
});
sql('HTTP requiere sesión; supervisor y TI no reciben acceso implícito', async () => {
  assert.equal((await fetch(`${baseUrl}/resumen`)).status, 401);
  for (const rol of ['supervisor', 'ti']) {
    assert.equal((await fetch(`${baseUrl}/resumen`, { headers: { 'x-rol-prueba': rol } })).status, 403);
  }
  const r = await fetch(`${baseUrl}/resumen`, { headers: { 'x-rol-prueba': 'admin' } });
  assert.equal(r.status, 200); assert.match(r.headers.get('Cache-Control'), /no-store/);
});
sql('HTTP valida filtros, identificadores y devuelve Excel real', async () => {
  const headers = { 'x-rol-prueba': 'admin' };
  assert.equal((await fetch(`${baseUrl}/registros/vehiculos?base=Otra`, { headers })).status, 400);
  assert.equal((await fetch(`${baseUrl}/registros/vehiculos/invalido`, { headers })).status, 400);
  const r = await fetch(`${baseUrl}/registros/personal/exportar?base=Peruarbo`, { headers });
  assert.equal(r.status, 200); assert.match(r.headers.get('Content-Type'), /spreadsheetml/);
  const libro = new ExcelJS.Workbook(); await libro.xlsx.load(Buffer.from(await r.arrayBuffer()));
  assert.equal(libro.getWorksheet('Registros').rowCount, 27);
});

sql('Terceros: ingreso de varias personas, auditoría y reintento sin duplicados', async () => {
  const entrada = tercero({ nombre: 'Juan Pérez\nAna Torres', dni: '12345678\n87654321' }), clave = randomUUID();
  const primero = await escritura.crear('terceros', entrada, null, { id: 1 }, clave);
  const segundo = await escritura.crear('terceros', entrada, null, { id: 1 }, clave);
  assert.equal(primero.id, entrada.id); assert.equal(segundo.repetida, true);
  const r = (await db.query('SELECT * FROM transreport.registros WHERE id=$1', [entrada.id])).rows[0];
  assert.equal(r.datos.fecha, '2026-10-30T13:30:00.000Z');
  assert.equal(r.datos._erp.creacion.usuarioId, '1'); assert.equal(r.datos.estado, 'Registrado');
  assert.equal((await servicio.detalle('terceros', entrada.id)).datos._erp, undefined);
  await assert.rejects(() => escritura.crear('terceros', { ...entrada, motivo: 'Otro' }, null, { id: 1 }, clave), e => e.status === 409);
  await assert.rejects(() => escritura.crear('terceros', entrada, null, { id: 2 }, clave), e => e.status === 409);
});
sql('Terceros: valida correspondencia de nombres, DNI, fechas y campos no autorizados', async () => {
  for (const entrada of [tercero({ nombre: 'Juan\nAna' }), tercero({ dni: '123' }), tercero({ nombre: 'Juan\nAna', dni: '12345678\n12345678' }), tercero({ fechaSalida: '2026-10-29' }), tercero({ _erp: { usuarioId: 'falso' } })]) {
    await assert.rejects(() => escritura.crear('terceros', entrada, null, { id: 1 }, randomUUID()), e => e.status === 422);
  }
});
sql('Terceros: salida real, control de revisión y reintento de cierre', async () => {
  const entrada = tercero();
  await escritura.crear('terceros', entrada, null, { id: 1 }, randomUUID());
  await assert.rejects(() => escritura.cerrar('terceros', entrada.id, { revision: 1, salida: '2026-10-30T08:29', observaciones: '' }, { id: 1 }, randomUUID()), e => e.status === 422);
  const cierre = { revision: 1, salida: '2026-10-30T17:00', observaciones: 'Salida verificada' }, clave = randomUUID();
  await escritura.cerrar('terceros', entrada.id, cierre, { id: 1 }, clave);
  assert.equal((await escritura.cerrar('terceros', entrada.id, cierre, { id: 1 }, clave)).repetida, true);
  const r = await servicio.detalle('terceros', entrada.id);
  assert.equal(r.revision, 2); assert.equal(r.datos.estado, 'Salida registrada');
  assert.equal(r.datos.salidaReal, '2026-10-30T22:00:00.000Z');
  await assert.rejects(() => escritura.cerrar('terceros', entrada.id, cierre, { id: 1 }, randomUUID()), e => e.status === 409);
});
sql('Activos: sustento obligatorio y archivo validado por contenido', async () => {
  await assert.rejects(() => escritura.crear('activos', activo(), null, { id: 1 }, randomUUID()), e => e.status === 422);
  await assert.rejects(() => identificarArchivo({ originalname: 'falso.pdf', buffer: Buffer.from('no es PDF') }, 'activos'), e => e.status === 422);
  await assert.rejects(() => identificarArchivo({ originalname: 'foto.jpg', buffer: Buffer.from([255,216,255,224,0,16,74,70,73,70,0]) }, 'terceros'), e => e.status === 422);
  const a = await identificarArchivo(pdf(), 'terceros'); assert.equal(a.mime, 'application/pdf');
});
sql('Activos: guarda bienes y adjuntos una sola vez al reintentar', async () => {
  const entrada = activo(), clave = randomUUID(), antes = subidas.length;
  await escritura.crear('activos', entrada, pdf(), { id: 1 }, clave);
  await escritura.crear('activos', entrada, pdf(), { id: 1 }, clave);
  assert.equal(subidas.length, antes + 1);
  const r = await servicio.detalle('activos', entrada.id);
  assert.equal(r.datos.bienes.length, 2); assert.equal(r.archivos.length, 1);
  assert.equal(r.datos.estado, 'Pendiente de retorno'); assert.equal(r.archivos[0].mime, 'application/pdf');
});
sql('Activos: rechaza series duplicadas y cantidad diferente a las series', async () => {
  const uno = activo(); uno.bienes[0].series = ['S001', 'S001'];
  const dos = activo(); dos.bienes[0].cantidad = 3;
  for (const entrada of [uno, dos, activo({ fechaPrevista: '2026-10-29' })]) {
    await assert.rejects(() => escritura.crear('activos', entrada, pdf(), { id: 1 }, randomUUID()), e => e.status === 422);
  }
});
sql('Activos: retorno parcial por serie y cantidad, seguido de retorno total', async () => {
  const entrada = activo(); await escritura.crear('activos', entrada, pdf(), { id: 1 }, randomUUID());
  const [radio, cargador] = entrada.bienes;
  const parcial = { revision: 1, retorno: '2026-10-31T10:00', recibe: 'Agente', documentoRetorno: 'T001-001', observaciones: '', seleccion: { [radio.id]: { series: ['S001'] }, [cargador.id]: { cantidad: 1 } } };
  const clave = randomUUID();
  await escritura.cerrar('activos', entrada.id, parcial, { id: 1 }, clave);
  assert.equal((await escritura.cerrar('activos', entrada.id, parcial, { id: 1 }, clave)).repetida, true);
  let r = await servicio.detalle('activos', entrada.id);
  assert.equal(r.datos.estado, 'Pendiente de retorno'); assert.equal(r.datos.retornos.length, 1);
  await assert.rejects(() => escritura.cerrar('activos', entrada.id, { ...parcial, revision: 2 }, { id: 1 }, randomUUID()), e => e.status === 422);
  await escritura.cerrar('activos', entrada.id, { ...parcial, revision: 2, retorno: '2026-11-01T10:00', seleccion: { [radio.id]: { series: ['S002'] }, [cargador.id]: { cantidad: 2 } } }, { id: 1 }, randomUUID());
  r = await servicio.detalle('activos', entrada.id);
  assert.equal(r.datos.estado, 'Retornado'); assert.equal(r.datos.retornos.length, 2); assert.equal(r.revision, 3);
});
sql('Activos: impide sobredevolución, bienes ajenos, fechas anteriores y revisiones vencidas', async () => {
  const entrada = activo(); await escritura.crear('activos', entrada, pdf(), { id: 1 }, randomUUID());
  const retorno = { revision: 1, retorno: '2026-10-31T10:00', recibe: 'Agente', documentoRetorno: 'T001', observaciones: '', seleccion: { [entrada.bienes[1].id]: { cantidad: 1 } } };
  for (const cambios of [{ seleccion: { [entrada.bienes[1].id]: { cantidad: 4 } } }, { seleccion: { [randomUUID()]: { cantidad: 1 } } }, { retorno: '2026-10-29T10:00' }, { revision: 2 }]) {
    await assert.rejects(() => escritura.cerrar('activos', entrada.id, { ...retorno, ...cambios }, { id: 1 }, randomUUID()), e => [409, 422].includes(e.status));
  }
});
sql('revierte filas y limpia el archivo si falla el registro antes de COMMIT', async () => {
  const entrada = activo(), antes = borradas.length;
  const poolFalla = { connect: async () => ({ release() {}, async query(sql, valores) {
    if (sql.startsWith('INSERT INTO transreport.registros')) throw Object.assign(new Error('Fallo de prueba'), { code: 'XX000' });
    return db.query(sql, valores);
  } }) };
  await assert.rejects(() => crearEscrituraService({ pool: poolFalla, almacen }).crear('activos', entrada, pdf(), { id: 1 }, randomUUID()));
  assert.equal(borradas.length, antes + 1);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM transreport.archivos WHERE registro_id=$1', [entrada.id])).rows[0].n, 0);
});
sql('si se pierde la confirmación de COMMIT, el reintento conserva archivo y evita duplicados', async () => {
  const entrada = activo(), clave = randomUUID(), antes = subidas.length, antesBorradas = borradas.length;
  const poolFalla = { connect: async () => ({ release() {}, async query(sql, valores) {
    const resultado = await db.query(sql, valores);
    if (sql === 'COMMIT') throw Object.assign(new Error('Confirmación perdida'), { code: 'ECONNRESET' });
    return resultado;
  } }) };
  await assert.rejects(() => crearEscrituraService({ pool: poolFalla, almacen }).crear('activos', entrada, pdf(), { id: 1 }, clave));
  assert.equal((await escritura.crear('activos', entrada, pdf(), { id: 1 }, clave)).repetida, true);
  assert.equal(subidas.length, antes + 1); assert.equal(borradas.length, antesBorradas);
  assert.equal((await servicio.detalle('activos', entrada.id)).archivos.length, 1);
});
sql('HTTP de escritura exige permiso editar y permite guardar y cerrar Terceros', async () => {
  const entrada = tercero();
  const form = () => { const f = new FormData(); f.append('datos', JSON.stringify(entrada)); return f; };
  const lector = await fetch(`${baseUrl}/registros/terceros`, { method: 'POST', headers: { 'x-rol-prueba': 'lector', 'Idempotency-Key': randomUUID() }, body: form() });
  assert.equal(lector.status, 403);
  const r = await fetch(`${baseUrl}/registros/terceros`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID() }, body: form() });
  assert.equal(r.status, 201); assert.equal((await r.json()).id, entrada.id);
  const cerrado = await fetch(`${baseUrl}/registros/terceros/${entrada.id}/salida`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, salida: '2026-10-30T18:00', observaciones: '' }) });
  assert.equal(cerrado.status, 200);
});
sql('HTTP acepta sustento PDF y rechaza adjunto no correspondiente', async () => {
  const entrada = activo();
  const f = new FormData(); f.append('datos', JSON.stringify(entrada)); f.append('sustento', new Blob([pdf().buffer], { type: 'application/pdf' }), 'guia.pdf');
  const r = await fetch(`${baseUrl}/registros/activos`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID() }, body: f });
  assert.equal(r.status, 201);
  const incorrecto = new FormData(); incorrecto.append('datos', JSON.stringify(tercero())); incorrecto.append('sustento', new Blob([pdf().buffer]), 'otro.pdf');
  assert.equal((await fetch(`${baseUrl}/registros/terceros`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID() }, body: incorrecto })).status, 400);
});
sql('Llaves: recojo, duplicado, devolución e idempotencia', async () => {
  const datos = { id: randomUUID(), base: 'Peruarbo', fecha: '2026-11-13T08:00', nombre: 'Persona', cargo: 'Conductor', placa: 'ABC-345', identificacion: '', agente: 'Agente', observaciones: '' };
  const usuario = { id: 123 }, clave = randomUUID();
  const creado = await escritura.crear('llaves', datos, null, usuario, clave);
  assert.equal(creado.id, datos.id);
  assert.equal((await escritura.crear('llaves', datos, null, usuario, clave)).repetida, true);
  await assert.rejects(() => escritura.crear('llaves', { ...datos, id: randomUUID(), placa: 'abc345' }, null, usuario, randomUUID()), e => e.status === 409);
  await assert.rejects(() => escritura.cerrar('llaves', datos.id, { revision: 1, devolucionFecha: '2026-11-13T07:00', recibe: 'Agente', observaciones: '' }, usuario, randomUUID()), e => e.status === 422);
  const cierre = { revision: 1, devolucionFecha: '2026-11-13T10:00', recibe: 'Agente', observaciones: '' }, claveCierre = randomUUID();
  await escritura.cerrar('llaves', datos.id, cierre, usuario, claveCierre);
  assert.equal((await escritura.cerrar('llaves', datos.id, cierre, usuario, claveCierre)).repetida, true);
  const row = (await db.query('SELECT datos FROM transreport.registros WHERE id=$1', [datos.id])).rows[0];
  assert.equal(row.datos.estado, 'Devuelta'); assert.equal(row.datos.placa, 'ABC345');
  await escritura.crear('llaves', { ...datos, id: randomUUID() }, null, usuario, randomUUID());
});
sql('HTTP Llaves requiere edición y admite recojo y devolución', async () => {
  const entrada = { id: randomUUID(), base: 'Peruarbo', fecha: '2026-11-13T08:00', nombre: 'Persona', cargo: 'Conductor', placa: 'BXY-789', identificacion: '', agente: 'Agente', observaciones: '' };
  const form = () => { const f = new FormData(); f.append('datos', JSON.stringify(entrada)); return f; };
  const lector = await fetch(`${baseUrl}/registros/llaves`, { method: 'POST', headers: { 'x-rol-prueba': 'lector', 'Idempotency-Key': randomUUID() }, body: form() });
  assert.equal(lector.status, 403);
  const creado = await fetch(`${baseUrl}/registros/llaves`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID() }, body: form() });
  assert.equal(creado.status, 201);
  const cerrado = await fetch(`${baseUrl}/registros/llaves/${entrada.id}/devolucion`, { method: 'POST', headers: { 'x-rol-prueba': 'admin', 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, devolucionFecha: '2026-11-13T10:00', recibe: 'Agente', observaciones: '' }) });
  assert.equal(cerrado.status, 200);
});
