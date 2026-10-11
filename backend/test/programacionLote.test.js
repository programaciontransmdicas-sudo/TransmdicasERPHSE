// TI-PR-01 · F4.1 · PATCH .../programacion/programar-lote
// ============================================================================
// Cubre la rama de EXITO del controller sin tocar ninguna base de datos: se simulan el
// repositorio, el pool y la auditoria, y se prueba el controller y el service REALES. La
// clasificacion por visita sigue saliendo de bloqueos(), que no se simula.
//
// Por que con mocks y no contra db-refactor: confirmar una visita es IRREVERSIBLE -no
// existe PROGRAMADO -> PROYECTADO y el unico camino de vuelta es cancelar, que es
// terminal-, asi que la rama de exito no se puede ensayar sobre datos reales sin
// consumirlos. Lo que si se verifica aqui es que el controller llama a la capa correcta,
// con los argumentos correctos, y que su respuesta tiene la forma exacta del contrato.
//
//   node --experimental-test-module-mocks --test test/programacionLote.test.js
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let llamadas;
let visitasEnBase;
let escribiraIds;

// Una visita con la forma que publica el repositorio: COLUMNAS mas los recuentos de OT.
const visita = (id, estado, extra = {}) => ({
  id,
  programa_id: 90,
  programa_unidad_id: 2000 + id,
  placa: `ZZ${id}`,
  estado,
  quincena_programada: '2026-10-01',
  quincena_reprogramada: null,
  quincena_efectiva: '2026-10-01',
  fecha_ejecucion: null,
  version_programa_id: 63,
  observaciones: null,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
  ot_total: 0,
  ot_abiertas: 0,
  ot_cerradas: 0,
  ot_anuladas: 0,
  ot_no_anuladas: 0,
  ...extra
});

const equipo = (id, programacionId, tipo, nivel) => ({
  id,
  programacion_id: programacionId,
  tipo_equipo: tipo,
  nivel_mantenimiento: nivel,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z'
});

mock.module('../src/modules/programas/programacion/repository.js', {
  namedExports: {
    obtenerVisitasParaLote: async (programaId, ids) => {
      llamadas.push(['leerLote', programaId, [...ids]]);

      // Segunda lectura: devuelve el estado YA actualizado, como haria la base dentro de
      // la transaccion despues del UPDATE.
      const leidas = llamadas.filter(l => l[0] === 'leerLote').length;

      return visitasEnBase
        .filter(v => ids.includes(v.id))
        .map(v => (
          leidas > 1 && escribiraIds.includes(v.id)
            ? { ...v, estado: 'PROGRAMADO' }
            : v
        ));
    },
    programarVisitasEnLote: async (programaId, ids) => {
      llamadas.push(['escribirLote', programaId, [...ids]]);

      return ids.filter(id => escribiraIds.includes(id));
    },
    obtenerEquiposDeVisitas: async ids => {
      llamadas.push(['equipos', [...ids]]);

      return new Map(ids.map(id => [id, [
        equipo(id * 10 + 1, id, 'CAMARAS', 'M1'),
        equipo(id * 10 + 2, id, 'COPILOTO', 'M1'),
        equipo(id * 10 + 3, id, 'RADIO_BASE', 'M1')
      ]]));
    },
    // El resto del repositorio no se usa en esta ruta, pero el modulo entero se sustituye.
    obtenerProgramacion: async () => [],
    contarProgramacion: async () => 0,
    obtenerVisitaPorId: async () => null,
    programarVisita: async () => true,
    reprogramarVisita: async () => true,
    cancelarVisita: async () => true,
    // F4.2: el controller la importa para el catalogo de destinos. Programar un lote no
    // mira la ocupacion de quincenas -no mueve ninguna-, pero el modulo simulado tiene que
    // ofrecer todo lo que el controller importa o la importacion falla entera.
    obtenerQuincenasOcupadasDeUnidad: async () => []
  }
});

mock.module('../src/modules/programas/repository.js', {
  namedExports: {
    existePrograma: async id => {
      llamadas.push(['existePrograma', id]);

      return id === 90;
    },
    // F4.2: misma razon. El lote no consulta la version: no cambia ninguna quincena.
    obtenerVersionAplicable: async () => ({
      fecha_negocio: '2026-10-09',
      version: null
    })
  }
});

// El pool se sustituye por un cliente que solo registra las sentencias de transaccion: el
// SQL real ya esta cubierto por el repositorio simulado.
mock.module('../src/config/database.js', {
  namedExports: {
    pool: {
      connect: async () => ({
        query: async texto => {
          llamadas.push(['sql', texto]);

          return { rows: [], rowCount: 0 };
        },
        release: () => { llamadas.push(['release']); }
      })
    }
  }
});

mock.module('../src/services/auditService.js', {
  namedExports: {
    logAction: async (userId, accion, tabla, req, antes, despues, opciones) => {
      llamadas.push(['auditar', antes.id, accion, tabla, Boolean(opciones?.client)]);
    }
  }
});

const { programarLote } = await import(
  '../src/modules/programas/programacion/controller.js'
);

beforeEach(() => {
  llamadas = [];
  visitasEnBase = [];
  escribiraIds = [];
});

const solicitud = (ids, programaId = '90') => ({
  body: { ids },
  params: { programaId },
  user: { id: 3 },
  method: 'PATCH',
  originalUrl: `/api/programas-mantenimiento/${programaId}/programacion/programar-lote`,
  headers: {},
  ip: '127.0.0.1'
});

const respuesta = () => ({
  codigo: 200,
  status(codigo) { this.codigo = codigo; return this; },
  json(datos) { this.datos = datos; return this; }
});

const sentencias = () => llamadas
  .filter(l => l[0] === 'sql')
  .map(l => l[1]);

// =====================================================================================
test('éxito · tres PROYECTADO quedan confirmadas y la respuesta cumple el contrato', async () => {
  visitasEnBase = [
    visita(11, 'PROYECTADO'),
    visita(12, 'PROYECTADO'),
    visita(13, 'PROYECTADO')
  ];
  escribiraIds = [11, 12, 13];

  const res = respuesta();

  await programarLote(solicitud([13, 11, 12]), res);

  assert.equal(res.codigo, 200, 'status 200');

  const d = res.datos;

  // --- estructura exacta del contrato
  assert.deepEqual(
    Object.keys(d).sort(),
    [
      'confirmadas', 'descripcion', 'duplicados_colapsados', 'ids_confirmados',
      'ids_unicos', 'ids_ya_programados', 'programa_id', 'programacion',
      'quincenas', 'solicitadas', 'ya_estaban_programadas'
    ],
    'las 11 claves del contrato, sin sobrantes ni faltantes'
  );

  assert.equal(d.programa_id, 90);
  assert.equal(d.solicitadas, 3);
  assert.equal(d.ids_unicos, 3);
  assert.equal(d.duplicados_colapsados, 0);
  assert.equal(d.confirmadas, 3);
  assert.equal(d.ya_estaban_programadas, 0);

  // --- ids_confirmados, ordenados
  assert.deepEqual(d.ids_confirmados, [11, 12, 13], 'ids_confirmados ordenados');
  assert.deepEqual(d.ids_ya_programados, [], 'ninguna era idempotente');

  // --- quincenas
  assert.deepEqual(d.quincenas, ['2026-10-01'], 'la quincena del lote');

  // --- programacion fresca, ya presentada
  assert.equal(d.programacion.length, 3, 'una visita por id del lote');
  assert.ok(
    d.programacion.every(v => v.estado === 'PROGRAMADO'),
    'las tres vuelven con estado PROGRAMADO'
  );
  assert.ok(
    d.programacion.every(v => v.unidad && v.ordenes_trabajo && v.acciones && v.equipos),
    'cada visita viene presentada: unidad, ordenes_trabajo, acciones y equipos'
  );
  assert.equal(
    d.programacion[0].equipos.total, 3,
    'el alcance viaja con la visita'
  );
  assert.deepEqual(
    d.programacion[0].equipos.items.map(e => e.tipo_equipo),
    ['CAMARAS', 'COPILOTO', 'RADIO_BASE'],
    'solo las tres familias regulares, sin DVR'
  );
  assert.ok(
    d.programacion.every(v => v.ot_total === undefined && v.placa === undefined),
    'presentar() reparte los recuentos y la placa, no los deja crudos'
  );

  // --- el controller llamo a la capa correcta, con los argumentos correctos
  assert.deepEqual(
    llamadas.find(l => l[0] === 'existePrograma'),
    ['existePrograma', 90],
    'comprueba el programa antes de abrir la transaccion'
  );
  assert.deepEqual(
    llamadas.find(l => l[0] === 'escribirLote'),
    ['escribirLote', 90, [11, 12, 13]],
    'el UPDATE recibe el programa y los ids ORDENADOS'
  );
  assert.equal(
    llamadas.filter(l => l[0] === 'leerLote').length, 2,
    'lee con cerrojo antes de decidir y relee despues de escribir'
  );

  // --- transaccion y liberacion
  assert.deepEqual(
    sentencias(), ['BEGIN', 'COMMIT'],
    'una transaccion que confirma, sin ROLLBACK'
  );
  assert.ok(
    llamadas.some(l => l[0] === 'release'),
    'el cliente se devuelve al pool'
  );

  // --- auditoria: una por visita que cambio, con el MISMO client
  const auditorias = llamadas.filter(l => l[0] === 'auditar');

  assert.equal(auditorias.length, 3, 'una entrada por visita confirmada');
  assert.deepEqual(auditorias.map(a => a[1]).sort((x, y) => x - y), [11, 12, 13]);
  assert.ok(
    auditorias.every(a => a[3] === 'programacion_mantenimiento'),
    'sobre la tabla de la programacion'
  );
  assert.ok(
    auditorias.every(a => a[4] === true),
    'con el client de la transaccion, para que entre en el mismo COMMIT'
  );
  assert.match(
    auditorias[0][2],
    /PROYECTADO -> PROGRAMADO/,
    'el texto nombra la transicion'
  );
});

test('éxito · las ya PROGRAMADAS son idempotentes: ni UPDATE ni auditoría', async () => {
  visitasEnBase = [
    visita(21, 'PROYECTADO'),
    visita(22, 'PROGRAMADO'),
    visita(23, 'PROGRAMADO')
  ];
  escribiraIds = [21];

  const res = respuesta();

  await programarLote(solicitud([21, 22, 23]), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.confirmadas, 1, 'solo la PROYECTADO se confirma');
  assert.equal(res.datos.ya_estaban_programadas, 2);
  assert.deepEqual(res.datos.ids_confirmados, [21]);
  assert.deepEqual(res.datos.ids_ya_programados, [22, 23]);

  assert.deepEqual(
    llamadas.find(l => l[0] === 'escribirLote'),
    ['escribirLote', 90, [21]],
    'el UPDATE recibe SOLO la que de verdad cambia'
  );

  const auditorias = llamadas.filter(l => l[0] === 'auditar');

  assert.equal(auditorias.length, 1, 'ninguna auditoria para las ya programadas');
  assert.equal(auditorias[0][1], 21);
  assert.deepEqual(sentencias(), ['BEGIN', 'COMMIT']);
});

test('éxito · un lote entero de idempotentes no emite ningún UPDATE', async () => {
  visitasEnBase = [visita(31, 'PROGRAMADO'), visita(32, 'PROGRAMADO')];
  escribiraIds = [];

  const res = respuesta();

  await programarLote(solicitud([31, 32]), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.confirmadas, 0);
  assert.equal(res.datos.ya_estaban_programadas, 2);
  assert.equal(
    llamadas.filter(l => l[0] === 'escribirLote').length, 0,
    'sin programables no se llama al UPDATE'
  );
  assert.equal(llamadas.filter(l => l[0] === 'auditar').length, 0);
  assert.deepEqual(sentencias(), ['BEGIN', 'COMMIT']);
});

test('éxito · los duplicados se colapsan y se informan', async () => {
  visitasEnBase = [visita(41, 'PROYECTADO'), visita(42, 'PROYECTADO')];
  escribiraIds = [41, 42];

  const res = respuesta();

  await programarLote(solicitud([42, 41, 42, 41, 42]), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.solicitadas, 5, 'cuenta lo que se pidio');
  assert.equal(res.datos.ids_unicos, 2);
  assert.equal(res.datos.duplicados_colapsados, 3);
  assert.deepEqual(res.datos.ids_confirmados, [41, 42]);
  assert.deepEqual(
    llamadas.find(l => l[0] === 'escribirLote'),
    ['escribirLote', 90, [41, 42]],
    'el UPDATE recibe los ids unicos'
  );
});

test('éxito · varias quincenas se reportan todas, ordenadas', async () => {
  visitasEnBase = [
    visita(51, 'PROYECTADO', { quincena_programada: '2026-11-16', quincena_efectiva: '2026-11-16' }),
    visita(52, 'PROYECTADO'),
    visita(53, 'PROYECTADO', { quincena_programada: '2026-10-16', quincena_efectiva: '2026-10-16' })
  ];
  escribiraIds = [51, 52, 53];

  const res = respuesta();

  await programarLote(solicitud([51, 52, 53]), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(
    res.datos.quincenas,
    ['2026-10-01', '2026-10-16', '2026-11-16'],
    'las tres quincenas distintas, ordenadas'
  );
});

// =====================================================================================
// Las ramas de rechazo, para que el contrato quede cerrado por ambos lados.
test('rechazo · una visita bloqueada aborta el lote completo con 409', async () => {
  visitasEnBase = [
    visita(61, 'PROYECTADO'),
    visita(62, 'CANCELADO'),
    visita(63, 'PROYECTADO')
  ];
  escribiraIds = [61, 63];

  const res = respuesta();

  await programarLote(solicitud([61, 62, 63]), res);

  assert.equal(res.codigo, 409);
  assert.match(res.datos.error, /no se confirmó ninguna/i);
  assert.match(res.datos.error, /#62/, 'nombra la visita que lo impidio');
  assert.match(res.datos.error, /CANCELADA/, 'con el motivo del backend');

  assert.equal(
    llamadas.filter(l => l[0] === 'escribirLote').length, 0,
    'no se llega al UPDATE'
  );
  assert.equal(llamadas.filter(l => l[0] === 'auditar').length, 0);
  assert.deepEqual(sentencias(), ['BEGIN', 'ROLLBACK'], 'revierte');
});

test('rechazo · un id ausente da 404 y no escribe nada', async () => {
  visitasEnBase = [visita(71, 'PROYECTADO')];
  escribiraIds = [71];

  const res = respuesta();

  await programarLote(solicitud([71, 999]), res);

  assert.equal(res.codigo, 404);
  assert.match(res.datos.error, /999/);
  assert.match(res.datos.error, /no se confirmó ninguna/i);
  assert.equal(llamadas.filter(l => l[0] === 'escribirLote').length, 0);
  assert.deepEqual(sentencias(), ['BEGIN', 'ROLLBACK']);
});

test('rechazo · si la base escribe menos de lo decidido, revierte con 409', async () => {
  visitasEnBase = [visita(81, 'PROYECTADO'), visita(82, 'PROYECTADO')];
  escribiraIds = [81]; // la base acepta una sola: el estado cambio bajo los pies

  const res = respuesta();

  await programarLote(solicitud([81, 82]), res);

  assert.equal(res.codigo, 409);
  assert.match(res.datos.error, /se esperaba confirmar 2/i);
  assert.match(res.datos.error, /no se confirmó ninguna/i);
  assert.equal(llamadas.filter(l => l[0] === 'auditar').length, 0, 'sin auditoria falsa');
  assert.deepEqual(sentencias(), ['BEGIN', 'ROLLBACK']);
});

test('rechazo · programa inexistente da 404 sin abrir transacción', async () => {
  const res = respuesta();

  await programarLote(solicitud([1], '99999'), res);

  assert.equal(res.codigo, 404);
  assert.deepEqual(sentencias(), [], 'ni BEGIN: se corta antes de pedir cliente');
});

test('rechazo · cuerpo inválido se corta antes de tocar el programa', async () => {
  for (const [etiqueta, ids] of [
    ['ids vacío', []],
    ['ids no array', 5],
    ['id decimal', [1, 2.5]],
    ['id texto', ['abc']],
    ['id cero', [0]]
  ]) {
    llamadas = [];

    const res = respuesta();

    await programarLote(solicitud(ids), res);

    assert.equal(res.codigo, 400, etiqueta);
    assert.deepEqual(llamadas, [], `${etiqueta}: no consulta nada`);
  }
});
