import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';

// Contrato de logAction. Lo que se protege aqui es la DECISION de quien ejecuta el INSERT
// de auditoria y si el error llega al llamador: es lo unico que puede romperse editando
// auditService.js, y de ello dependen los 32 llamadores existentes.
//
// El pool se simula, igual que inspecciones.test.js simula el repositorio y Cloudinary, asi
// que el bloque principal no necesita .env ni toca Neon. Al final hay un bloque CONTRA LA
// BASE REAL para lo que solo PostgreSQL puede demostrar -visibilidad dentro de la
// transaccion, ROLLBACK y 25P02-; se omite solo si no hay DATABASE_URL.
//
// La prueba NO escribe el SQL de auditoria: lo captura del servicio. Si alguien duplicara el
// INSERT en una segunda implementacion, la comparacion legacy/transaccional lo delataria.

let pool;
let registro = [];

const resultadoFalso = { rows: [], rowCount: 1, command: 'INSERT' };

// Doble de pg: recuerda cada consulta y puede fallar a voluntad con un error de PostgreSQL.
const crearDoble = nombre => ({
  fallo: null,
  query (texto, valores) {
    registro.push({ ejecutor: nombre, texto, valores });

    if (this.fallo) {
      return Promise.reject(this.fallo);
    }

    return Promise.resolve(resultadoFalso);
  }
});

const errorDePostgres = (code, constraint) =>
  Object.assign(new Error(`fallo simulado de PostgreSQL (${code})`), {
    code,
    constraint
  });

pool = crearDoble('pool');

mock.module('../src/config/database.js', {
  exports: { pool }
});

const { logAction } = await import('../src/services/auditService.js');

const req = { ip: '10.0.0.7', socket: {}, headers: {} };

const deAuditoria = () =>
  registro.filter(c => /INSERT INTO audit_logs/.test(c.texto));

const soloDe = nombre =>
  deAuditoria().filter(c => c.ejecutor === nombre);

describe('logAction · contrato de los dos modos', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test('CASO A · legacy: ejecuta el INSERT por el pool y devuelve undefined', async () => {
    registro = [];
    pool.fallo = null;

    const devuelto = await logAction(
      7,
      'accion de prueba',
      'audit_logs',
      req,
      { antes: 1 },
      { despues: 2 }
    );

    assert.equal(devuelto, undefined, 'el contrato actual devuelve undefined');
    assert.equal(soloDe('pool').length, 1, 'un unico INSERT, por el pool');
    assert.equal(deAuditoria().length, 1, 'y ninguna otra escritura de auditoria');

    const [consulta] = soloDe('pool');
    assert.match(consulta.texto, /INSERT INTO audit_logs/);
    assert.equal(consulta.valores.length, 6, 'seis parametros, como siempre');
    assert.equal(consulta.valores[0], 7, 'el user_id viaja tal cual');
    assert.equal(consulta.valores[3], '10.0.0.7', 'la ip se normaliza igual que antes');
  });

  test('CASO A · legacy: un fallo de auditoria NO se propaga', async () => {
    registro = [];
    pool.fallo = errorDePostgres('23503', 'audit_logs_user_id_fkey');
    const consola = mock.method(console, 'error', () => {});

    const devuelto = await logAction(7, 'accion que falla', 'audit_logs', req);

    assert.equal(devuelto, undefined, 'no lanza: el llamador sigue su curso');
    assert.equal(consola.mock.callCount(), 1, 'el fallo se registra en consola');
    assert.equal(soloDe('pool').length, 1, 'se intento por el pool');

    pool.fallo = null;
  });

  test('CASO B · con client: usa client.query y NUNCA el pool', async () => {
    registro = [];
    pool.fallo = null;
    const client = crearDoble('client');

    await logAction(7, 'accion transaccional', 'audit_logs', req, null, null, { client });

    assert.equal(soloDe('client').length, 1, 'el INSERT fue por el client');
    assert.equal(
      soloDe('pool').length,
      0,
      'cero llamadas al pool: no hay caida silenciosa a la conexion del pool'
    );
  });

  test('UNA sola implementacion: legacy y transaccional emiten el mismo SQL', async () => {
    registro = [];
    pool.fallo = null;
    const client = crearDoble('client');
    const argumentos = [7, 'misma accion', 'audit_logs', req, { a: 1 }, { b: 2 }];

    await logAction(...argumentos);
    await logAction(...argumentos, { client });

    const [porPool] = soloDe('pool');
    const [porClient] = soloDe('client');

    assert.equal(porClient.texto, porPool.texto, 'el texto del INSERT es el mismo');
    assert.deepEqual(
      porClient.valores,
      porPool.valores,
      'y los parametros tambien: el modo no cambia lo que se escribe'
    );
  });

  test('CASO C · con client: el error se propaga por defecto y conserva el code', async () => {
    registro = [];
    const client = crearDoble('client');
    client.fallo = errorDePostgres('23503', 'audit_logs_user_id_fkey');
    const consola = mock.method(console, 'error', () => {});

    await assert.rejects(
      () => logAction(7, 'accion transaccional', 'audit_logs', req, null, null, { client }),
      error => {
        assert.equal(error.code, '23503', 'el code de PostgreSQL llega intacto');
        assert.equal(error.constraint, 'audit_logs_user_id_fkey');
        return true;
      }
    );

    assert.equal(
      consola.mock.callCount(),
      0,
      'no lo registra y lo traga a la vez: lo entrega al llamador'
    );
  });

  test('con client: propagarError false desactiva la propagacion', async () => {
    registro = [];
    const client = crearDoble('client');
    client.fallo = errorDePostgres('23503', 'audit_logs_user_id_fkey');
    mock.method(console, 'error', () => {});

    const devuelto = await logAction(
      7,
      'accion transaccional',
      'audit_logs',
      req,
      null,
      null,
      { client, propagarError: false }
    );

    assert.equal(devuelto, undefined, 'la opcion explicita manda sobre el valor por defecto');
  });

  test('CASO D · propagarError true sin client: propaga, por el pool', async () => {
    registro = [];
    pool.fallo = errorDePostgres('23502');
    const consola = mock.method(console, 'error', () => {});

    await assert.rejects(
      () => logAction(7, 'accion legacy estricta', 'audit_logs', req, null, null, {
        propagarError: true
      }),
      error => error.code === '23502'
    );

    assert.equal(soloDe('pool').length, 1, 'siguio siendo el pool quien lo intento');
    assert.equal(consola.mock.callCount(), 0);

    pool.fallo = null;
  });

  test('el modo por defecto no cambia: sin opciones sigue sin propagar', async () => {
    registro = [];
    pool.fallo = errorDePostgres('23502');
    mock.method(console, 'error', () => {});

    await assert.doesNotReject(
      () => logAction(7, 'accion legacy', 'audit_logs', req),
      'los 32 llamadores existentes conservan su comportamiento'
    );

    pool.fallo = null;
  });
});

// ---------------------------------------------------------------------------------------
// Contra la base real. Aqui se comprueba lo que un doble no puede demostrar: que el INSERT
// entra de verdad en la transaccion del llamador. Se omite sin DATABASE_URL para que la
// suite siga corriendo donde no haya base.
// ---------------------------------------------------------------------------------------
let urlBase = null;

try {
  process.loadEnvFile();
  urlBase = process.env.DATABASE_URL ?? null;
} catch {
  urlBase = process.env.DATABASE_URL ?? null;
}

describe('logAction · transaccion real', { skip: urlBase ? false : 'sin DATABASE_URL' }, () => {
  let poolReal;
  let usuario;
  let inexistente;
  const marca = `prueba-auditoria-${process.pid}-${Date.now()}`;

  before(async () => {
    const { default: pg } = await import('pg');
    const url = new URL(urlBase);
    url.searchParams.set('sslmode', 'verify-full');
    poolReal = new pg.Pool({
      connectionString: url.toString(),
      connectionTimeoutMillis: 10000
    });

    // Ni ids ni placas fijadas a mano: el usuario valido se busca, y el invalido se calcula
    // para que no pueda existir.
    const r = await poolReal.query(
      'SELECT min(id)::int AS valido, (max(id) + 1000)::int AS libre FROM usuarios'
    );
    usuario = r.rows[0].valido;
    inexistente = r.rows[0].libre;
  });

  after(async () => {
    await poolReal.end();
  });

  afterEach(async () => {
    const vivas = await poolReal.query(
      'SELECT count(*)::int AS n FROM audit_logs WHERE accion LIKE $1',
      [`${marca}%`]
    );
    assert.equal(vivas.rows[0].n, 0, 'ninguna fila de la prueba sobrevive');
  });

  test('CASO B · la fila vive en la transaccion y el ROLLBACK la descarta', async () => {
    const client = await poolReal.connect();

    try {
      const antes = await poolReal.query('SELECT count(*)::int AS n FROM audit_logs');

      await client.query('BEGIN');
      await logAction(usuario, `${marca} rollback`, 'audit_logs', req, null, null, {
        client
      });

      const dentro = await client.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE accion = $1',
        [`${marca} rollback`]
      );
      assert.equal(dentro.rows[0].n, 1, 'dentro de la transaccion la fila esta');

      const fuera = await poolReal.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE accion = $1',
        [`${marca} rollback`]
      );
      assert.equal(fuera.rows[0].n, 0, 'fuera todavia no se ve: no esta confirmada');

      await client.query('ROLLBACK');

      const despues = await poolReal.query('SELECT count(*)::int AS n FROM audit_logs');
      assert.equal(
        despues.rows[0].n,
        antes.rows[0].n,
        'tras el ROLLBACK audit_logs vuelve a su conteo'
      );
    } finally {
      client.release();
    }
  });

  test('CASO C · un fallo real aborta la transaccion y no persiste nada', async () => {
    const client = await poolReal.connect();

    try {
      const antes = await poolReal.query('SELECT count(*)::int AS n FROM audit_logs');

      await client.query('BEGIN');

      await assert.rejects(
        () => logAction(inexistente, `${marca} fk`, 'audit_logs', req, null, null, {
          client
        }),
        error => {
          assert.equal(error.code, '23503', 'violacion real de clave ajena');
          assert.equal(error.constraint, 'audit_logs_user_id_fkey');
          return true;
        }
      );

      // Por esto el modo transaccional no puede tragarse el error: la transaccion ya esta
      // muerta y el llamador tiene que enterarse para hacer ROLLBACK.
      await assert.rejects(
        () => client.query('SELECT 1'),
        error => error.code === '25P02'
      );

      await client.query('ROLLBACK');

      const despues = await poolReal.query('SELECT count(*)::int AS n FROM audit_logs');
      assert.equal(despues.rows[0].n, antes.rows[0].n, 'nada quedo persistido');
    } finally {
      client.release();
    }
  });
});
