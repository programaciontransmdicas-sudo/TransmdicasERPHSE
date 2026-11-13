import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'x'.repeat(64);
const { estadoMantenimiento, leerIndicadoresMantenimiento } = await import('../src/modules/stats/mantenimiento.js');

test('El vencimiento usa fin de quincena efectiva y fecha de Perú', () => {
  assert.equal(estadoMantenimiento([{ estado:'REPROGRAMADO', quincena_efectiva:'2026-11-16' }], '2026-11-12').estado, 'AL DÍA');
  assert.equal(estadoMantenimiento([{ estado:'PROGRAMADO', quincena_efectiva:'2026-11-01' }], '2026-11-12').estado, 'POR VENCER');
  assert.equal(estadoMantenimiento([{ estado:'PROYECTADO', quincena_efectiva:'2026-11-01' }], '2026-11-16').estado, 'VENCIDA');
});
test('No presenta datos ausentes o visitas canceladas como unidades al día', () => {
  assert.equal(estadoMantenimiento([], '2026-11-12').estado, 'SIN INFORMACIÓN');
  assert.equal(estadoMantenimiento([{ estado:'CANCELADO', quincena_efectiva:'2026-10-01' }], '2026-11-12').estado, 'SIN INFORMACIÓN');
});
test('Los resultados se leen en una instantánea y preservan el alcance', async () => {
  const calls = [];
  const client = { async query(sql, args) { calls.push({sql,args});
    if (sql.includes(' AS hoy')) return { rows:[{hoy:'2026-11-12'}] };
    if (sql.includes('FROM vehiculos v')) return { rows:[{placa:'ABC123', visitas:[{estado:'PROGRAMADO',quincena_efectiva:'2026-11-01'}]}] };
    if (sql.includes('FROM ordenes_trabajo o')) return { rows:[{id:1,equipos:[{tipo:'GPS',estado:'NO_APLICA'}]}] };
    return { rows:[] };
  }, release() { calls.push({sql:'RELEASE'}); } };
  const datos = await leerIndicadoresMantenimiento({accesoTotal:false,clienteOperacionIds:[4]}, {connect:async()=>client});
  assert.equal(datos.unidades[0].estado, 'POR VENCER');
  assert.equal(datos.ordenes[0].equipos[0].estado, 'NO_APLICA');
  assert.ok(calls[0].sql.includes('REPEATABLE READ READ ONLY'));
  assert.deepEqual(calls.find(x=>x.sql.includes('FROM vehiculos v')).args,[false,[4],null]);
  assert.equal(calls.at(-2).sql,'COMMIT');
});
