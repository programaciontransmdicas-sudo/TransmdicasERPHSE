import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, mock, test } from 'node:test';

if (!process.env.PGLITE_TEST_MODULE) {
  test('Cierre de pulseras con PostgreSQL local', { skip: 'Defina PGLITE_TEST_MODULE con la ruta del módulo @electric-sql/pglite de pruebas' }, () => {});
} else {
  // PGLITE_TEST_MODULE permite ejecutar estas pruebas sin una base de datos externa.
  const { PGlite } = await import(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  const pool = { query: (sql, args) => db.query(sql, args), connect: async () => ({ query: (sql, args) => db.query(sql, args), release() {} }) };
  let subida = 0, retiradas = [], auditorias = [], fallarAuditoria = false;
  process.env.JWT_SECRET = 'solo_pruebas_cierre_pulseras_'.repeat(4);
  let notificaciones = [];
  mock.module('../src/modules/notificaciones/repository.js', { namedExports: { crearNotificacionUsuario: async datos => { notificaciones.push(datos); }, crearNotificacionesPorRoles: async () => {} } });
  mock.module('../src/config/database.js', { namedExports: { pool } });
  mock.module('../src/services/cloudinaryService.js', { namedExports: {
    uploadToCloudinary: async () => `https://res.cloudinary.com/pruebas/image/upload/cierre-${++subida}.jpg`,
    deleteFromCloudinary: async url => { retiradas.push(url); }
  } });
  mock.module('../src/services/auditService.js', { namedExports: { logAction: async (...args) => {
    if (args[1] !== 'Creo movimiento de inventario TI') assert.ok(args[6]?.client, 'La auditoría del cierre debe usar la transacción');
    if (fallarAuditoria) throw new Error('Auditoría no disponible');
    auditorias.push(args);
  } } });
  const { registrarEntregaCambioPulsera, cerrarPulseraSinCambio, idReportePulsera } = await import('../src/modules/tickets/cierrePulseras.js');
  const { actualizarEstadoReportePulsera, obtenerReportesPulseras } = await import('../src/modules/tickets/repository.js');
  const { registrarMovimiento } = await import('../src/modules/entregas/controller.js');
  const { cerrarReportePulseraSinCambio, cambiarEstadoReportePulsera } = await import('../src/modules/tickets/controller.js');
  const { ROLE_PERMISSIONS } = await import('../src/config/permissions.js');
  after(async () => { await db.close(); });
  await db.exec(`
    CREATE TABLE personal (id integer PRIMARY KEY, dni text UNIQUE, nombre_completo text, cargo text, estado text);
    CREATE TABLE usuarios (id integer PRIMARY KEY, username text, rol text, estado text, operacion text, persona_id integer REFERENCES personal);
    CREATE TABLE clientes (id integer PRIMARY KEY, nombre text, activo boolean);
    CREATE TABLE cliente_operaciones (id integer PRIMARY KEY, cliente_id integer REFERENCES clientes, nombre text, activo boolean);
    INSERT INTO clientes VALUES (1, 'REPSOL', true);
    INSERT INTO cliente_operaciones VALUES (17,1,'QUELLAVECO',true);
    CREATE TABLE entregas_ti (id serial PRIMARY KEY, fecha date, encargado text, nombre text, dni text REFERENCES personal(dni), cargo text, operacion text, cliente_operacion_id integer, condicion text, equipo_tipo text, marca text, modelo text, serie text, laptop text, mouse text, cargador text, motivo text, observaciones text, precio numeric, tipo_movimiento text, documento_url text);
    CREATE TABLE pulseras (id serial PRIMARY KEY, receptor_persona_id integer REFERENCES personal, solicitante_persona_id integer REFERENCES personal, cliente_operacion_id integer, creado_por integer REFERENCES usuarios, estado text DEFAULT 'Pendiente', fecha_cierre timestamptz, operacion text, motivo_renovacion text, evidencia_url text, fecha_creacion timestamptz DEFAULT now(), fecha_llegada_personal date, hora_llegada_personal time);
    INSERT INTO personal VALUES (1, '00000001', 'APELLIDO UNO, PERSONA', 'Conductor', 'Activo'), (2, '00000002', 'APELLIDO DOS, OTRA PERSONA', 'Conductor', 'Activo');
    INSERT INTO usuarios VALUES (1, 'admin', 'admin', 'activo', '', 1), (2, 'ti', 'ti', 'activo', '', 1), (3, 'supervisor', 'supervisor', 'activo', '', 2);
    INSERT INTO pulseras(receptor_persona_id, solicitante_persona_id, cliente_operacion_id, creado_por, estado, fecha_cierre) VALUES (1, 2, 17, 3, 'Resuelto', now());
  `);
  const migracion = await readFile(new URL('../migrations/20261021_031_cierre_pulseras_entrega.sql', import.meta.url), 'utf8');
  const req = (id, user = 1) => ({ user: { id: user, rol: user === 1 ? 'admin' : user === 2 ? 'ti' : 'supervisor', permisos: ROLE_PERMISSIONS[user === 1 ? 'admin' : user === 2 ? 'ti' : 'supervisor'], username: user === 1 ? 'admin' : 'ti' }, params: { id: String(id) }, body: {} });
  const nueva = async () => (await db.query(`INSERT INTO pulseras(receptor_persona_id, solicitante_persona_id, cliente_operacion_id, creado_por) VALUES(1,2,17,3) RETURNING id`)).rows[0].id;
  const datos = { fecha: '2026-10-21', dni: '00000001', nombre: 'No confiar en este nombre', cliente_operacion_id: 17, operacion: 'QUELLAVECO', equipo_tipo: 'PULSERA', tipo_movimiento: 'Entrega', marca: 'Xiaomi', modelo: 'Smart Band', serie: 'PRUEBA-001' };
  const reemplazar = (id, cambios = {}, usuario = 1) => registrarEntregaCambioPulsera({ req: req(id, usuario), reporteId: id, datos: { ...datos, ...cambios } });
  const cerrar = (id, body = { motivo: 'Se corrigió la configuración; no requiere cambio.' }, file = { buffer: Buffer.from('imagen'), mimetype: 'image/jpeg' }, usuario = 1) => cerrarPulseraSinCambio({ ...req(id, usuario), body, file });
  const fila = async id => (await db.query('SELECT * FROM pulseras WHERE id=$1', [id])).rows[0];
  const cantidad = async () => Number((await db.query('SELECT count(*) AS n FROM entregas_ti')).rows[0].n);

  test('La migración es repetible y conserva los cierres históricos', async () => {
    await db.exec(migracion); await db.exec(migracion);
    assert.equal((await fila(1)).estado, 'Resuelto'); assert.equal((await fila(1)).aplica_cambio, null);
  });
  test('El cambio crea una entrega para el receptor y resuelve el reporte en la misma transacción', async () => {
    const id = await nueva(); const auditAntes = auditorias.length;
    const entrega = await reemplazar(id);
    assert.equal(entrega.nombre, 'APELLIDO UNO, PERSONA'); assert.equal(entrega.dni, datos.dni);
    assert.equal(entrega.reporte_pulsera_id, id); assert.equal(entrega.equipo_tipo, 'PULSERA');
    const reporte = await fila(id);
    assert.equal(reporte.estado, 'Resuelto'); assert.equal(reporte.aplica_cambio, true);
    assert.equal(reporte.entrega_ti_id, entrega.id); assert.equal(reporte.cerrada_por, 1); assert.ok(reporte.fecha_cierre);
    assert.equal(auditorias.length - auditAntes, 2);
    const previas = await cantidad(); await assert.rejects(reemplazar(id), { status: 409 }); assert.equal(await cantidad(), previas);
    await assert.rejects(db.query('DELETE FROM entregas_ti WHERE id=$1', [entrega.id]), error => ['23001', '23503'].includes(error.code));
    await assert.rejects(db.query("UPDATE entregas_ti SET dni='00000002' WHERE id=$1", [entrega.id]), { code: '23514' });
  });
  test('TI también puede registrar el cambio; un supervisor o una cuenta inactiva no puede cerrar', async () => {
    const id = await nueva(); assert.equal((await reemplazar(id, {}, 2)).reporte_pulsera.cerrada_por, 2);
    const abierto = await nueva(); await assert.rejects(reemplazar(abierto, {}, 3), { status: 403 });
    await assert.rejects(cerrar(abierto, undefined, undefined, 3), { status: 403 });
    await db.query("UPDATE usuarios SET estado='inactivo' WHERE id=2");
    await assert.rejects(reemplazar(abierto, {}, 2), { status: 403 });
    await db.query("UPDATE usuarios SET estado='activo' WHERE id=2"); assert.equal((await fila(abierto)).estado, 'Pendiente');
  });
  test('Receptor, operación, equipo, tipo y fecha inválidos no generan entregas', async () => {
    const id = await nueva(), antes = await cantidad();
    for (const [cambio, status] of [[{ dni: '00000002' }, 409], [{ cliente_operacion_id: 18 }, 409], [{ equipo_tipo: 'LAPTOP' }, 400], [{ tipo_movimiento: 'Devolución' }, 400], [{ fecha: '2026-02-30' }, 400], [{ fecha: '' }, 400]]) {
      await assert.rejects(reemplazar(id, cambio), { status });
    }
    await db.query("UPDATE personal SET estado='Inactivo' WHERE id=1");
    await assert.rejects(reemplazar(id), { status: 409 });
    await db.query("UPDATE personal SET estado='Activo' WHERE id=1");
    assert.equal(await cantidad(), antes); assert.equal((await fila(id)).estado, 'Pendiente');
  });
  test('Un fallo de auditoría revierte tanto la entrega como el cierre', async () => {
    const id = await nueva(), antes = await cantidad(); fallarAuditoria = true;
    try { await assert.rejects(reemplazar(id), /Auditoría no disponible/); } finally { fallarAuditoria = false; }
    assert.equal(await cantidad(), antes); assert.equal((await fila(id)).entrega_ti_id, null); assert.equal((await fila(id)).estado, 'Pendiente');
  });
  test('Sin cambio exige motivo y foto válida antes de subir archivos', async () => {
    const id = await nueva(), antes = subida;
    await assert.rejects(cerrar(id, { motivo: '   ' }), { status: 400 });
    await assert.rejects(cerrar(id, { motivo: 'Reparada' }, null), { status: 400 });
    await assert.rejects(cerrar(id, { motivo: 'Reparada' }, { buffer: Buffer.from('pdf'), mimetype: 'application/pdf' }), { status: 400 });
    await assert.rejects(cerrar(id, { motivo: 'Reparada' }, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' }), { status: 400 });
    assert.equal(subida, antes); assert.equal((await fila(id)).estado, 'Pendiente');
  });
  test('Sin cambio guarda motivo, evidencia, usuario y fecha sin crear una entrega', async () => {
    const id = await nueva(), antes = await cantidad(); const reporte = await cerrar(id);
    assert.equal(reporte.estado, 'Resuelto'); assert.equal(reporte.aplica_cambio, false); assert.equal(reporte.entrega_ti_id, null);
    assert.match(reporte.motivo_sin_cambio, /configuración/); assert.match(reporte.evidencia_cierre_url, /^https:/); assert.equal(reporte.cerrada_por, 1);
    assert.equal(await cantidad(), antes);
    await assert.rejects(db.query("UPDATE pulseras SET estado='Pendiente' WHERE id=$1", [id]), { code: '23514' });
  });
  test('Fallo, inexistencia o doble cierre eliminan la foto recién subida y no modifican el reporte', async () => {
    const id = await nueva(); let antes = retiradas.length; fallarAuditoria = true;
    try { await assert.rejects(cerrar(id), /Auditoría no disponible/); } finally { fallarAuditoria = false; }
    assert.equal(retiradas.length, antes + 1); assert.equal((await fila(id)).estado, 'Pendiente');
    antes = retiradas.length; await assert.rejects(cerrar(999999), { status: 404 }); assert.equal(retiradas.length, antes + 1);
    await cerrar(id); antes = retiradas.length; await assert.rejects(cerrar(id), { status: 409 }); assert.equal(retiradas.length, antes + 1);
  });
  test('El selector anterior y el SQL directo no pueden saltarse la decisión de cierre', async () => {
    const id = await nueva();
    assert.equal(await actualizarEstadoReportePulsera({ id, estado: 'Resuelto', accesoTotal: true, clienteOperacionIds: [] }), null);
    await assert.rejects(db.query("UPDATE pulseras SET estado='Resuelto',fecha_cierre=now() WHERE id=$1", [id]), { code: '23514' });
    assert.equal((await fila(id)).estado, 'Pendiente');
  });
  test('Los identificadores inválidos se rechazan sin ejecutar consultas', () => {
    for (const id of ['0', '-1', '1x', '1.5', '', null, '9007199254740992']) assert.throws(() => idReportePulsera(id), { status: 400 });
  });

  const respuesta = () => ({ statusCode: 200, status(value) { this.statusCode=value; return this; }, json(body) { this.body=body; return this; } });
  test('El controlador de entrega responde 201, notifica y el listado contiene el cierre vinculado', async () => {
    for (const usuario of [1,2]) {
      const id = await nueva(), res = respuesta();
      await registrarMovimiento({ ...req(id, usuario), body: { ...datos, reporte_pulsera_id: String(id) } }, res);
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      assert.equal(res.body.reporte_pulsera_id, id); assert.equal(res.body.reporte_pulsera.estado, 'Resuelto');
      assert.equal(notificaciones.at(-1).usuarioId, 3);
      const listado = await obtenerReportesPulseras({ accesoTotal: true, clienteOperacionIds: [] });
      const reporte = listado.find(r=>r.id === id);
      assert.equal(reporte.receptor_dni, '00000001'); assert.equal(reporte.nombre_receptor, 'APELLIDO UNO, PERSONA');
      assert.equal(reporte.aplica_cambio, true); assert.equal(reporte.entrega_ti_id, res.body.id);
    }
  });
  test('El controlador de cierre sin cambio devuelve el reporte y rechaza cerrar por el selector anterior', async () => {
    const id = await nueva(), res = respuesta();
    await cerrarReportePulseraSinCambio({ ...req(id,2), body: { motivo: 'No requiere reemplazo' }, file: { buffer: Buffer.from('foto'), mimetype: 'image/png' } }, res);
    assert.equal(res.statusCode,200); assert.equal(res.body.success,true); assert.equal(res.body.reporte.aplica_cambio,false);
    assert.equal(notificaciones.at(-1).usuarioId,3);
    const otro = await nueva(), anterior = respuesta();
    await cambiarEstadoReportePulsera({ ...req(otro,2), body:{estado:'Resuelto'} },anterior);
    assert.equal(anterior.statusCode,400); assert.equal((await fila(otro)).estado,'Pendiente');
  });
  test('El controlador bloquea entregas vinculadas por supervisor antes de crear movimientos', async () => {
    const id = await nueva(), antes = await cantidad(), res = respuesta();
    await registrarMovimiento({ ...req(id,3), body:{...datos,reporte_pulsera_id:id} },res);
    assert.equal(res.statusCode,403); assert.equal(await cantidad(),antes); assert.equal((await fila(id)).estado,'Pendiente');
  });

  test('La creación habitual de entregas sigue funcionando sin un reporte de pulsera', async () => {
    const antes = await cantidad(), res = respuesta();
    await registrarMovimiento({ ...req(null,1), body:{...datos,equipo_tipo:'LAPTOP'} },res);
    assert.equal(res.statusCode,201,JSON.stringify(res.body)); assert.equal(res.body.equipo_tipo,'LAPTOP');
    assert.equal(res.body.reporte_pulsera_id,undefined); assert.equal(await cantidad(),antes+1);
  });
  test('Si falla el cambio, el controlador retira el acta recién subida y revierte la entrega', async () => {
    const id = await nueva(), antes = await cantidad(), eliminadas = retiradas.length, res = respuesta();
    fallarAuditoria=true;
    try {
      await registrarMovimiento({ ...req(id,1), body:{...datos,reporte_pulsera_id:id}, file:{buffer:Buffer.from('acta'),mimetype:'application/pdf'} },res);
    } finally { fallarAuditoria=false; }
    assert.equal(res.statusCode,500); assert.equal(await cantidad(),antes); assert.equal((await fila(id)).estado,'Pendiente');
    assert.equal(retiradas.length,eliminadas+1);
  });

}
