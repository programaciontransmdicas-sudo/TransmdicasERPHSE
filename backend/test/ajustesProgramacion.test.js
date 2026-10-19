import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planificar, indice, quincena, crearReloj, MOTIVOS } from '../src/modules/programas/programacion/ajustes/planificador.js';
import { generar, continuarAjustadas } from '../scripts/ti-pr-01/generador-nucleo.mjs';
import { escenario, fecha, visita, referencias, frecuencias, versiones } from './helpers/ajustesFixtures.js';
const nivel = c => c.despues.equipos[0].nivel_mantenimiento;
const aplicar = (base, plan) => base.visitas.map(v => plan.cambios.find(c => c.antes.id === v.id)?.despues ?? v);
test('Mover M3 a una quincena ocupada desplaza la cadena sin perder identidades ni equipos', () => {
  const b = escenario(6);
  b.visitas[0].equipos.forEach(e => e.nivel_mantenimiento = 'M3');
  const previo = structuredClone(b);
  const p = planificar({
    ...b,
    destino: '2026-11-01'
  });
  assert.deepEqual(b, previo, 'la previsualización no muta los insumos');
  assert.equal(p.cambios.find(c => c.antes.id === 1).despues.quincena_efectiva, '2026-11-01');
  assert.equal(p.cambios.find(c => c.antes.id === 2).despues.quincena_efectiva, '2026-11-16');
  const resultado = aplicar(b, p);
  assert.equal(new Set(resultado.map(v => v.quincena_efectiva)).size, 6);
  for (const v of resultado) assert.equal(v.quincena_programada, previo.visitas.find(a => a.id === v.id).quincena_programada);
});
test('Elevar a M3 reinicia la proyección M2 a 6 quincenas y M3 a 12, nunca por días', () => {
  const b = escenario();
  const p = planificar({
    ...b,
    nuevoNivel: 'M3'
  });
  const r = aplicar(b, p);
  for (let i = 1; i < 6; i++) assert.equal(r[i].equipos[0].nivel_mantenimiento, 'M1');
  assert.equal(r[6].equipos[0].nivel_mantenimiento, 'M2');
  assert.equal(r[12].equipos[0].nivel_mantenimiento, 'M3');
  assert.equal(r[1].quincena_efectiva, '2026-11-01');
});
test('Elevar M1 a M2 elimina el M2 inmediato que ya estaba proyectado', () => {
  const b = escenario(9);
  b.visitas[1].equipos.forEach(e => e.nivel_mantenimiento = 'M2');
  const r = aplicar(b, planificar({
    ...b,
    nuevoNivel: 'M2'
  }));
  assert.equal(r[0].equipos[0].nivel_mantenimiento, 'M2');
  assert.equal(r[1].equipos[0].nivel_mantenimiento, 'M1');
  assert.equal(r[6].equipos[0].nivel_mantenimiento, 'M2');
});
test('Las frecuencias se leen de configuración, incluso si M2 cambia a 4 quincenas', () => {
  const b = escenario(7);
  b.frecuencias = frecuencias.map(f => ({
    ...f,
    frecuencia_quincenas: f.nivel_mantenimiento === 'M2' ? 4 : f.frecuencia_quincenas
  }));
  const r = aplicar(b, planificar({
    ...b,
    nuevoNivel: 'M3'
  }));
  assert.equal(r[4].equipos[0].nivel_mantenimiento, 'M2');
});
test('No se baja M2 a M1, ni M3 a M2', () => {
  for (const [antes, despues] of [['M2', 'M1'], ['M3', 'M2']]) {
    const b = escenario();
    b.visitas[0].equipos.forEach(e => e.nivel_mantenimiento = antes);
    assert.throws(() => planificar({
      ...b,
      nuevoNivel: despues
    }), /Solo puede/);
  }
});
test('Mantener el mismo nivel y repetir el destino son operaciones idempotentes', () => {
  const b = escenario();
  assert.equal(planificar({
    ...b,
    nuevoNivel: 'M1'
  }).cambios.length, 0);
  const p = planificar({
    ...b,
    destino: '2026-11-01'
  });
  const r = aplicar(b, p);
  assert.equal(planificar({
    ...b,
    visitas: r,
    destino: '2026-11-01'
  }).cambios.length, 0);
});
test('OT abierta, cerrada y anulada impiden cambiar silenciosamente su alcance', () => {
  for (const estado of ['ABIERTA', 'CERRADA', 'ANULADA']) {
    const b = escenario();
    b.visitas[1].ot_total = 1;
    b.visitas[1].ot_estado = estado;
    assert.throws(() => planificar({
      ...b,
      destino: '2026-11-01'
    }), /tiene una orden|historial/);
  }
});
test('Una OT futura cuyo nivel ya coincide no bloquea el cambio de otra visita', () => {
  const b = escenario(3);
  b.visitas[2].ot_total = 1;
  assert.doesNotThrow(() => planificar({
    ...b,
    nuevoNivel: 'M2'
  }));
});
test('Resultados históricos y cancelados no se sobrescriben', () => {
  const b = escenario();
  b.visitas[0].estado = 'EJECUTADO';
  assert.throws(() => planificar({
    ...b,
    nuevoNivel: 'M3'
  }), /histórico/);
  b.visitas[0].estado = 'CANCELADO';
  assert.throws(() => planificar({
    ...b,
    nuevoNivel: 'M3'
  }), /no encontrada/);
});
test('No se ofrecen quincenas pasadas ni se eleva una visita vencida sin reprogramarla', () => {
  const b = escenario();
  assert.throws(() => planificar({
    ...b,
    destino: '2026-10-01'
  }), /terminó/);
  b.visitas[0].quincena_efectiva = '2026-10-01';
  assert.throws(() => planificar({
    ...b,
    nuevoNivel: 'M3'
  }), /Reprograme/);
});
test('Solo se admite la quincena inmediatamente siguiente; no se adelanta ni se saltan quincenas', () => {
  const b = escenario(5);
  for (const destino of ['2026-11-16', '2027-01-01']) {
    assert.throws(() => planificar({ ...b, destino }), e => e.status === 400 && e.code === 'DESTINO_NO_ES_SIGUIENTE_QUINCENA');
  }
  assert.throws(() => planificar({ ...b, seleccionadaId: 3, destino: fecha }), /siguiente quincena/);
  assert.doesNotThrow(() => planificar({ ...b, destino: '2026-11-01' }));
});
test('La siguiente quincena respeta el cambio de mes y de año', () => {
  for (const [origen, destino] of [['2026-10-01','2026-10-16'],['2026-10-16','2026-11-01'],['2026-12-16','2027-01-01']]) {
    const b = escenario(1);
    b.fechaNegocio = origen;
    Object.assign(b.visitas[0], { quincena_efectiva: origen, quincena_programada: origen });
    assert.doesNotThrow(() => planificar({ ...b, destino }));
  }
});
test('Sin versión o frecuencia válida se rechaza todo el ajuste', () => {
  const b = escenario();
  assert.throws(() => planificar({
    ...b,
    nuevoNivel: 'M3',
    versiones: []
  }), /versión/);
  assert.throws(() => planificar({
    ...b,
    nuevoNivel: 'M3',
    frecuencias: frecuencias.filter(f => f.tipo_equipo !== 'COPILOTO' || f.nivel_mantenimiento !== 'M3')
  }), /frecuencia/);
});
test('GPS y ADAS no cambian de nivel ni se reinician por un M3 regular', () => {
  const b = escenario();
  b.visitas[2].equipos.push({
    id: 999,
    tipo_equipo: 'GPS',
    nivel_mantenimiento: 'M3'
  });
  const r = aplicar(b, planificar({
    ...b,
    nuevoNivel: 'M3'
  }));
  assert.equal(r[2].equipos.at(-1).nivel_mantenimiento, 'M3');
  const reloj = crearReloj(referencias, frecuencias);
  reloj.cubrir('CAMARAS', 'M3', indice(fecha));
  assert.equal(reloj.refs.get('GPS|M3'), indice('2026-10-01'));
});
test('El cierre parcial se recalcula desde los ciclos reales, no desde el M3 que se esperaba', () => {
  const b = escenario(10);
  b.visitas[0].estado = 'PARCIAL';
  b.visitas[0].ot_total = 1;
  b.visitas[0].equipos.forEach(e => e.nivel_mantenimiento = 'M3');
  b.referencias = referencias.map(r => ({
    ...r,
    quincena: r.nivel_mantenimiento === 'M1' ? fecha : r.nivel_mantenimiento === 'M2' ? '2026-07-01' : r.quincena
  }));
  const r = aplicar(b, planificar({
    ...b,
    soloRecalculo: true
  }));
  assert.equal(r[1].equipos[0].nivel_mantenimiento, 'M2');
});
test('Cambiar el nivel no fabrica fechas reales ni ciclos; motivos son cuatro opciones cerradas', () => {
  const b = escenario();
  const p = planificar({
    ...b,
    nuevoNivel: 'M3'
  });
  assert.ok(p.cambios.every(c => !c.despues.fecha_ejecucion));
  assert.deepEqual(b.referencias, referencias);
  assert.equal(MOTIVOS.length, 4);
});
function insumos() {
  const b = escenario(1);
  b.visitas[0].equipos.forEach(e => e.nivel_mantenimiento = 'M3');
  return {
    programaId: 1,
    refs: referencias.map(r => ({
      unidad: 10,
      familia: r.tipo_equipo,
      nivel: r.nivel_mantenimiento,
      q_ref: r.quincena,
      frec: r.frecuencia_quincenas
    })),
    frecuencias,
    ajustadas: new Set([10]),
    fechaNegocio: fecha,
    APLICA: new Map(['CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS'].map(f => [`10|${f}`, 'APLICA'])),
    uni: new Map([[10, {
      id: 10,
      placa: 'V0Y781',
      programa_id: 1
    }]]),
    conFase: new Set(['CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS'].map(f => `10|${f}`)),
    frecOk: new Set(frecuencias.map(f => `${f.tipo_equipo}|${f.nivel_mantenimiento}`)),
    vers: versiones,
    materializadas: new Map(),
    slots: new Map([[`10|${fecha}`, {
      unidad: 10,
      q_efectiva: fecha,
      estado: 'PROGRAMADO',
      nivelDe: new Map(b.visitas[0].equipos.map(e => [e.tipo_equipo, e.nivel_mantenimiento]))
    }]])
  };
}
test('El generador continúa la cadencia ajustada y no recupera el antiguo M2 adelantado', () => {
  const ins = insumos();
  const r = generar(ins, fecha, '2027-05-01');
  assert.equal(r.visitas.find(v => v.quincena === '2027-01-16').nivel_regular, 'M2');
  assert.equal(r.visitas.find(v => v.quincena === '2027-04-16').nivel_regular, 'M3');
  assert.equal(r.colisiones.length, 0);
});
test('El generador no rellena el origen de una reprogramación y repetir no duplica el plan', () => {
  const ins = insumos();
  const v = ins.slots.values().next().value;
  v.q_efectiva = '2026-11-01';
  ins.slots = new Map([['10|2026-11-01', v]]);
  const r = generar(ins, fecha, '2027-03-01');
  assert.ok(r.visitas.every(v => v.quincena > '2026-11-01'));
  for (const v of r.visitas) ins.slots.set(`10|${v.quincena}`, {
    unidad: 10,
    q_efectiva: v.quincena,
    estado: 'PROYECTADO',
    nivelDe: new Map(v.detalles.map(d => [d.familia, d.nivel]))
  });
  assert.equal(generar(ins, fecha, '2027-03-01').visitas.length, 0);
});
test('La proyección anual mantiene su frecuencia de 24 quincenas independientemente de las regulares', () => {
  const ins = insumos();
  const r = continuarAjustadas(ins, fecha, '2027-10-01');
  const gps = r.filter(x => x.familia === 'GPS');
  assert.equal(gps.length, 1);
  assert.equal(quincena(gps[0].i), '2027-10-01');
});
