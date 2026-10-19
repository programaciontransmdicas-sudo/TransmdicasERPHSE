// Integración PostgreSQL local. No conecta con Neon ni modifica una base real.
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
let PGlite;
try { ({ PGlite } = await import(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

test('Consulta SQL del Excel: nombres maestros, alcance del programa y OT cerradas sin duplicar equipos', {
  skip: !PGlite && 'PGlite no está instalado para esta prueba local.'
}, async () => {
  const db = new PGlite();
  const client = { query: (sql, params) => db.query(sql, params), release() {} };
  mock.module('../src/config/database.js', { namedExports: { pool: { connect: async () => client } } });
  const { leerProgramaExcel } = await import('../src/modules/programas/programacion/excel/repository.js');
  const { prepararReporte } = await import('../src/modules/programas/programacion/excel/service.js');
  try {
    await db.exec(`
      CREATE TABLE programas_mantenimiento(id int,codigo text,nombre text,estado text,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE programas_mantenimiento_versiones(id int,programa_id int,version text,fecha_documento date,vigencia_desde date,vigencia_hasta date,periodo_inicio date,periodo_fin date,estado text,observaciones text,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE clientes(id int,nombre text);
      CREATE TABLE cliente_operaciones(id int,cliente_id int,nombre text);
      CREATE TABLE vehiculos(placa text,tipo_vehiculo text,marca_tracto text,modelo_tracto text,anio_fabricacion int,cliente_operacion_id int,cliente text,operacion text);
      CREATE TABLE programa_mantenimiento_unidades(id int,programa_id int,placa text,quincena_incorporacion date,observaciones text);
      CREATE TABLE programacion_mantenimiento(id int,programa_id int,programa_unidad_id int,estado text,quincena_programada date,quincena_reprogramada date,quincena_efectiva date,fecha_ejecucion date,observaciones text);
      CREATE TABLE programacion_mantenimiento_equipos(id int,programacion_id int,tipo_equipo text,nivel_mantenimiento text);
      CREATE TABLE ordenes_trabajo(id int,programacion_id int,estado text);
      CREATE TABLE ordenes_trabajo_detalle(id int,orden_trabajo_id int,programacion_equipo_id int,estado text,nivel_completado text);
      CREATE TABLE programacion_mantenimiento_ajustes(id int,programacion_id int,tipo text,quincena_anterior date,quincena_destino date,motivo text);
      CREATE TABLE programa_mantenimiento_unidad_ciclos(programa_id int,programa_unidad_id int,tipo_equipo text,nivel_mantenimiento text,ultima_quincena date,ultima_fecha_real date);
      INSERT INTO programas_mantenimiento VALUES(90,'TI-PR-01','Programa','ACTIVO',now(),now()),(91,'OTRO','Otro','ACTIVO',now(),now());
      INSERT INTO programas_mantenimiento_versiones VALUES(63,90,'01','2026-09-25','1900-01-01',NULL,'2026-09-01','2026-12-31','VIGENTE',NULL,now(),now());
      INSERT INTO clientes VALUES(1,'REPSOL');
      INSERT INTO cliente_operaciones VALUES(17,1,'QUELLAVECO');
      INSERT INTO vehiculos VALUES('V0I941','TRACTO','INTERNATIONAL','PROSTAR',2020,17,'Antiguo','Antigua');
      INSERT INTO programa_mantenimiento_unidades VALUES(10,90,'V0I941',NULL,NULL),(11,91,'OTR111',NULL,NULL);
      INSERT INTO programacion_mantenimiento VALUES(100,90,10,'EJECUTADO','2026-10-01',NULL,'2026-10-01','2026-10-05',NULL);
      INSERT INTO programacion_mantenimiento_equipos VALUES(1000,100,'CAMARAS','M1'),(1001,100,'COPILOTO','M1'),(1002,100,'RADIO_BASE','M1');
      INSERT INTO ordenes_trabajo VALUES(1,100,'CERRADA'),(2,100,'ANULADA');
      INSERT INTO ordenes_trabajo_detalle VALUES(1,1,1000,'COMPLETADO','M1'),(2,1,1001,'COMPLETADO','M1'),(3,1,1002,'COMPLETADO','M1'),(4,2,1000,'COMPLETADO','M3');
      INSERT INTO programa_mantenimiento_unidad_ciclos VALUES(90,10,'CAMARAS','M1','2026-10-01','2026-10-05');
    `);
    const datos = await leerProgramaExcel(90);
    assert.equal(datos.unidades.length, 1);
    assert.equal(datos.unidades[0].cliente, 'REPSOL');
    assert.equal(datos.unidades[0].operacion, 'QUELLAVECO');
    assert.equal(datos.visitas.length, 1);
    assert.equal(datos.visitas[0].equipos.length, 3);
    assert.equal(datos.visitas[0].resultados.length, 3);
    assert.equal(datos.ciclos.length, 1);
    assert.equal(datos.version.fecha_documento, '2026-09-25');
    const f=prepararReporte(datos).filas[0];
    assert.equal(f.programados, 1);
    assert.equal(f.ejecutados, 1);
    assert.equal(f.porcentaje, 1);
    assert.equal(f.matriz.get('2026-10-01').texto, 'M1');
    await assert.rejects(leerProgramaExcel(999), e => e.status === 404);
  } finally { await db.close(); }
});
