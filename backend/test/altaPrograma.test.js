import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararInicioPrograma } from '../src/modules/flota/altaProgramaService.js';
import { generar } from '../scripts/ti-pr-01/generador-nucleo.mjs';

const frecuencias = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'].flatMap(tipo_equipo =>
  [['M1', 1], ['M2', 6], ['M3', 12]].map(([nivel_mantenimiento, frecuencia_quincenas]) =>
    ({ tipo_equipo, nivel_mantenimiento, frecuencia_quincenas }))
).concat(['GPS', 'ADAS'].map(tipo_equipo =>
  ({ tipo_equipo, nivel_mantenimiento: 'M3', frecuencia_quincenas: 24 })));
const instalados = ['CAMARA_INTERNA', 'COPILOTO', 'RADIO_BASE'].map(tipo_equipo =>
  ({ tipo_equipo, estado_inventario: 'INSTALADO' }));

test('inicia M1 en la quincena actual, M2 tras seis y M3 tras doce quincenas', () => {
  const inicio = prepararInicioPrograma(instalados, frecuencias, '2026-10-20');
  assert.equal(inicio.quincena, '2026-10-16');
  const insumos = {
    refs: inicio.anclas.map(a => ({ unidad: 1, familia: a.familia, nivel: a.nivel, q_ref: a.quincena,
      frec: frecuencias.find(f => f.tipo_equipo === a.familia && f.nivel_mantenimiento === a.nivel).frecuencia_quincenas })),
    uni: new Map([[1, { placa: 'ABC123', programa_id: 90 }]]),
    APLICA: new Map(inicio.regulares.map(f => [`1|${f}`, 'APLICA'])),
    conFase: new Set(inicio.regulares.map(f => `1|${f}`)),
    vers: [{ id: 63, version: '01', vigencia_desde: '2026-09-25', vigencia_hasta: null }]
  };
  const { visitas } = generar(insumos, inicio.quincena, '2027-04-16');
  assert.equal(visitas[0].quincena, '2026-10-16');
  assert.equal(visitas[0].nivel_regular, 'M1');
  assert.equal(visitas.find(v => v.nivel_regular === 'M2').quincena, '2027-01-16');
  assert.equal(visitas.find(v => v.nivel_regular === 'M3').quincena, '2027-04-16');
  assert.ok(visitas.every(v => v.detalles.length === 3));
});
test('usa días 1 y 16 y cruza de año sin sumar quince días fijos', () => {
  for (const [fecha, inicio] of [['2026-10-15', '2026-10-01'], ['2026-10-16', '2026-10-16'],
    ['2026-12-31', '2026-12-16'], ['2027-01-01', '2027-01-01']]) {
    assert.equal(prepararInicioPrograma(instalados, frecuencias, fecha).quincena, inicio);
  }
});
test('incluye solo familias instaladas y DVR no crea un mantenimiento independiente', () => {
  const inicio = prepararInicioPrograma([
    { tipo_equipo: 'DVR', estado_inventario: 'INSTALADO' },
    { tipo_equipo: 'CAMARA_INTERNA', estado_inventario: 'POR_VALIDAR' },
    { tipo_equipo: 'CAMARA_EXTERNA', estado_inventario: 'NO_APLICA' },
    { tipo_equipo: 'COPILOTO', estado_inventario: 'NO_APLICA' },
    { tipo_equipo: 'RADIO_BASE', estado_inventario: 'INSTALADO' }
  ], frecuencias, '2026-10-20');
  assert.deepEqual(inicio.regulares, ['RADIO_BASE']);
  assert.equal(inicio.anclas.length, 3);
  assert.match(inicio.pendientes[0], /Cámaras/);
});
test('instalación conocida permite anual GPS, sin subir el nivel regular', () => {
  const inicio = prepararInicioPrograma([
    ...instalados, { tipo_equipo: 'GPS', estado_inventario: 'INSTALADO', fecha_instalacion: '2025-11-20' }
  ], frecuencias, '2026-10-20');
  assert.deepEqual(inicio.anclas.find(a => a.familia === 'GPS'),
    { familia: 'GPS', nivel: 'M3', quincena: '2025-11-16' });
  assert.equal(inicio.pendientes.length, 0);
});
test('sin fecha no inventa una revisión anual y conserva el alcance TRACKLOG de ADAS', () => {
  for (const equipo of [
    { tipo_equipo: 'GPS', estado_inventario: 'INSTALADO' },
    { tipo_equipo: 'ADAS', estado_inventario: 'INSTALADO', marca: 'MIX', fecha_instalacion: '2025-11-01' },
    { tipo_equipo: 'ADAS', estado_inventario: 'INSTALADO' }
  ]) {
    const inicio = prepararInicioPrograma([equipo], frecuencias, '2026-10-20');
    assert.equal(inicio.anclas.length, 0); assert.equal(inicio.pendientes.length, 1);
  }
  const inicio = prepararInicioPrograma([
    { tipo_equipo: 'ADAS', estado_inventario: 'INSTALADO', marca: 'Tracklog', fecha_instalacion: '2025-11-01' }
  ], frecuencias, '2026-10-20');
  assert.equal(inicio.anclas[0].familia, 'ADAS');
});
test('avisa de anual vencido sin inventar una fecha de mantenimiento realizado', () => {
  const inicio = prepararInicioPrograma([
    { tipo_equipo: 'GPS', estado_inventario: 'INSTALADO', fecha_instalacion: '2024-11-20' }
  ], frecuencias, '2026-10-20');
  assert.equal(inicio.anclas[0].quincena, '2024-11-16');
  assert.match(inicio.pendientes[0], /ya venció/);
});
test('una frecuencia faltante o inválida impide un alta con programación incompleta', () => {
  for (const fr of [[], frecuencias.filter(f => f.tipo_equipo !== 'CAMARAS'),
    frecuencias.map(f => ({ ...f, frecuencia_quincenas: 0 }))]) {
    assert.throws(() => prepararInicioPrograma(instalados, fr, '2026-10-20'), e => e.status === 409);
  }
});
