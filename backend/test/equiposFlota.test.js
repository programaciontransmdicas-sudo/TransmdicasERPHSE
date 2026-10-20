import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { TIPOS_EQUIPO_VEHICULO, prepararEquiposVehiculo, clavePlaca } from '../src/modules/flota/equiposService.js';

const muestra = () => TIPOS_EQUIPO_VEHICULO.map(tipo_equipo => ({
  tipo_equipo, estado_inventario: tipo_equipo === 'GPS' ? 'INSTALADO' : 'NO_APLICA'
}));
test('conserva letras y ceros al normalizar la placa', () => {
  assert.equal(clavePlaca(' v0j-700 '), 'V0J700');
  assert.equal(clavePlaca('VDO-898'), 'VDO898');
  assert.notEqual(clavePlaca('VDO898'), clavePlaca('VD0898'));
  assert.throws(() => clavePlaca('../abc'), /placa válida/);
});
test('exige declarar los siete tipos sin omitir ni duplicar dispositivos', () => {
  assert.throws(() => prepararEquiposVehiculo(undefined), /siete/);
  assert.throws(() => prepararEquiposVehiculo([]), /siete/);
  const duplicados = muestra(); duplicados[6] = duplicados[0];
  assert.throws(() => prepararEquiposVehiculo(duplicados), /repetido/);
});
test('un solo DVR sustituye las dos clasificaciones antiguas; las cámaras siguen separadas', () => {
  const preparados = prepararEquiposVehiculo(muestra());
  assert.equal(preparados.filter(e => e.tipo_equipo === 'DVR').length, 1);
  assert.ok(preparados.some(e => e.tipo_equipo === 'CAMARA_INTERNA'));
  assert.ok(preparados.some(e => e.tipo_equipo === 'CAMARA_EXTERNA'));
  for (const tipo of ['DVR_INTERNO', 'DVR_EXTERNO']) {
    const datos = muestra(); datos[0].tipo_equipo = tipo;
    assert.throws(() => prepararEquiposVehiculo(datos), /desconocido/);
  }
});
test('un dispositivo instalado puede conservar datos técnicos desconocidos como null', () => {
  const gps = prepararEquiposVehiculo(muestra()).find(e => e.tipo_equipo === 'GPS');
  assert.equal(gps.estado_inventario, 'INSTALADO');
  assert.equal(gps.marca, null); assert.equal(gps.modelo, null);
});
test('valida los datos técnicos sin aceptar objetos ni texto excesivo', () => {
  const datos = muestra(); datos[6].modelo = { inyectado: true };
  assert.throws(() => prepararEquiposVehiculo(datos), /texto/);
  datos[6].modelo = 'x'.repeat(121);
  assert.throws(() => prepararEquiposVehiculo(datos), /120/);
  datos[6].modelo = '  Pro4  ';
  assert.equal(prepararEquiposVehiculo(datos)[6].modelo, 'Pro4');
});
test('no aplica y por confirmar no admiten datos de instalación', () => {
  for (const estado of ['NO_APLICA', 'POR_VALIDAR']) {
    const datos = muestra(); datos[6].estado_inventario = estado; datos[6].modelo = 'Pro4';
    assert.throws(() => prepararEquiposVehiculo(datos), /únicamente/);
  }
});
test('rechaza fechas inexistentes y futuras y conserva fechas válidas', () => {
  for (const fecha of ['2026-02-30', '2026-10-21', '20/10/2026']) {
    const datos = muestra(); datos[6].fecha_instalacion = fecha;
    assert.throws(() => prepararEquiposVehiculo(datos, '2026-10-20'), /fecha de instalación/);
  }
  const datos = muestra(); datos[6].fecha_instalacion = '2024-02-29';
  assert.equal(prepararEquiposVehiculo(datos, '2026-10-20')[6].fecha_instalacion, '2024-02-29');
});

process.env.JWT_SECRET = 'prueba_equipos_sin_validez_real_'.repeat(4);
let consultas = 0;
mock.module('../src/config/database.js', {
  namedExports: { pool: { query: async () => { consultas++; return { rows: [] }; } } }
});
mock.module('../src/services/auditService.js', { namedExports: { logAction: async () => {} } });
const { actualizarEquiposVehiculo, consultarEquiposVehiculo } = await import('../src/modules/flota/equiposController.js');
const respuesta = () => ({ codigo: 200, status(c) { this.codigo = c; return this; },
  json(datos) { this.datos = datos; return this; }, setHeader() {} });
test('TI y supervisor no pueden cambiar el inventario de una unidad existente', async () => {
  consultas = 0;
  for (const rol of ['ti', 'supervisor']) {
    const res = respuesta();
    await actualizarEquiposVehiculo({ user: { rol }, params: { placa: 'V0J700' }, body: { equipos: muestra() } }, res);
    assert.equal(res.codigo, 403);
  }
  assert.equal(consultas, 0);
});
test('la consulta sin una unidad accesible devuelve 404 sin leer sus equipos', async () => {
  consultas = 0; const res = respuesta();
  await consultarEquiposVehiculo({ user: { rol: 'supervisor', clienteOperacionIds: [17] }, params: { placa: 'V0J700' } }, res);
  assert.equal(res.codigo, 404); assert.equal(consultas, 1);
});
