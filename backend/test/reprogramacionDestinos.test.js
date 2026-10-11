// TI-PR-01 · F4.2 + F4.3 · destinos de reprogramacion, motivo obligatorio y orientacion
// ============================================================================
// TRES BLOQUES, los tres sin tocar ninguna base de datos:
//
//   1. LA REGLA PURA. cierreDeQuincena, quincenasDelPeriodo, catalogoDeDestinos y
//      validarDestino son funciones sin dependencias: se prueban directamente.
//
//   2. EL CONTROLLER REAL con el repositorio simulado. Se comprueba que el PATCH valida
//      ANTES de escribir -el UPDATE no llega a llamarse en ninguno de los cuatro rechazos-,
//      que el destino valido si escribe, y que la idempotencia que ya existia sigue
//      cortocircuitando sin consultar el catalogo ni tocar la base.
//
// Con mocks y no contra db-refactor por la misma razon que F4.1: una reprogramacion real
// consume un slot de quincena y cambia el estado de la visita a REPROGRAMADO, y no existe
// el camino de vuelta. Lo que SI se verifico contra db-refactor, en BEGIN ... ROLLBACK, es
// que el UPDATE toca exactamente dos columnas y que ciclos, anclas y equipos no se mueven.
//
//   node --experimental-test-module-mocks --test test/reprogramacionDestinos.test.js
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

test('catalogo · el caso REAL de CAR924: las 6 ocupadas o pasadas, 0 disponibles', () => {
  const cat = catalogo({ ocupadas: OCUPADAS_CAR924 });

  assert.equal(cat.total, 8, 'las 8 quincenas del periodo');
  assert.equal(cat.disponibles, 0, 'ninguna disponible');
  assert.equal(cat.mensaje, MENSAJE_SIN_DESTINOS, 'el mensaje exacto acordado');
  assert.match(cat.detalle, /ocupadas|cerraron/);

  // septiembre: dentro del periodo pero ya cerrada
  assert.equal(buscar(cat, '2026-09-01').code, CODIGOS_DESTINO.PASADO);
  assert.equal(buscar(cat, '2026-09-16').code, CODIGOS_DESTINO.PASADO);
  assert.equal(buscar(cat, '2026-09-16').cierre, '2026-09-30');

  // la propia quincena de la visita
  assert.equal(buscar(cat, '2026-10-01').code, CODIGOS_DESTINO.ACTUAL);

  // las cinco que ocupan sus hermanas, cada una nombrando a la ocupante
  for (const o of OCUPADAS_CAR924) {
    const d = buscar(cat, o.quincena_efectiva);

    assert.equal(d.disponible, false, `${o.quincena_efectiva} no disponible`);
    assert.equal(d.code, CODIGOS_DESTINO.OCUPADO);
    assert.deepEqual(d.ocupada_por, {
      id: o.id,
      placa: 'CAR924',
      estado: 'PROYECTADO'
    });
    assert.match(d.motivo, new RegExp(`#${o.id}`));
  }
});

test('catalogo · la quincena EN CURSO no cuenta como pasada', () => {
  // 2026-10-01 cierra el 15 y hoy es el 9: sigue corriendo. Se prueba sobre una visita que
  // vive en otra quincena, para que no la descarte la regla de la quincena actual.
  const cat = catalogo({
    visita: visita({
      quincena_programada: '2026-12-16',
      quincena_efectiva: '2026-12-16'
    })
  });

  const enCurso = buscar(cat, '2026-10-01');

  assert.equal(enCurso.disponible, true, 'la quincena en curso es un destino valido');
  assert.equal(enCurso.cierre, '2026-10-15');

  // y la anterior, que cerro el 30 de septiembre, no lo es
  assert.equal(buscar(cat, '2026-09-16').disponible, false);
});

test('catalogo · unidad con quincenas libres: solo las libres salen disponibles', () => {
  // El caso de las 16 visitas solo-anualidad: una sola visita en la unidad.
  const cat = catalogo({
    ocupadas: [ocupante(99999, '2026-11-01')]
  });

  assert.equal(cat.disponibles, 4, '10-16, 11-16, 12-01 y 12-16');
  assert.equal(cat.mensaje, null, 'con destinos no hay mensaje de vacio');
  assert.equal(cat.detalle, null);

  assert.deepEqual(
    cat.destinos.filter(d => d.disponible).map(d => d.quincena),
    ['2026-10-16', '2026-11-16', '2026-12-01', '2026-12-16']
  );
});

test('catalogo · sin version aplicable y con version sin periodo: 0 destinos, no excepcion', () => {
  const sinVersion = catalogo({ version: null });

  assert.equal(sinVersion.total, 0);
  assert.equal(sinVersion.version, null);
  assert.equal(sinVersion.mensaje, MENSAJE_SIN_DESTINOS);
  assert.match(sinVersion.detalle, /ninguna versión aplicable/);

  const sinPeriodo = catalogo({
    version: { ...VERSION, periodo_inicio: null, periodo_fin: null }
  });

  assert.equal(sinPeriodo.total, 0);
  assert.equal(sinPeriodo.mensaje, MENSAJE_SIN_DESTINOS);
  assert.match(sinPeriodo.detalle, /no tiene periodo_inicio/);
});

test('catalogo · publica el periodo, la fecha de negocio y la regla, sin recalcular nada', () => {
  const cat = catalogo({ ocupadas: OCUPADAS_CAR924 });

  assert.equal(cat.fecha_negocio, HOY);
  assert.equal(cat.quincena_actual, '2026-10-01');
  assert.deepEqual(cat.version, {
    id: 63,
    version: '01',
    estado: 'VIGENTE',
    periodo_inicio: '2026-09-01',
    periodo_fin: '2026-12-31'
  });

  // cada destino trae su cierre calculado: el cliente no lo deriva
  for (const d of cat.destinos) {
    assert.match(d.cierre, /^\d{4}-\d{2}-\d{2}$/);
  }

  assert.match(cat.regla, /no existe intercambio entre dos visitas/);
});

test('validarDestino · los cuatro rechazos, cada uno con su code y status 409', () => {
  const cat = catalogo({ ocupadas: OCUPADAS_CAR924 });

  const rechazo = quincena => {
    try {
      validarDestino(quincena, cat);
    } catch (e) {
      return e;
    }

    return null;
  };

  const fuera = rechazo('2027-01-01');
  assert.equal(fuera.status, 409);
  assert.equal(fuera.code, CODIGOS_DESTINO.FUERA_DE_PERIODO);
  assert.match(fuera.message, /2026-09-01 \.\. 2026-12-31/);

  const pasada = rechazo('2026-09-01');
  assert.equal(pasada.status, 409);
  assert.equal(pasada.code, CODIGOS_DESTINO.PASADO);

  const ocupada = rechazo('2026-11-01');
  assert.equal(ocupada.status, 409);
  assert.equal(ocupada.code, CODIGOS_DESTINO.OCUPADO);
  assert.match(ocupada.message, /#12807/);

  const actual = rechazo('2026-10-01');
  assert.equal(actual.status, 409);
  assert.equal(actual.code, CODIGOS_DESTINO.ACTUAL);
});

test('validarDestino · un destino disponible pasa y devuelve su fila del catalogo', () => {
  const cat = catalogo({ ocupadas: [ocupante(99999, '2026-11-01')] });

  const destino = validarDestino('2026-12-01', cat);

  assert.equal(destino.quincena, '2026-12-01');
  assert.equal(destino.disponible, true);
  assert.equal(destino.motivo, null);
  assert.equal(destino.code, null);
});

// =====================================================================================
// 2 · EL CONTROLLER REAL
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

test('PATCH · destino LIBRE y valido: escribe una sola vez, con la quincena pedida', async () => {
  // Unidad con hueco: solo ocupa 11-01, asi que 12-01 esta libre.
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  const res = respuesta();

  await reprogramar(solicitud('2026-12-01'), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(
    escrituras(),
    [['UPDATE', 90, 12509, '2026-12-01', MOTIVO, 'dobando']],
    'un unico UPDATE, con programa, visita, quincena, motivo y autor'
  );

  assert.equal(res.datos.estado, 'REPROGRAMADO');
  assert.equal(res.datos.quincena_reprogramada, '2026-12-01');
  assert.equal(res.datos.quincena_efectiva, '2026-12-01');

  // la identidad historica no se toca
  assert.equal(res.datos.quincena_programada, '2026-10-01');

  assert.equal(
    llamadas.filter(l => l[0] === 'auditar').length,
    1,
    'una entrada de auditoria'
  );
});

test('PATCH · destino OCUPADO: 409 con code, y la base NO se escribe', async () => {
  const res = respuesta();

  await reprogramar(solicitud('2026-11-01'), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_DESTINO.OCUPADO);
  assert.match(res.datos.error, /#12807/);
  assert.deepEqual(escrituras(), [], 'sin UPDATE');
  assert.equal(llamadas.filter(l => l[0] === 'auditar').length, 0, 'sin auditoria');
});

test('PATCH · quincena PASADA: 409, sin depender del indice y sin escribir', async () => {
  const res = respuesta();

  await reprogramar(solicitud('2026-09-01'), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_DESTINO.PASADO);
  assert.match(res.datos.error, /cerró el 2026-09-15/);
  assert.deepEqual(escrituras(), []);
});

test('PATCH · FUERA del periodo de la version: 409, aunque la quincena este libre', async () => {
  // 2027-01-01 esta libre para la unidad -lo midio la auditoria- y sin esta regla el
  // indice la habria aceptado. El limite es el periodo, no la ocupacion.
  const res = respuesta();

  await reprogramar(solicitud('2027-01-01'), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_DESTINO.FUERA_DE_PERIODO);
  assert.match(res.datos.error, /2026-09-01 \.\. 2026-12-31/);
  assert.deepEqual(escrituras(), []);
});

test('PATCH · la MISMA quincena efectiva: 409 y no un UPDATE que no mueve nada', async () => {
  const res = respuesta();

  await reprogramar(solicitud('2026-10-01'), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_DESTINO.ACTUAL);
  assert.deepEqual(escrituras(), []);
});

test('PATCH · idempotencia INTACTA: repetir la quincena ya reprogramada no toca la base', async () => {
  // Una visita que ya se movio a 12-01. Pedir otra vez 12-01 tiene que seguir contestando
  // ya_estaba_en_esa_quincena, no un 409 de "es la quincena actual": la regla del destino
  // se evalua DESPUES del cortocircuito.
  visitaEnBase = visita({
    estado: 'REPROGRAMADO',
    quincena_reprogramada: '2026-12-01',
    quincena_efectiva: '2026-12-01'
  });

  const res = respuesta();

  await reprogramar(solicitud('2026-12-01'), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.ya_estaba_en_esa_quincena, true);
  assert.deepEqual(escrituras(), [], 'sin UPDATE');
  assert.equal(
    llamadas.filter(l => l[0] === 'version').length,
    0,
    'ni siquiera se construye el catalogo: se corta antes'
  );
});

test('PATCH · el veto por estado manda sobre el del destino: PROYECTADO no se reprograma', async () => {
  // bloqueos() se evalua antes que el catalogo, asi que el motivo que llega es el del
  // estado y no el de la quincena. Las 886 visitas estan hoy en PROYECTADO.
  visitaEnBase = visita({ estado: 'PROYECTADO' });
  ocupadasEnBase = [];

  const res = respuesta();

  await reprogramar(solicitud('2026-12-01'), res);

  assert.equal(res.codigo, 409);
  assert.match(res.datos.error, /promuévela a PROGRAMADO/);
  assert.deepEqual(escrituras(), []);
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

test('GET destinos · publica el catalogo completo mas la visita y su elegibilidad', async () => {
  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  assert.equal(res.codigo, 200);

  const d = res.datos;

  assert.equal(d.programa_id, 90);
  assert.deepEqual(d.visita, {
    id: 12509,
    placa: 'CAR924',
    estado: 'PROGRAMADO',
    quincena_programada: '2026-10-01',
    quincena_reprogramada: null,
    quincena_efectiva: '2026-10-01'
  });

  assert.deepEqual(d.reprogramable, { puede: true, motivo: null });

  assert.equal(d.total, 8);
  assert.equal(d.disponibles, 0);
  assert.equal(d.mensaje, MENSAJE_SIN_DESTINOS);
  assert.equal(d.destinos.length, 8);

  // el GET excluye la propia visita al mirar la ocupacion
  assert.deepEqual(
    llamadas.filter(l => l[0] === 'ocupadas'),
    [['ocupadas', 2752, 12509]]
  );

  // es de SOLO LECTURA
  assert.deepEqual(escrituras(), []);
});

test('GET destinos · una visita que no admite reprogramarse lo dice, y aun asi lista', async () => {
  visitaEnBase = visita({ estado: 'PROYECTADO' });
  ocupadasEnBase = [];

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.reprogramable.puede, false);
  assert.match(res.datos.reprogramable.motivo, /promuévela a PROGRAMADO/);

  // las dos preguntas son independientes: hay destinos libres y la visita no es elegible
  assert.equal(res.datos.disponibles, 5);
});

test('GET destinos · visita inexistente en el programa: 404', async () => {
  visitaEnBase = null;

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '999999' } },
    res
  );

  assert.equal(res.codigo, 404);
});

// =====================================================================================
// 3 · F4.3 · MOTIVO OBLIGATORIO Y ORIENTACION
// =====================================================================================

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

test('F4.3 · REPROGRAMAR con motivo válido: escribe, recorta y audita el motivo', async () => {
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  const res = respuesta();

  await reprogramar(
    solicitud('2026-12-01', { motivo: `   ${MOTIVO}   ` }),
    res
  );

  assert.equal(res.codigo, 200);

  // el motivo llega al repositorio RECORTADO, y el autor es el username del token
  assert.deepEqual(
    escrituras(),
    [['UPDATE', 90, 12509, '2026-12-01', MOTIVO, 'dobando']]
  );

  // y viaja tambien a la auditoria, dentro del texto de la accion
  const auditoria = llamadas.filter(l => l[0] === 'auditar');

  assert.equal(auditoria.length, 1);
  assert.match(auditoria[0][1], /Reprogramó la visita 12509/);
  assert.match(auditoria[0][1], new RegExp(`Motivo: ${MOTIVO}`));
});

test('F4.3 · REPROGRAMAR idempotente: exige motivo pero NO escribe ni anota', async () => {
  // Ya reprogramada a 12-01 y se vuelve a pedir 12-01. La semantica de F4.2 se conserva:
  // ya_estaba_en_esa_quincena, sin tocar la base. Y por tanto SIN anotacion: no pasó nada
  // que anotar, y una nota movería updated_at en una operación que no cambia nada.
  visitaEnBase = visita({
    estado: 'REPROGRAMADO',
    quincena_reprogramada: '2026-12-01',
    quincena_efectiva: '2026-12-01',
    observaciones: 'Proyeccion del generador TI-PR-01.'
  });

  const res = respuesta();

  await reprogramar(
    solicitud('2026-12-01'),
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.ya_estaba_en_esa_quincena, true);
  assert.deepEqual(escrituras(), [], 'sin UPDATE');
  assert.equal(
    llamadas.filter(l => l[0] === 'auditar').length,
    0,
    'sin auditoria'
  );

  // la observacion del generador sigue intacta en la respuesta
  assert.equal(
    res.datos.observaciones,
    'Proyeccion del generador TI-PR-01.'
  );
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

test('F4.3 · ORIENTACION · unidad regular sin destinos: la publica el backend entera', async () => {
  // CAR924 con sus 5 hermanas: 0 destinos. Visita PROGRAMADO sin OT, asi que las dos vias
  // de ejecucion estan disponibles via ABRIR_OT.
  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.disponibles, 0);

  const o = res.datos.orientacion;

  assert.ok(o, 'la orientacion viaja cuando no hay destinos');
  assert.equal(o.situacion, 'UNIDAD_CON_OBLIGACION_EN_TODAS_LAS_QUINCENAS');
  assert.equal(o.quincenas_ocupadas, 5);
  assert.equal(o.quincenas_cerradas, 2);

  assert.match(o.resumen, /obligación de mantenimiento en todas las quincenas/);
  assert.match(o.resumen, /5 de las 8/);
  assert.match(o.por_que, /No corresponde mover una obligación regular/);

  // las tres vias, en orden, con su clave
  assert.deepEqual(
    o.vias.map(v => v.clave),
    ['EJECUTAR_TARDE', 'REGISTRAR_RESULTADO', 'CANCELAR']
  );

  const [tarde, noEjecutado, cancelarVia] = o.vias;

  // (a) ejecucion tardia: disponible, y dice que la quincena administrativa NO se mueve
  assert.equal(tarde.disponible, true);
  assert.equal(tarde.accion, 'ABRIR_OT');
  assert.match(tarde.detalle, /fecha física real/);
  assert.match(tarde.detalle, /quincena administrativa no se mueve/);
  assert.match(tarde.detalle, /el ciclo avanza con la quincena administrativa/);

  // (b) no ejecutado, con la distincion de NO_APLICA que pidio negocio
  assert.equal(noEjecutado.disponible, true);
  assert.match(noEjecutado.detalle, /NO_EJECUTADO/);
  assert.match(noEjecutado.detalle, /los ciclos no avanzan/);
  assert.match(noEjecutado.detalle, /NO_APLICA es distinto/);
  assert.match(noEjecutado.detalle, /no es un equivalente de «no se hizo»/);

  // (c) cancelar: se describe, pero NO se ofrece desde aqui
  assert.equal(cancelarVia.disponible, true);
  assert.equal(cancelarVia.accion, null, 'ninguna accion accionable desde el modal');
  assert.match(cancelarVia.detalle, /no se ofrece desde aquí/);
  assert.match(cancelarVia.detalle, /acción aparte/);
  assert.match(cancelarVia.detalle, /exige motivo/);
  assert.match(cancelarVia.detalle, /no elimina la obligación, solo la visita/);
});

test('F4.3 · ORIENTACION · la ocupante NUNCA se ofrece como acción', async () => {
  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  const o = res.datos.orientacion;

  // ninguna via lleva un id de visita ajena ni una accion de cancelar a nadie
  for (const via of o.vias) {
    assert.ok(
      !/#\d+/.test(via.titulo + via.detalle),
      `la via ${via.clave} no puede nombrar una visita concreta`
    );
    assert.ok(
      via.accion === null ||
      ['ABRIR_OT', 'CERRAR_OT_ABIERTA'].includes(via.accion),
      `accion inesperada en ${via.clave}: ${via.accion}`
    );
  }

  // la identidad de la ocupante sigue estando SOLO en el motivo del destino, como dato
  const ocupado = res.datos.destinos.find(
    d => d.code === CODIGOS_DESTINO.OCUPADO
  );

  assert.ok(ocupado.ocupada_por.id, 'el destino sí dice quién ocupa, como información');
});

test('F4.3 · ORIENTACION · con una OT ya abierta la vía es cerrarla, no abrir otra', async () => {
  visitaEnBase = visita({
    ot_total: 1,
    ot_abiertas: 1,
    ot_no_anuladas: 1
  });

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  const o = res.datos.orientacion;

  assert.equal(o.vias[0].disponible, true);
  assert.equal(o.vias[0].accion, 'CERRAR_OT_ABIERTA');

  // y cancelar deja de estar disponible: lo veta bloqueos() por la OT no anulada
  assert.equal(o.vias[2].disponible, false);
  assert.match(o.vias[2].requisito, /anula la OT antes de cancelar/);
});

test('F4.3 · ORIENTACION · una visita PROYECTADO no admite OT: la vía se marca no disponible', async () => {
  visitaEnBase = visita({ estado: 'PROYECTADO' });

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  const o = res.datos.orientacion;

  assert.equal(o.vias[0].disponible, false);
  assert.equal(o.vias[0].accion, null);
  assert.match(o.vias[0].requisito, /no admite abrir una orden de trabajo/);
  assert.match(o.vias[0].requisito, /PROGRAMADO o REPROGRAMADO/);
});

test('F4.3 · ORIENTACION · con destinos disponibles NO se manda orientación', async () => {
  ocupadasEnBase = [ocupante(99999, '2026-11-01')];

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  assert.ok(res.datos.disponibles > 0);
  assert.equal(res.datos.orientacion, null, 'con destinos no hay nada que orientar');
});

test('F4.3 · ORIENTACION · sin versión aplicable lo dice sin inventar un periodo', async () => {
  versionEnBase = null;

  const res = respuesta();

  await destinosReprogramacion(
    { params: { programaId: '90', id: '12509' } },
    res
  );

  const o = res.datos.orientacion;

  assert.equal(o.situacion, 'SIN_PERIODO_APLICABLE');
  assert.equal(o.quincenas_ocupadas, 0);
  assert.match(o.resumen, /No hay periodo aplicable/);
  assert.equal(res.datos.total, 0);
});

test('F4.3 · el texto de negocio vive en el BACKEND, no en el cliente', () => {
  // Contrato explicito: estas cadenas son las que el modal pinta tal cual. Si alguien las
  // moviera al cliente, este test seguiria pasando pero la regla 12 quedaria rota; por eso
  // lo que se fija aqui es que el backend las PRODUCE, que es lo que el cliente consume.
  const cat = catalogo({ ocupadas: OCUPADAS_CAR924 });

  const o = orientacionSinDestinos({
    visita: visita(),
    catalogo: cat,
    permiso: bloqueos(visita()),
    estadosQueAdmitenOt: ['PROGRAMADO', 'REPROGRAMADO']
  });

  assert.equal(typeof o.resumen, 'string');
  assert.ok(o.resumen.length > 40);
  assert.equal(typeof o.por_que, 'string');

  for (const via of o.vias) {
    assert.equal(typeof via.titulo, 'string');
    assert.equal(typeof via.detalle, 'string');
    assert.ok(via.detalle.length > 40, `${via.clave} sin detalle redactado`);
    assert.equal(typeof via.disponible, 'boolean');
  }
});
