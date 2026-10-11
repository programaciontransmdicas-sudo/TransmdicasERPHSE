import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ValidationError,
  normalizarId,
  traducirError
} from '../src/modules/programas/comun.js';

// Piezas compartidas del modulo programas. Son funciones puras y comun.js no importa nada,
// asi que estas pruebas no necesitan .env, ni mocks, ni conexion a Neon.
//
// Lo que se protege aqui es el dominio numerico. Todas las columnas a las que viajan estos
// id son integer de PostgreSQL -int4-, y un valor mayor provocaba un 22003 del servidor que
// la traduccion no reconocia y terminaba en HTTP 500. El limite se comprueba antes de
// consultar la base, y 22003 queda como defensa secundaria.

const INT4_MAX = 2147483647;

// Devuelve el error en vez de lanzarlo, para poder afirmar sobre status y mensaje.
const alNormalizar = valor => {
  try {
    return { valor: normalizarId('idDePrueba', valor) };
  } catch (error) {
    return { error };
  }
};

describe('normalizarId · dominio de enteros de int4', () => {
  test('acepta un entero positivo, como numero y como texto', () => {
    assert.equal(normalizarId('idDePrueba', 1), 1);
    assert.equal(normalizarId('idDePrueba', '1'), 1);
    assert.equal(normalizarId('idDePrueba', 90), 90);
  });

  test('acepta el maximo de int4: 2147483647', () => {
    assert.equal(normalizarId('idDePrueba', INT4_MAX), INT4_MAX);
    assert.equal(normalizarId('idDePrueba', String(INT4_MAX)), INT4_MAX);
  });

  test('conserva la tolerancia a espacios alrededor que ya tenia', () => {
    assert.equal(normalizarId('idDePrueba', ' 5 '), 5);
  });

  test('rechaza 2147483648: no cabe en una columna integer', () => {
    const { error } = alNormalizar(INT4_MAX + 1);

    assert.ok(error instanceof ValidationError);
    assert.equal(error.status, 400);
    assert.match(error.message, /no puede superar 2147483647/);
    assert.match(error.message, /idDePrueba/);
  });

  test('rechaza "2147483648" en texto', () => {
    const { error } = alNormalizar('2147483648');

    assert.equal(error.status, 400);
    assert.match(error.message, /no puede superar 2147483647/);
  });

  test('rechaza cualquier entero por encima del maximo', () => {
    for (const valor of [
      2147483648,
      9007199254740991,
      2.147483648e9,
      1e10
    ]) {
      const { error, valor: devuelto } = alNormalizar(valor);

      assert.ok(error, `${valor} deberia rechazarse, devolvio ${devuelto}`);
      assert.equal(error.status, 400);
    }
  });

  // Estos ya se rechazaban antes del arreglo: la prueba fija ese contrato para que no se
  // pierda al tocar el limite superior.
  test('sigue rechazando cero y negativos', () => {
    for (const valor of [0, -1, '-7']) {
      const { error } = alNormalizar(valor);

      assert.equal(error.status, 400);
      assert.match(error.message, /debe ser un entero positivo/);
    }
  });

  test('sigue rechazando decimales', () => {
    assert.equal(alNormalizar(1.5).error.status, 400);
    assert.equal(alNormalizar('1.5').error.status, 400);
  });

  test('sigue rechazando texto parcialmente numerico', () => {
    for (const valor of ['1abc', 'abc', '0x10', '1e3', '']) {
      const { error, valor: devuelto } = alNormalizar(valor);

      assert.ok(error, `${valor} deberia rechazarse, devolvio ${devuelto}`);
      assert.equal(error.status, 400);
    }
  });

  test('sigue rechazando NaN, Infinity, null y undefined', () => {
    for (const valor of [NaN, Infinity, -Infinity, null, undefined]) {
      assert.equal(alNormalizar(valor).error.status, 400);
    }
  });
});

// parseInt coacciona estructuras: [7] se convertia en 7, igual que ["7"] y que cualquier
// objeto con su propio toString. Por una ruta no es alcanzable -los parametros llegan como
// texto- pero por el cuerpo JSON si, y un array no es un identificador.
describe('normalizarId · solo acepta number y string', () => {
  test('acepta los dos tipos del contrato', () => {
    assert.equal(normalizarId('idDePrueba', 7), 7);
    assert.equal(normalizarId('idDePrueba', '7'), 7);
  });

  test('rechaza un array de un elemento, que antes se coaccionaba a 7', () => {
    for (const valor of [[7], ['7'], [7, 8], []]) {
      const { error, valor: devuelto } = alNormalizar(valor);

      assert.ok(error, `${JSON.stringify(valor)} deberia rechazarse, devolvio ${devuelto}`);
      assert.equal(error.status, 400);
    }
  });

  test('rechaza objetos, incluido uno con toString propio', () => {
    for (const valor of [
      {},
      { 0: 7 },
      { id: 7 },
      { toString () { return '7'; } },
      { valueOf () { return 7; } }
    ]) {
      const { error, valor: devuelto } = alNormalizar(valor);

      assert.ok(error, `un objeto deberia rechazarse, devolvio ${devuelto}`);
      assert.equal(error.status, 400);
    }
  });

  test('rechaza booleanos y envoltorios de primitivos', () => {
    for (const valor of [true, false, new Number(7), new String('7')]) {
      const { error, valor: devuelto } = alNormalizar(valor);

      assert.ok(error, `${typeof valor} deberia rechazarse, devolvio ${devuelto}`);
      assert.equal(error.status, 400);
    }
  });

  test('el mensaje de los tipos no primitivos es el que ya existia', () => {
    assert.match(alNormalizar([7]).error.message, /debe ser un entero positivo/);
    assert.match(alNormalizar({}).error.message, /debe ser un entero positivo/);
  });

  // La condicion hace short-circuit: con un tipo no primitivo id vale NaN, el primer
  // termino !Number.isInteger(id) ya es verdadero y String(valor) NUNCA se evalua. Asi un
  // toString ajeno no puede ejecutarse dentro del normalizador.
  //
  // Importa porque antes de la guarda SI se ejecutaba: un toString que lanzara producia un
  // Error generico -no un ValidationError- y habria terminado en HTTP 500.
  test('no ejecuta el toString del valor: short-circuit antes de String(valor)', () => {
    let ejecutado = false;

    const bomba = {
      toString () {
        ejecutado = true;
        throw new Error('el normalizador no debe ejecutar este toString');
      }
    };

    const { error } = alNormalizar(bomba);

    assert.ok(error instanceof ValidationError);
    assert.equal(error.status, 400);
    assert.match(error.message, /debe ser un entero positivo/);
    assert.equal(ejecutado, false, 'toString se ejecuto y no deberia');
  });

  test('tampoco ejecuta un valueOf que lance', () => {
    let ejecutado = false;

    const bomba = {
      valueOf () {
        ejecutado = true;
        throw new Error('el normalizador no debe ejecutar este valueOf');
      }
    };

    assert.equal(alNormalizar(bomba).error.status, 400);
    assert.equal(ejecutado, false);
  });
});

describe('traducirError · SQLSTATE a HTTP', () => {
  const respuesta = () => {
    const r = { code: null, body: null };
    r.status = n => { r.code = n; return r; };
    r.json = b => { r.body = b; return r; };
    return r;
  };

  const traducir = code => {
    const r = respuesta();
    traducirError({ code, constraint: null }, r, { mensajeGenerico: 'mensaje del dominio' });
    return r;
  };

  test('22003 se traduce a 400, no a 500', () => {
    const r = traducir('22003');

    assert.equal(r.code, 400);
    assert.equal(r.body.error, 'mensaje del dominio');
  });

  test('los codigos ya contemplados no cambian', () => {
    assert.equal(traducir('23505').code, 409);
    assert.equal(traducir('23503').code, 409);
    assert.equal(traducir('23514').code, 400);
    assert.equal(traducir('23502').code, 422);
    assert.equal(traducir('22008').code, 400);
    assert.equal(traducir('22007').code, 400);
  });

  test('un codigo desconocido sigue siendo 500', () => {
    assert.equal(traducir('XX999').code, 500);
  });

  test('un ValidationError conserva su propio status', () => {
    const r = respuesta();
    traducirError(new ValidationError('no encontrado', 404), r,
      { mensajeGenerico: 'mensaje del dominio' });

    assert.equal(r.code, 404);
    assert.equal(r.body.error, 'no encontrado');
  });

  test('no devuelve nunca el mensaje crudo del driver', () => {
    const r = respuesta();
    traducirError(
      { code: '22003', message: 'value "2147483648" is out of range for type integer' },
      r,
      { mensajeGenerico: 'mensaje del dominio' }
    );

    assert.equal(r.body.error, 'mensaje del dominio');
    assert.doesNotMatch(JSON.stringify(r.body), /out of range/);
  });
});
