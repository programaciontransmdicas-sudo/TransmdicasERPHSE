// Validación de fechas y cancelación. Las reglas nuevas de reprogramación
// se cubren en ajustesProgramacion.test.js y ajustesProgramacionPg.test.js.
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

import {
  cierreDeQuincena,
  quincenasDelPeriodo,
  catalogoDeDestinos,
  validarDestino,
  orientacionSinDestinos,
  bloqueos,
  CODIGOS_DESTINO,
  MENSAJE_SIN_DESTINOS
} from '../src/modules/programas/programacion/service.js';

// La fecha de negocio de las pruebas. Es la que media la base el dia en que se midio el
// caso real: 2026-10-09. Nunca el reloj del proceso.
const HOY = '2026-10-09';

// El periodo real de la version 01 VIGENTE del programa 90, medido en db-refactor.
const VERSION = {
  id: 63,
  programa_id: 90,
  version: '01',
  estado: 'VIGENTE',
  periodo_inicio: '2026-09-01',
  periodo_fin: '2026-12-31'
};

const visita = (extra = {}) => ({
  id: 12509,
  programa_id: 90,
  programa_unidad_id: 2752,
  placa: 'CAR924',
  estado: 'PROGRAMADO',
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

const ocupante = (id, quincena, estado = 'PROYECTADO') => ({
  id,
  estado,
  quincena_efectiva: quincena,
  placa: 'CAR924'
});

// Las cinco vecinas reales de la visita 12509: la unidad 2752 ocupa las 6 quincenas.
const OCUPADAS_CAR924 = [
  ocupante(12657, '2026-10-16'),
  ocupante(12807, '2026-11-01'),
  ocupante(12952, '2026-11-16'),
  ocupante(13104, '2026-12-01'),
  ocupante(13250, '2026-12-16')
];

const catalogo = (opciones = {}) => catalogoDeDestinos({
  visita: visita(),
  version: VERSION,
  fechaNegocio: HOY,
  ocupadas: [],
  ...opciones
});

const buscar = (cat, quincena) => cat.destinos.find(
  d => d.quincena === quincena
);

// =====================================================================================
// 1 · LA REGLA PURA
// =====================================================================================

let llamadas;
let visitaEnBase;
let ocupadasEnBase;
let versionEnBase;

mock.module('../src/modules/programas/programacion/repository.js', {
  namedExports: {
    obtenerVisitaPorId: async (programaId, id) => {
      llamadas.push(['leerVisita', programaId, id]);

      return visitaEnBase;
    },
    obtenerQuincenasOcupadasDeUnidad: async (unidadId, excluirId) => {
      llamadas.push(['ocupadas', unidadId, excluirId]);

      return ocupadasEnBase;
    },
    reprogramarVisita: async (programaId, id, quincena, motivo, autor) => {
      llamadas.push(['UPDATE', programaId, id, quincena, motivo, autor]);

      visitaEnBase = {
        ...visitaEnBase,
        estado: 'REPROGRAMADO',
        quincena_reprogramada: quincena,
        quincena_efectiva: quincena,
        // La nota la apila la BASE en el mismo UPDATE; aquí se simula el resultado para
        // comprobar que el controller devuelve lo que la base dejó, sin recomponerlo.
        observaciones:
          `${visitaEnBase.observaciones ?? ''}\n\n[2026-10-09 10:00 · REPROGRAMACION `
          + `· autor ${autor ?? 'sin identificar'}] ${motivo}`.trim()
      };

      return true;
    },
    cancelarVisita: async (programaId, id, motivo, autor) => {
      llamadas.push(['CANCELAR', programaId, id, motivo, autor]);

      visitaEnBase = {
        ...visitaEnBase,
        estado: 'CANCELADO',
        observaciones:
          `${visitaEnBase.observaciones ?? ''}\n\n[2026-10-09 10:00 · CANCELACION `
          + `· autor ${autor ?? 'sin identificar'}] ${motivo}`.trim()
      };

      return true;
    },
    obtenerEquiposDeVisitas: async ids => {
      llamadas.push(['equipos', [...ids]]);

      return new Map(ids.map(id => [id, []]));
    },
    // El resto del modulo se sustituye entero aunque esta ruta no lo use.
    obtenerProgramacion: async () => [],
    contarProgramacion: async () => 0,
    programarVisita: async () => true,
    obtenerVisitasParaLote: async () => [],
    programarVisitasEnLote: async () => []
  }
});

mock.module('../src/modules/programas/repository.js', {
  namedExports: {
    existePrograma: async id => {
      llamadas.push(['existePrograma', id]);

      return id === 90;
    },
    obtenerVersionAplicable: async programaId => {
      llamadas.push(['version', programaId]);

      return {
        fecha_negocio: HOY,
        version: versionEnBase
      };
    }
  }
});

mock.module('../src/config/database.js', {
  namedExports: {
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {}
      })
    }
  }
});

mock.module('../src/services/auditService.js', {
  namedExports: {
    logAction: async (userId, accion) => {
      llamadas.push(['auditar', accion]);
    }
  }
});

const {
  reprogramar,
  cancelar,
  destinosReprogramacion
} = await import(
  '../src/modules/programas/programacion/controller.js'
);

beforeEach(() => {
  llamadas = [];
  visitaEnBase = visita();
  ocupadasEnBase = OCUPADAS_CAR924;
  versionEnBase = VERSION;
});

// F4.3 · el motivo es OBLIGATORIO, asi que el helper manda uno valido por defecto. Para
// probar su ausencia se pasa `motivo: null`, que lo quita del cuerpo.
const MOTIVO = 'Taller sin repuesto de camara hasta la quincena siguiente';

const solicitud = (
  quincena,
  { id = '12509', motivo = MOTIVO } = {}
) => ({
  body: {
    ...(quincena === undefined
      ? {}
      : { quincena_reprogramada: quincena }),
    ...(motivo === null
      ? {}
      : { motivo })
  },
  params: { programaId: '90', id },
  user: { id: 3, username: 'dobando' },
  method: 'PATCH',
  originalUrl: `/api/programas-mantenimiento/90/programacion/${id}/reprogramar`,
  headers: {},
  ip: '127.0.0.1'
});

const solicitudCancelar = (
  { id = '12509', motivo = 'La unidad sale de flota este mes' } = {}
) => ({
  body: motivo === null
    ? {}
    : { motivo },
  params: { programaId: '90', id },
  user: { id: 3, username: 'dobando' },
  method: 'PATCH',
  originalUrl: `/api/programas-mantenimiento/90/programacion/${id}/cancelar`,
  headers: {},
  ip: '127.0.0.1'
});

const respuesta = () => ({
  codigo: 200,
  status(codigo) { this.codigo = codigo; return this; },
  json(datos) { this.datos = datos; return this; }
});

const escrituras = () => llamadas.filter(
  l => l[0] === 'UPDATE'
);

// -------------------------------------------------------------------------------------


test('cierreDeQuincena · dia 1 cierra el 15 y dia 16 el ultimo del mes', () => {
  assert.equal(cierreDeQuincena('2026-10-01'), '2026-10-15');
  assert.equal(cierreDeQuincena('2026-10-16'), '2026-10-31');
  assert.equal(cierreDeQuincena('2026-11-16'), '2026-11-30');
  assert.equal(cierreDeQuincena('2026-12-16'), '2026-12-31');
  assert.equal(cierreDeQuincena('2026-02-16'), '2026-02-28');

  // Año bisiesto: si se calculara con un 28 fijo, una quincena de febrero cerraria antes
  // de tiempo y se daria por pasada un dia que todavia cuenta.
  assert.equal(cierreDeQuincena('2024-02-16'), '2024-02-29');
});

test('quincenasDelPeriodo · el periodo real da 8 quincenas y los bordes son inclusive', () => {
  assert.deepEqual(
    quincenasDelPeriodo('2026-09-01', '2026-12-31'),
    [
      '2026-09-01', '2026-09-16',
      '2026-10-01', '2026-10-16',
      '2026-11-01', '2026-11-16',
      '2026-12-01', '2026-12-16'
    ]
  );

  // El fin corta por el ANCLA, no por el cierre: un periodo que acaba el 15 no incluye la
  // quincena del 16.
  assert.deepEqual(
    quincenasDelPeriodo('2026-10-01', '2026-10-15'),
    ['2026-10-01']
  );

  assert.deepEqual(
    quincenasDelPeriodo('2026-10-16', '2026-11-01'),
    ['2026-10-16', '2026-11-01']
  );
});

test('quincenasDelPeriodo · entradas imposibles devuelven lista vacia, no lanzan', () => {
  assert.deepEqual(quincenasDelPeriodo(null, null), []);
  assert.deepEqual(quincenasDelPeriodo(undefined, '2026-12-31'), []);
  assert.deepEqual(quincenasDelPeriodo('2026-12-31', '2026-09-01'), []);
  assert.deepEqual(quincenasDelPeriodo('ayer', 'mañana'), []);
});

test('PATCH · formato invalido sigue siendo 400 y no llega al catalogo', async () => {
  const res = respuesta();

  await reprogramar(solicitud('2026-10-07'), res);

  assert.equal(res.codigo, 400, 'el dia 7 no es una quincena');
  assert.equal(res.datos.code, undefined, 'un 400 de formato no lleva code');
  assert.deepEqual(escrituras(), []);
});

test('PATCH · campo sobrante sigue dando 400 con la lista de admitidos', async () => {
  const res = respuesta();

  // `motivo` ya NO es un campo sobrante en F4.3: se usa otro para probar el rechazo.
  await reprogramar({
    ...solicitud('2026-12-01'),
    body: {
      quincena_reprogramada: '2026-12-01',
      motivo: MOTIVO,
      quincena_programada: '2026-11-01'
    }
  }, res);

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /quincena_programada/);
  assert.match(res.datos.error, /Admitidos: quincena_reprogramada, motivo/);
  assert.deepEqual(escrituras(), []);
});

// -------------------------------------------------------------------------------------

test('F4.3 · REPROGRAMAR sin motivo: 400 y la base NO se escribe', async () => {
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  const res = respuesta();

  await reprogramar(
    solicitud('2026-12-01', { motivo: null }),
    res
  );

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /motivo es obligatorio/);
  assert.deepEqual(escrituras(), [], 'sin UPDATE');
  assert.equal(
    llamadas.filter(l => l[0] === 'auditar').length,
    0,
    'sin auditoria'
  );
});

test('F4.3 · REPROGRAMAR con motivo vacío o en blanco: 400', async () => {
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  for (const vacio of ['', '   ', '\n\t ']) {
    const res = respuesta();

    await reprogramar(
      solicitud('2026-12-01', { motivo: vacio }),
      res
    );

    assert.equal(res.codigo, 400, `motivo ${JSON.stringify(vacio)}`);
    assert.deepEqual(escrituras(), []);
  }
});

test('F4.3 · REPROGRAMAR con motivo no textual: 400, no se coacciona', async () => {
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  for (const malo of [42, true, { texto: 'x' }, ['x'], null]) {
    const res = respuesta();

    await reprogramar({
      ...solicitud('2026-12-01'),
      body: { quincena_reprogramada: '2026-12-01', motivo: malo }
    }, res);

    assert.equal(res.codigo, 400, `motivo ${JSON.stringify(malo)}`);
    assert.deepEqual(escrituras(), []);
  }
});

test('F4.3 · REPROGRAMAR idempotente SIN motivo: sigue siendo 400', async () => {
  // El cuerpo mal formado se rechaza antes de llegar al cortocircuito: una peticion sin
  // motivo esta mal formada sea cual sea el estado de la visita.
  visitaEnBase = visita({
    estado: 'REPROGRAMADO',
    quincena_reprogramada: '2026-12-01',
    quincena_efectiva: '2026-12-01'
  });

  const res = respuesta();

  await reprogramar(
    solicitud('2026-12-01', { motivo: null }),
    res
  );

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /motivo es obligatorio/);
});

// -------------------------------------------------------------------------------------

test('F4.3 · CANCELAR sin motivo: 400 y la base NO se escribe', async () => {
  const res = respuesta();

  await cancelar(
    solicitudCancelar({ motivo: null }),
    res
  );

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /motivo es obligatorio/);
  assert.deepEqual(
    llamadas.filter(l => l[0] === 'CANCELAR'),
    [],
    'sin UPDATE de cancelacion'
  );
  assert.equal(llamadas.filter(l => l[0] === 'auditar').length, 0);
});

test('F4.3 · CANCELAR con motivo: cancela, anota y audita', async () => {
  const res = respuesta();
  const motivo = 'La unidad sale de flota este mes';

  await cancelar(
    solicitudCancelar({ motivo }),
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.estado, 'CANCELADO');

  assert.deepEqual(
    llamadas.filter(l => l[0] === 'CANCELAR'),
    [['CANCELAR', 90, 12509, motivo, 'dobando']],
    'un unico UPDATE, con motivo y autor'
  );

  const auditoria = llamadas.filter(l => l[0] === 'auditar');

  assert.equal(auditoria.length, 1);
  assert.match(auditoria[0][1], /Canceló la visita 12509/);
  assert.match(auditoria[0][1], new RegExp(`Motivo: ${motivo}`));
});

test('F4.3 · CANCELAR: la nota se APILA y no borra la del generador', async () => {
  const previa =
    'Proyeccion del generador TI-PR-01. nivel_regular=M1. El nivel real de cada equipo '
    + 'esta en programacion_mantenimiento_equipos.nivel_mantenimiento.';

  visitaEnBase = visita({ observaciones: previa });

  const res = respuesta();

  await cancelar(
    solicitudCancelar({ motivo: 'Unidad siniestrada' }),
    res
  );

  assert.equal(res.codigo, 200);

  // La BASE es quien apila -COALESCE(NULLIF(observaciones,'') || E'\n\n','') || nota-; el
  // mock reproduce ese resultado. Lo que se comprueba aqui es que el controller devuelve
  // lo que la base dejó y que la nota previa sobrevive entera.
  assert.ok(
    res.datos.observaciones.startsWith(previa),
    'la nota del generador sigue al principio, intacta'
  );
  assert.match(res.datos.observaciones, /CANCELACION/);
  assert.match(res.datos.observaciones, /autor dobando/);
  assert.match(res.datos.observaciones, /Unidad siniestrada/);
});

test('F4.3 · CANCELAR idempotente: ya cancelada no reescribe, y conserva su historial', async () => {
  visitaEnBase = visita({
    estado: 'CANCELADO',
    observaciones: 'Proyeccion del generador.\n\n[2026-10-08 09:00 · CANCELACION '
      + '· autor otro] Primera cancelacion'
  });

  const res = respuesta();

  await cancelar(
    solicitudCancelar({ motivo: 'Insisto' }),
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.ya_estaba_cancelada, true);
  assert.deepEqual(
    llamadas.filter(l => l[0] === 'CANCELAR'),
    [],
    'sin UPDATE'
  );
  assert.match(res.datos.observaciones, /Primera cancelacion/);
  assert.doesNotMatch(res.datos.observaciones, /Insisto/);
});

test('F4.3 · CANCELAR campo sobrante: 400 con la lista de admitidos', async () => {
  const res = respuesta();

  await cancelar({
    ...solicitudCancelar(),
    body: { motivo: 'x', estado: 'CANCELADO' }
  }, res);

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /estado/);
  assert.match(res.datos.error, /Admitidos: motivo/);
});

test('F4.3 · CANCELAR con una OT no anulada: 409 del backend, no 400', async () => {
  visitaEnBase = visita({
    ot_total: 1,
    ot_abiertas: 1,
    ot_no_anuladas: 1
  });

  const res = respuesta();

  await cancelar(solicitudCancelar(), res);

  assert.equal(res.codigo, 409);
  assert.match(res.datos.error, /anula la OT antes de cancelar/);
  assert.deepEqual(llamadas.filter(l => l[0] === 'CANCELAR'), []);
});

// -------------------------------------------------------------------------------------
