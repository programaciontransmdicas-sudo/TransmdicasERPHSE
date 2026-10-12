// TI-PR-01 · F5.1 · el tecnico se resuelve UNICAMENTE al cerrar la OT
// ============================================================================
// DOS BLOQUES, sin tocar ninguna base de datos:
//
//   1. LA REGLA PURA. resolverTecnicoDelCierre() aplica los tres casos y no consulta nada.
//   2. EL CONTROLLER REAL con el repositorio simulado: que la elegibilidad se comprueba
//      contra la base ANTES de cerrar, que la asignacion y el cierre van en la misma
//      transaccion, y que un tecnico invalido revierte todo sin cerrar nada.
//
// Con mocks y no contra db-refactor porque cerrar una OT mueve ciclos y no se puede
// deshacer. Lo que SI se verifico contra la base, en BEGIN ... ROLLBACK, es el SQL del
// catalogo, el de la asignacion y las subconsultas de nombre.
//
//   node --experimental-test-module-mocks --test test/tecnicoCierre.test.js
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

import {
  resolverTecnicoDelCierre,
  prepararApertura,
  prepararCierre,
  prepararActualizacionCabecera,
  presentarOrden,
  ORIGEN_TECNICO,
  CODIGOS_TECNICO,
  CAMPOS_EDITABLES_CABECERA,
  CAMPOS_ADMITIDOS_APERTURA
} from '../src/modules/programas/programacion/ordenes/service.js';

import {
  esUsuarioTi,
  ROL_TI
} from '../src/modules/programas/comun.js';

// Los dos usuarios del enunciado. persona_id es lo que liga la cuenta con personal.
const CARLOS_TI = { id: 3, username: 'cperez', rol: 'ti', persona_id: 501 };
const DANIEL_SUP = { id: 2, username: 'dobando', rol: 'supervisor', persona_id: null };
const ADMIN = { id: 1, username: 'admin', rol: 'admin', persona_id: null };
const TI_SIN_PERSONA = { id: 9, username: 'ti', rol: 'ti', persona_id: null };

const orden = (extra = {}) => ({
  id: 7001,
  programacion_id: 12575,
  tecnico_id: null,
  abierta_por_id: 3,
  cerrada_por_id: null,
  fecha_apertura: '2026-10-09T12:00:00.000Z',
  fecha_cierre: null,
  estado: 'ABIERTA',
  motivo_anulacion: null,
  minutos: null,
  evidencias: [],
  observaciones: null,
  created_at: '2026-10-09T12:00:00.000Z',
  updated_at: '2026-10-09T12:00:00.000Z',
  programa_unidad_id: 2714,
  placa: 'V9V867',
  quincena_efectiva: '2026-10-01',
  tecnico_nombre: null,
  cerrada_por_username: null,
  cerrada_por_nombre: null,
  ...extra
});

// =====================================================================================
// 1 · LA REGLA PURA
// =====================================================================================

test('esUsuarioTi · normaliza y no se deja engañar por mayúsculas ni espacios', () => {
  assert.equal(ROL_TI, 'ti');
  assert.equal(esUsuarioTi({ rol: 'ti' }), true);
  assert.equal(esUsuarioTi({ rol: ' TI ' }), true);
  assert.equal(esUsuarioTi({ rol: 'admin' }), false);
  assert.equal(esUsuarioTi({ rol: 'supervisor' }), false);
  assert.equal(esUsuarioTi({}), false);
  assert.equal(esUsuarioTi(null), false);
  assert.equal(esUsuarioTi({ rol: 'tiburon' }), false, 'no es un prefijo, es el rol exacto');
});

// =====================================================================================
// CONSISTENCIA DE LA DEFINICION DE TI · una sola semantica en los dos lados
// =====================================================================================
// usuarios.rol no tiene CHECK, asi que su contenido no es de fiar. El riesgo que esto cubre
// es una GRIETA: que el backend reconozca a alguien como TI -y por tanto se autoasigne al
// cerrar- pero el catalogo no lo liste, de modo que nadie pudiera seleccionarlo.
//
// Las variantes de abajo son el contrato: la MISMA respuesta tienen que dar las CUATRO
// vias -esUsuarioTi(), el SQL de elegibilidad, el catalogo y la resolucion automatica del
// cierre-. Aqui se fija el lado de aplicacion; las cuatro juntas se comprueban contra la
// base en la sonda de BEGIN ... ROLLBACK, reescribiendo el rol variante por variante.
// La expresion SQL que iguala a trim() de JS se MIDIO sobre 23 caracteres contra
// PostgreSQL 18.6: regexp_replace con [[:space:]﻿]. El BOM entra explicito porque el
// estandar de JS lo cuenta como WhiteSpace y PostgreSQL no lo considera espacio.
export const VARIANTES_DE_ROL = [
  ['ti', true, 'el valor canonico'],
  ['TI', true, 'mayusculas: lower() en los dos lados'],
  ['Ti', true, 'mayuscula inicial'],
  [' ti ', true, 'espacios alrededor'],
  ['  TI  ', true, 'espacios y mayusculas a la vez'],
  ['\tti\t', true, 'TABULACION'],
  ['\nti\n', true, 'SALTO DE LINEA'],
  ['\r\nti\r\n', true, 'CRLF'],
  [' ti ', true, 'NBSP U+00A0'],
  ['﻿ti﻿', true, 'BOM U+FEFF'],
  ['  \t\n ti \n\t  ', true, 'mezcla de espacios, tabs y saltos'],
  ['admin', false, 'otro rol'],
  ['supervisor', false, 'otro rol'],
  ['auditor', false, 'el DEFAULT de la columna, que no existe en ROLE_PERMISSIONS'],
  ['tiburon', false, 'contiene ti pero no es el rol: la comparacion es por igualdad'],
  ['xti', false, 'ti como sufijo'],
  ['ti ti', false, 'dos veces ti'],
  ['t_i', false, 'contiene t e i, no es ti'],
  ['t i', false, 'un espacio INTERIOR no se recorta, ni en JS ni en SQL'],
  ['​ti​', false, 'ZWSP U+200B: JS NO lo recorta, y el SQL tampoco'],
  ['', false, 'vacio'],
  [null, false, 'nulo: coalesce a vacio en SQL, ?? en JS']
];

test('CONSISTENCIA · esUsuarioTi aplica exactamente la normalización del middleware', () => {
  // El middleware hace String(usuario.rol || '').trim().toLowerCase(); esUsuarioTi hace
  // String(usuario?.rol ?? '').trim().toLowerCase(). Para una columna varchar las dos
  // coinciden, y es esa la semántica que el SQL del catálogo tiene que copiar.
  const comoElMiddleware = rol =>
    String(rol || '').trim().toLowerCase() === 'ti';

  for (const [rol, esperado, porque] of VARIANTES_DE_ROL) {
    assert.equal(
      esUsuarioTi({ rol }),
      esperado,
      `esUsuarioTi(${JSON.stringify(rol)}) · ${porque}`
    );

    assert.equal(
      comoElMiddleware(rol),
      esperado,
      `el middleware coincide para ${JSON.stringify(rol)} · ${porque}`
    );
  }
});

test('CONSISTENCIA · el rol normalizado decide la autoasignación, no el valor crudo', () => {
  // Si la resolución del cierre usara el valor crudo, un usuario con rol 'TI' caería en el
  // flujo de no-TI y se le exigiría seleccionar técnico. Esto fija que no ocurre.
  for (const [rol, esTi] of VARIANTES_DE_ROL) {
    const r = (() => {
      try {
        return resolverTecnicoDelCierre({
          orden: orden(),
          usuario: { id: 3, rol, persona_id: 501 },
          tecnicoSolicitado: null
        });
      } catch (e) {
        return { error: e.code };
      }
    })();

    if (esTi) {
      assert.equal(
        r.origen,
        ORIGEN_TECNICO.AUTOMATICO_TI,
        `rol ${JSON.stringify(rol)} tiene que autoasignarse`
      );
      assert.equal(r.tecnico_id, 501);
    } else {
      assert.equal(
        r.error,
        CODIGOS_TECNICO.NO_SELECCIONADO,
        `rol ${JSON.stringify(rol)} tiene que exigir selección`
      );
    }
  }
});

test('CASO 1 · TI con persona: se autoasigna su propia persona', () => {
  const r = resolverTecnicoDelCierre({
    orden: orden(),
    usuario: CARLOS_TI,
    tecnicoSolicitado: null
  });

  assert.equal(r.tecnico_id, 501, 'su persona, no su id de usuario');
  assert.equal(r.origen, ORIGEN_TECNICO.AUTOMATICO_TI);
  assert.equal(r.escribir, true);
  assert.equal(r.validar, true, 'aun asi hay que comprobar que su persona esté activa');
  assert.equal(r.solicitud_ignorada, false);
});

test('CASO 1 · TI que manda OTRO técnico: prevalece su identidad y queda constancia', () => {
  const r = resolverTecnicoDelCierre({
    orden: orden(),
    usuario: CARLOS_TI,
    tecnicoSolicitado: 999
  });

  assert.equal(r.tecnico_id, 501, 'NO puede adjudicar su trabajo a otro');
  assert.equal(r.origen, ORIGEN_TECNICO.AUTOMATICO_TI);
  assert.equal(r.solicitud_ignorada, true, 'el intento queda visible en la respuesta');
});

test('CASO 1 · TI que manda su propio id: no se marca como ignorado', () => {
  const r = resolverTecnicoDelCierre({
    orden: orden(),
    usuario: CARLOS_TI,
    tecnicoSolicitado: 501
  });

  assert.equal(r.tecnico_id, 501);
  assert.equal(r.solicitud_ignorada, false);
});

test('CASO 1 · TI sin persona_id: 409 USUARIO_TI_SIN_PERSONA, no degrada al flujo de admin', () => {
  try {
    resolverTecnicoDelCierre({
      orden: orden(),
      usuario: TI_SIN_PERSONA,
      tecnicoSolicitado: 777
    });

    assert.fail('tenía que lanzar');
  } catch (e) {
    assert.equal(e.status, 409);
    assert.equal(e.code, CODIGOS_TECNICO.TI_SIN_PERSONA);
    assert.match(e.message, /no está vinculado a un registro de personal activo/);
  }
});

test('CASO 2 · no-TI sin selección: 409 TECNICO_NO_SELECCIONADO', () => {
  for (const usuario of [DANIEL_SUP, ADMIN]) {
    try {
      resolverTecnicoDelCierre({
        orden: orden(),
        usuario,
        tecnicoSolicitado: null
      });

      assert.fail(`tenía que lanzar para ${usuario.rol}`);
    } catch (e) {
      assert.equal(e.status, 409);
      assert.equal(e.code, CODIGOS_TECNICO.NO_SELECCIONADO);
      assert.match(e.message, /Debe seleccionar el técnico TI/);
    }
  }
});

test('CASO 2 · no-TI con selección: se usa la seleccionada y se valida', () => {
  const r = resolverTecnicoDelCierre({
    orden: orden(),
    usuario: ADMIN,
    tecnicoSolicitado: 501
  });

  assert.equal(r.tecnico_id, 501);
  assert.equal(r.origen, ORIGEN_TECNICO.SELECCIONADO);
  assert.equal(r.escribir, true);
  assert.equal(r.validar, true, 'la elegibilidad NO se da por buena');
});

test('CASO 2 · un no-TI no puede ponerse a sí mismo: su persona pasa por la misma validación', () => {
  // Un admin con persona ligada que intenta seleccionarse. La regla no lo distingue por
  // nombre: lo manda a validar contra el catálogo, y su cuenta no es rol ti, así que la
  // validación de base lo rechazará. Aquí se fija que NO hay atajo por ser él mismo.
  const adminConPersona = { ...ADMIN, persona_id: 334 };

  const r = resolverTecnicoDelCierre({
    orden: orden(),
    usuario: adminConPersona,
    tecnicoSolicitado: 334
  });

  assert.equal(r.origen, ORIGEN_TECNICO.SELECCIONADO);
  assert.equal(r.validar, true, 'pasa por la validación como cualquier otra selección');
});

test('CASO 3 · la OT ya tiene técnico: se conserva, cierre quien cierre', () => {
  for (const usuario of [CARLOS_TI, ADMIN, DANIEL_SUP, TI_SIN_PERSONA]) {
    const r = resolverTecnicoDelCierre({
      orden: orden({ tecnico_id: 444 }),
      usuario,
      tecnicoSolicitado: null
    });

    assert.equal(r.tecnico_id, 444, `conservado para ${usuario.rol}`);
    assert.equal(r.origen, ORIGEN_TECNICO.CONSERVADO);
    assert.equal(r.escribir, false, 'no se reescribe');
    assert.equal(r.validar, false, 'no se revalida un histórico');
  }
});

test('CASO 3 · con técnico ya asignado, un envío distinto se ignora y se informa', () => {
  const r = resolverTecnicoDelCierre({
    orden: orden({ tecnico_id: 444 }),
    usuario: ADMIN,
    tecnicoSolicitado: 501
  });

  assert.equal(r.tecnico_id, 444);
  assert.equal(r.solicitud_ignorada, true);
});

test('CASO 3 gana sobre el CASO 1: un TI sin persona puede cerrar una OT ya asignada', () => {
  // Si el orden fuera el contrario, el TI sin persona no podría cerrar NUNCA, ni siquiera
  // una orden cuyo técnico ya está decidido.
  const r = resolverTecnicoDelCierre({
    orden: orden({ tecnico_id: 444 }),
    usuario: TI_SIN_PERSONA,
    tecnicoSolicitado: null
  });

  assert.equal(r.tecnico_id, 444);
  assert.equal(r.origen, ORIGEN_TECNICO.CONSERVADO);
});

// -------------------------------------------------------------------------------------

test('CREAR OT · no admite ningún campo, y tecnico_id queda NULL', () => {
  assert.deepEqual(CAMPOS_ADMITIDOS_APERTURA, []);
  assert.deepEqual(prepararApertura(undefined), { tecnico_id: null });
  assert.deepEqual(prepararApertura(null), { tecnico_id: null });
  assert.deepEqual(prepararApertura({}), { tecnico_id: null });

  try {
    prepararApertura({ tecnico_id: 501 });
    assert.fail('tenía que rechazar');
  } catch (e) {
    assert.equal(e.status, 400);
    assert.match(e.message, /no admite ningún campo/);
    assert.match(e.message, /se resuelve únicamente al cerrar/);
  }
});

test('EDITAR cabecera · tecnico_id ya no es editable: 400', () => {
  assert.ok(
    !CAMPOS_EDITABLES_CABECERA.includes('tecnico_id'),
    'tecnico_id fuera de la lista blanca'
  );
  // `evidencias` salio de esta lista en F5.2: desde 20261010_018 la evidencia fotografica
  // vive en ordenes_trabajo_evidencias y el jsonb legacy dejo de ser editable. Lo que esta
  // prueba fija sigue siendo lo de F5.1 -que tecnico_id NO esta-, y el resto de la lista se
  // comprueba tal como es ahora.
  assert.deepEqual(CAMPOS_EDITABLES_CABECERA, ['minutos', 'observaciones']);

  try {
    prepararActualizacionCabecera({ tecnico_id: 501 });
    assert.fail('tenía que rechazar');
  } catch (e) {
    assert.equal(e.status, 400);
    assert.match(e.message, /tecnico_id/);
  }

  // y lo que sí es editable sigue funcionando
  const ok = prepararActualizacionCabecera({ minutos: 30 });

  assert.deepEqual(ok.campos, ['minutos']);
  assert.equal(ok.data.minutos, 30);

  // la rama de tecnico_id se retiró del normalizador: ya no existe ni como undefined
  assert.ok(
    !Object.prototype.hasOwnProperty.call(ok.data, 'tecnico_id'),
    'tecnico_id no debe aparecer ni como clave'
  );
});

test('CERRAR · tecnico_id es opcional y solo se valida su formato', () => {
  assert.equal(prepararCierre({}).tecnico_id, null);
  assert.equal(prepararCierre({ tecnico_id: null }).tecnico_id, null);
  assert.equal(prepararCierre({ tecnico_id: '' }).tecnico_id, null);
  assert.equal(prepararCierre({ tecnico_id: '501' }).tecnico_id, 501, 'string -> entero');
  assert.equal(prepararCierre({ tecnico_id: 501 }).tecnico_id, 501);

  for (const malo of [0, -1, 'abc', 1.5, [501], {}]) {
    try {
      prepararCierre({ tecnico_id: malo });
      assert.fail(`tenía que rechazar ${JSON.stringify(malo)}`);
    } catch (e) {
      assert.equal(e.status, 400, `para ${JSON.stringify(malo)}`);
    }
  }
});

// -------------------------------------------------------------------------------------

test('PRESENTAR · publica el nombre del técnico y el de quien cerró', () => {
  const p = presentarOrden(
    orden({
      estado: 'CERRADA',
      tecnico_id: 501,
      tecnico_nombre: 'CARLOS PEREZ',
      cerrada_por_id: 2,
      cerrada_por_username: 'dobando',
      cerrada_por_nombre: 'DANIEL OBANDO',
      fecha_cierre: '2026-10-09T18:00:00.000Z'
    }),
    []
  );

  assert.deepEqual(p.tecnico, { id: 501, nombre: 'CARLOS PEREZ' });
  assert.deepEqual(p.cerrada_por, {
    id: 2,
    username: 'dobando',
    nombre: 'DANIEL OBANDO'
  });

  // los id planos siguen ahí: esto AÑADE, no sustituye
  assert.equal(p.tecnico_id, 501);
  assert.equal(p.cerrada_por_id, 2);

  // y los campos crudos de nombre NO se filtran al contrato
  assert.equal(p.tecnico_nombre, undefined);
  assert.equal(p.cerrada_por_username, undefined);
  assert.equal(p.cerrada_por_nombre, undefined);
});

test('PRESENTAR · cerrada_por sin persona ligada: username como identidad, nombre null', () => {
  const p = presentarOrden(
    orden({
      estado: 'CERRADA',
      tecnico_id: 501,
      tecnico_nombre: 'CARLOS PEREZ',
      cerrada_por_id: 1,
      cerrada_por_username: 'admin',
      cerrada_por_nombre: null
    }),
    []
  );

  assert.deepEqual(p.cerrada_por, {
    id: 1,
    username: 'admin',
    nombre: null
  });
});

test('PRESENTAR · una OT abierta no tiene técnico ni cerrada_por: ambos null', () => {
  const p = presentarOrden(orden(), []);

  assert.equal(p.tecnico, null);
  assert.equal(p.cerrada_por, null);
});

// =====================================================================================
// 2 · EL CONTROLLER REAL
// =====================================================================================

let llamadas;
let ordenEnBase;
let elegibles;

mock.module('../src/modules/programas/programacion/ordenes/repository.js', {
  namedExports: {
    obtenerOrdenParaEscritura: async () => ordenEnBase,
    obtenerResultadoDeVisita: async () => ({
      id: 12575,
      estado: 'PROGRAMADO',
      fecha_ejecucion: null
    }),
    asignarTecnicoAlCerrar: async (otId, tecnicoId) => {
      llamadas.push(['ASIGNAR', otId, tecnicoId]);

      ordenEnBase = { ...ordenEnBase, tecnico_id: tecnicoId };

      return true;
    },
    cerrarOrden: async (otId, cerradaPorId) => {
      llamadas.push(['CERRAR', otId, cerradaPorId]);

      ordenEnBase = {
        ...ordenEnBase,
        estado: 'CERRADA',
        cerrada_por_id: cerradaPorId,
        fecha_cierre: '2026-10-09T18:00:00.000Z'
      };

      return { estado_programacion: 'EJECUTADO', ciclos_afectados: 3 };
    },
    obtenerOrdenPorId: async () => ordenEnBase,
    obtenerDetallesDeOrdenes: async ids => new Map(ids.map(id => [id, []])),
    existeVisitaEnPrograma: async () => true,

    // F5.2 · el controller importa ahora el almacen de evidencias. Esta suite prueba la
    // resolucion del TECNICO, no la evidencia, asi que los stubs devuelven el caso neutro:
    // sin detalles que validar no hay incumplimiento y el cierre sigue su curso, que es
    // justo el escenario que estas pruebas necesitan. mock.module sustituye el modulo
    // ENTERO, asi que tiene que ofrecer todo lo que el controller importa.
    obtenerDetallesParaValidarCierre: async () => [],
    obtenerDetalleParaEvidencia: async () => null,
    bloquearDetalleParaEvidencia: async () => null,
    contarEvidenciasActivas: async () => 0,
    insertarEvidencia: async () => 1,
    obtenerEvidenciasActivasDeOrden: async () => [],
    obtenerEvidenciaDeOrden: async () => null,
    obtenerEvidenciaParaRetiro: async () => null,
    retirarEvidencia: async () => true,
    // el resto del modulo, no usado por esta ruta
    obtenerProgramacionParaApertura: async () => null,
    contarEquiposPrevistos: async () => 1,
    contarOrdenesActivas: async () => 0,
    insertarOrden: async () => ordenEnBase,
    materializarDetalles: async () => 1,
    obtenerOrdenes: async () => [],
    obtenerDetalleDeOrden: async () => null,
    actualizarOrden: async () => 1,
    actualizarDetalle: async () => 1,
    evidenciasIgualesEnOrden: async () => false,
    evidenciasIgualesEnDetalle: async () => false,
    anularOrden: async () => 1
  }
});

mock.module('../src/modules/programas/repository.js', {
  namedExports: {
    existePrograma: async id => id === 90,
    esTecnicoTiElegible: async personaId => {
      llamadas.push(['VALIDAR', personaId]);

      return elegibles.includes(personaId);
    }
  }
});

mock.module('../src/config/database.js', {
  namedExports: {
    pool: {
      connect: async () => ({
        query: async texto => {
          llamadas.push(['sql', String(texto).trim().split(/\s+/)[0]]);

          return { rows: [], rowCount: 0 };
        },
        release: () => {}
      })
    }
  }
});

mock.module('../src/services/auditService.js', {
  namedExports: {
    logAction: async (userId, accion) => {
      llamadas.push(['auditar', userId, accion]);
    }
  }
});

mock.module('../src/modules/programas/programacion/ordenes/checklist.js', { namedExports: { validarChecklistAlCerrar: async () => {} } });

const { cerrarOrdenTrabajo } = await import(
  '../src/modules/programas/programacion/ordenes/controller.js'
);

beforeEach(() => {
  llamadas = [];
  ordenEnBase = orden();
  elegibles = [501];
});

const solicitud = (usuario, cuerpo = {}) => ({
  body: cuerpo,
  params: { programaId: '90', programacionId: '12575', otId: '7001' },
  user: usuario,
  method: 'POST',
  originalUrl: '/api/programas-mantenimiento/90/programacion/12575/'
    + 'ordenes-trabajo/7001/cerrar',
  headers: {},
  ip: '127.0.0.1'
});

const respuesta = () => ({
  codigo: 200,
  status(codigo) { this.codigo = codigo; return this; },
  json(datos) { this.datos = datos; return this; }
});

const solo = tipo => llamadas.filter(l => l[0] === tipo);

const transaccion = () => llamadas
  .filter(l => l[0] === 'sql')
  .map(l => l[1]);

// -------------------------------------------------------------------------------------

test('CIERRE · TI con persona activa: asigna, cierra y audita, en ese orden', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(CARLOS_TI), res);

  assert.equal(res.codigo, 200);

  assert.deepEqual(solo('VALIDAR'), [['VALIDAR', 501]], 'valida contra la base');
  assert.deepEqual(solo('ASIGNAR'), [['ASIGNAR', 7001, 501]]);
  assert.deepEqual(solo('CERRAR'), [['CERRAR', 7001, 3]], 'cerrada_por = el usuario');

  // el orden importa: validar, asignar y solo despues cerrar
  const orden3 = llamadas
    .filter(l => ['VALIDAR', 'ASIGNAR', 'CERRAR'].includes(l[0]))
    .map(l => l[0]);

  assert.deepEqual(orden3, ['VALIDAR', 'ASIGNAR', 'CERRAR']);

  assert.deepEqual(transaccion(), ['BEGIN', 'COMMIT']);

  assert.equal(res.datos.tecnico.id, 501);
  assert.equal(res.datos.cerrada_por.id, 3);
});

test('CIERRE · TI que manda otro técnico: se asigna el suyo, no el enviado', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(CARLOS_TI, { tecnico_id: 999 }), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(solo('ASIGNAR'), [['ASIGNAR', 7001, 501]], 'el 999 se ignoró');
  assert.deepEqual(solo('VALIDAR'), [['VALIDAR', 501]]);
});

test('CIERRE · TI sin persona: 409, ROLLBACK y la base NO se toca', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(TI_SIN_PERSONA), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_TECNICO.TI_SIN_PERSONA);
  assert.deepEqual(solo('ASIGNAR'), [], 'sin asignación');
  assert.deepEqual(solo('CERRAR'), [], 'sin cierre');
  assert.deepEqual(solo('auditar'), [], 'sin auditoría');
  assert.deepEqual(transaccion(), ['BEGIN', 'ROLLBACK']);
});

test('CIERRE · TI cuya persona NO está activa: 409 y rollback completo', async () => {
  elegibles = [];

  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(CARLOS_TI), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_TECNICO.TI_SIN_PERSONA);
  assert.deepEqual(solo('VALIDAR'), [['VALIDAR', 501]], 'se consultó la base');
  assert.deepEqual(solo('ASIGNAR'), []);
  assert.deepEqual(solo('CERRAR'), []);
  assert.deepEqual(transaccion(), ['BEGIN', 'ROLLBACK']);
});

test('CIERRE · admin sin seleccionar técnico: 409 claro y nada escrito', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(ADMIN), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_TECNICO.NO_SELECCIONADO);
  assert.match(res.datos.error, /Debe seleccionar el técnico TI/);
  assert.deepEqual(solo('VALIDAR'), [], 'ni se consulta: falta el dato');
  assert.deepEqual(solo('CERRAR'), []);
  assert.deepEqual(transaccion(), ['BEGIN', 'ROLLBACK']);
});

test('CIERRE · admin con técnico TI elegible: cierre correcto, técnico y cerrador distintos', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(ADMIN, { tecnico_id: 501 }), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(solo('VALIDAR'), [['VALIDAR', 501]]);
  assert.deepEqual(solo('ASIGNAR'), [['ASIGNAR', 7001, 501]]);
  assert.deepEqual(solo('CERRAR'), [['CERRAR', 7001, 1]], 'cerrada_por = admin');

  assert.equal(res.datos.tecnico.id, 501, 'ejecutor');
  assert.equal(res.datos.cerrada_por.id, 1, 'quien cerró');
  assert.notEqual(res.datos.tecnico.id, res.datos.cerrada_por.id);
});

test('CIERRE · admin que selecciona a alguien sin cuenta TI: 409 NO_ELEGIBLE y rollback', async () => {
  const res = respuesta();

  // 334 es la persona del admin: existe en personal pero su cuenta no es rol ti.
  await cerrarOrdenTrabajo(solicitud(ADMIN, { tecnico_id: 334 }), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_TECNICO.NO_ELEGIBLE);
  assert.match(res.datos.error, /no es un técnico TI elegible/);
  assert.deepEqual(solo('VALIDAR'), [['VALIDAR', 334]]);
  assert.deepEqual(solo('ASIGNAR'), []);
  assert.deepEqual(solo('CERRAR'), []);
  assert.deepEqual(transaccion(), ['BEGIN', 'ROLLBACK']);
});

test('CIERRE · admin que se selecciona a sí mismo: mismo rechazo, sin atajo', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(
    solicitud({ ...ADMIN, persona_id: 334 }, { tecnico_id: 334 }),
    res
  );

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_TECNICO.NO_ELEGIBLE);
  assert.deepEqual(solo('CERRAR'), []);
});

test('CIERRE · OT ya asignada: conserva el técnico y no revalida, cierre quien cierre', async () => {
  ordenEnBase = orden({ tecnico_id: 444, tecnico_nombre: 'OTRO TECNICO' });

  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(ADMIN, { tecnico_id: 501 }), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(solo('VALIDAR'), [], 'un histórico no se revalida');
  assert.deepEqual(solo('ASIGNAR'), [], 'no se reescribe');
  assert.deepEqual(solo('CERRAR'), [['CERRAR', 7001, 1]]);
  assert.equal(res.datos.tecnico.id, 444, 'el técnico original');
  assert.equal(res.datos.cerrada_por.id, 1);
});

test('CIERRE · la auditoría nombra el técnico y de dónde salió', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(ADMIN, { tecnico_id: 501 }), res);

  assert.equal(res.codigo, 200);

  const auditoria = solo('auditar');

  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0][1], 1, 'el usuario que cerró');
  assert.match(auditoria[0][2], /Tecnico 501 \(SELECCIONADO\)/);
});

test('CIERRE · el cierre sigue devolviendo lo que derivó la base: ciclos y resultado', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(CARLOS_TI), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.estado_programacion, 'EJECUTADO');
  assert.equal(res.datos.ciclos_afectados, 3);
  assert.deepEqual(res.datos.tecnico, {
    id: 501,
    origen: 'AUTOMATICO_TI',
    solicitud_ignorada: false
  });
});

test('CIERRE · un campo sobrante sigue dando 400 antes de abrir transacción', async () => {
  const res = respuesta();

  await cerrarOrdenTrabajo(solicitud(CARLOS_TI, { cerrada_por_id: 9 }), res);

  assert.equal(res.codigo, 400);
  assert.match(res.datos.error, /cerrada_por_id/);
  assert.deepEqual(transaccion(), [], 'no se abrió ninguna transacción');
});
