import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

// Se prueba el controlador y el servicio reales; solo se simulan servicios externos.
// Estas pruebas no necesitan .env ni se conectan a Neon o Cloudinary.
let llamadas;
let falloCarga;
let falloRegistro;
const urlFoto = 'https://res.cloudinary.com/pruebas/image/upload/foto.jpg';
const anterior = {
  id: 1, placa: 'TEST01', fecha: '2026-09-19', hora: '10:00',
  img_tablet: '', img_radio: '', img_camaras: ''
};

mock.module('../src/modules/inspecciones/repository.js', {
  namedExports: {
    existeVehiculo: async () => { llamadas.push('vehiculo'); return true; },
    crearInspeccion: async datos => {
      llamadas.push(['crear', datos]);
      if (falloRegistro) throw new Error('Fallo simulado de base de datos');
      return { id: 2, ...datos };
    },
    obtenerHistorial: async () => [],
    obtenerInspeccionPorId: async () => anterior,
    actualizarInspeccion: async datos => {
      llamadas.push(['editar', datos]);
      return { ...anterior, ...datos };
    },
    eliminarInspeccion: async () => anterior
  }
});

mock.module('../src/services/cloudinaryService.js', {
  namedExports: {
    uploadToCloudinary: async () => {
      llamadas.push('subir');
      if (llamadas.filter(x => x === 'subir').length === falloCarga) {
        throw new Error('Fallo simulado de Cloudinary');
      }
      return urlFoto;
    },
    deleteFromCloudinary: async url => { llamadas.push(['eliminarFoto', url]); }
  }
});

mock.module('../src/services/auditService.js', {
  namedExports: { logAction: async () => { llamadas.push('auditar'); } }
});

const { registrarInspeccion, editarInspeccion } = await import(
  '../src/modules/inspecciones/controller.js'
);

beforeEach(() => {
  llamadas = [];
  falloCarga = 0;
  falloRegistro = false;
});

const foto = () => ({ buffer: Buffer.from('imagen simulada'), mimetype: 'image/jpeg' });
const solicitud = files => ({
  body: { placa: 'TEST01', fecha: '2026-09-19', hora: '10:00', tablet: 'OK', radio: 'OK', camaras: 'OK' },
  files,
  user: { id: 1 },
  params: { id: '1' }
});
const respuesta = () => ({
  codigo: 200,
  status(codigo) { this.codigo = codigo; return this; },
  json(datos) { this.datos = datos; return this; }
});

for (const [nombre, files] of [
  ['sin archivos', undefined],
  ['con campos vacíos', { img_tablet: [], img_radio: [], img_camaras: [] }],
  ['con un campo de evidencia desconocido', { evidencia: [foto()] }],
  ['con un archivo vacío', { img_tablet: [{ buffer: Buffer.alloc(0), mimetype: 'image/jpeg' }] }],
  ['con texto en lugar de un archivo', { img_tablet: ['https://ejemplo.com/foto.jpg'] }],
  ['con un archivo que no es imagen', { img_radio: [{ buffer: Buffer.from('texto'), mimetype: 'text/plain' }] }]
]) {
  test(`rechaza una inspección nueva ${nombre} antes de acceder a servicios externos`, async () => {
    const req = solicitud(files);
    req.body.img_tablet = urlFoto; // Una URL en el cuerpo no sustituye un archivo.
    const res = respuesta();
    await registrarInspeccion(req, res);
    assert.equal(res.codigo, 400);
    assert.match(res.datos.error, /evidencia|imágenes/);
    assert.deepEqual(llamadas, []);
  });
}

for (const [campo, columna] of [
  ['img_tablet', 'imgTablet'], ['img_radio', 'imgRadio'], ['img_camaras', 'imgCamaras']
]) {
  test(`permite una inspección con una sola evidencia en ${campo}`, async () => {
    const res = respuesta();
    await registrarInspeccion(solicitud({ [campo]: [foto()] }), res);
    assert.equal(res.codigo, 201);
    assert.equal(res.datos[columna], urlFoto);
    assert.equal(llamadas[0], 'vehiculo');
    assert.equal(llamadas[1], 'subir');
    assert.equal(llamadas[2][0], 'crear');
    assert.equal(llamadas[3], 'auditar');
  });
}

for (const numeroFallo of [1, 2]) {
  test(`no registra la inspección si falla la carga ${numeroFallo} y limpia las fotos ya subidas`, async () => {
    falloCarga = numeroFallo;
    const res = respuesta();
    const silenciar = mock.method(console, 'error', () => {});
    try {
      await registrarInspeccion(solicitud({ img_tablet: [foto()], img_radio: [foto()] }), res);
    } finally {
      silenciar.mock.restore();
    }
    assert.equal(res.codigo, 500);
    assert.equal(llamadas.some(x => Array.isArray(x) && x[0] === 'crear'), false);
    assert.equal(llamadas.includes('auditar'), false);
    assert.equal(llamadas.filter(x => Array.isArray(x) && x[0] === 'eliminarFoto').length, numeroFallo - 1);
  });
}

test('limpia la evidencia si la base de datos rechaza el registro', async () => {
  falloRegistro = true;
  const res = respuesta();
  const silenciar = mock.method(console, 'error', () => {});
  try {
    await registrarInspeccion(solicitud({ img_radio: [foto()] }), res);
  } finally {
    silenciar.mock.restore();
  }
  assert.equal(res.codigo, 500);
  assert.deepEqual(llamadas.at(-1), ['eliminarFoto', urlFoto]);
  assert.equal(llamadas.includes('auditar'), false);
});

test('permite editar una inspección histórica sin exigir nuevas evidencias', async () => {
  const res = respuesta();
  await editarInspeccion(solicitud(undefined), res);
  assert.equal(res.codigo, 200);
  assert.equal(llamadas[0][0], 'editar');
  assert.equal(llamadas.includes('subir'), false);
});
