// TI-PR-01 · F5.2 · evidencia fotografica de las ordenes de trabajo
// ============================================================================
// DOS BLOQUES, sin tocar ninguna base de datos y sin subir nada a Cloudinary:
//
//   1. LAS REGLAS PURAS. Magic bytes, familias con evidencia, permisos de subida y de
//      retiro, el tope de 4, el motivo del retiro y la validacion del cierre.
//   2. LOS CONTROLLERS REALES con el repositorio y Cloudinary simulados: que el orden de
//      cerrojos es el correcto, que la compensacion destruye el asset cuando el INSERT
//      falla, y que el cierre lee la base y no al cliente.
//
// Cloudinary se MOCKEA siempre. La unica llamada real a la cuenta fue la verificacion
// autorizada de type=authenticated, cuyo asset se destruyo entonces.
//
//   node --experimental-test-module-mocks --test test/evidenciasOt.test.js
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { beforeEach, mock, test } from 'node:test';

import {
  detectarFormatoImagen,
  validarArchivoEvidencia,
  exigeEvidenciaFotografica,
  exigirPuedeSubirEvidencia,
  exigirFamiliaConEvidencia,
  exigirHuecoParaEvidencia,
  exigirPuedeRetirarEvidencia,
  prepararRetiroEvidencia,
  validarEvidenciasParaCierre,
  errorDeEvidenciasIncompletas,
  presentarEvidencia,
  CODIGOS_EVIDENCIA,
  MAXIMO_EVIDENCIAS_ACTIVAS,
  ESTADOS_QUE_EXIGEN_FOTO,
  ESTADOS_QUE_EXIGEN_OBSERVACIONES,
  CAMPOS_EDITABLES_CABECERA,
  CAMPOS_EDITABLES_DETALLE,
  prepararActualizacionCabecera,
  prepararActualizacionDetalle
} from '../src/modules/programas/programacion/ordenes/service.js';

const LIMITE = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------- utilidades
// Imagenes REALES minimas, construidas aqui: para probar los magic bytes hace falta el byte
// exacto, no un buffer inventado.
const pngReal = () => {
  const crc = (() => {
    const t = new Uint32Array(256);

    for (let n = 0; n < 256; n += 1) {
      let c = n;

      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }

      t[n] = c >>> 0;
    }

    return buf => {
      let c = 0xffffffff;

      for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);

      return (c ^ 0xffffffff) >>> 0;
    };
  })();

  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);

    largo.writeUInt32BE(datos.length);

    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const suma = Buffer.alloc(4);

    suma.writeUInt32BE(crc(cuerpo));

    return Buffer.concat([largo, cuerpo, suma]);
  };

  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))),
    trozo('IEND', Buffer.alloc(0))
  ]);
};

// JPEG: SOI + APP0 minimo. Basta para la firma FF D8 FF.
const jpegReal = () => Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from([0x00, 0x10]),
  Buffer.from('JFIF\0', 'ascii'),
  Buffer.alloc(10),
  Buffer.from([0xff, 0xd9])
]);

// WEBP: 'RIFF' + tamano + 'WEBP' + 'VP8 '
const webpReal = () => {
  const b = Buffer.alloc(32);

  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(24, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');

  return b;
};

const pdfFalso = () => Buffer.concat([
  Buffer.from('%PDF-1.7\n', 'ascii'),
  Buffer.alloc(40)
]);

const heicFalso = () => {
  const b = Buffer.alloc(32);

  b.write('ftypheic', 4, 'ascii');

  return b;
};

const archivo = (buffer, mimetype = 'image/jpeg') => ({
  buffer,
  mimetype,
  originalname: 'foto.jpg',
  size: buffer.length
});

const detalle = (extra = {}) => ({
  id: 3001,
  orden_trabajo_id: 7001,
  estado: 'COMPLETADO',
  observaciones: null,
  tipo_equipo: 'CAMARAS',
  nivel_programado: 'M1',
  ...extra
});

const orden = (extra = {}) => ({
  id: 7001,
  programacion_id: 12575,
  estado: 'ABIERTA',
  placa: 'V9V867',
  tecnico_id: null,
  cerrada_por_id: null,
  ...extra
});

const TI = { id: 3, username: 'cperez', rol: 'ti', persona_id: 501 };
const ADMIN = { id: 1, username: 'admin', rol: 'admin', persona_id: null };
const SUPERVISOR = { id: 2, username: 'dobando', rol: 'supervisor', persona_id: null };

const capturar = fn => {
  try {
    fn();

    return null;
  } catch (e) {
    return e;
  }
};

// =====================================================================================
// 1 · LAS REGLAS PURAS
// =====================================================================================

test('magic bytes · reconoce JPEG, PNG y WEBP por su contenido', () => {
  assert.equal(detectarFormatoImagen(jpegReal()), 'jpg');
  assert.equal(detectarFormatoImagen(pngReal()), 'png');
  assert.equal(detectarFormatoImagen(webpReal()), 'webp');

  // 'jpg' y no 'jpeg': es lo que Cloudinary pone en `format`, y lo que admite
  // chk_ote_formato de 018.
  assert.notEqual(detectarFormatoImagen(jpegReal()), 'jpeg');
});

test('magic bytes · rechaza lo que NO es una de esas tres imagenes', () => {
  assert.equal(detectarFormatoImagen(pdfFalso()), null);
  assert.equal(detectarFormatoImagen(heicFalso()), null);
  assert.equal(detectarFormatoImagen(Buffer.alloc(32)), null, 'ceros');
  assert.equal(detectarFormatoImagen(Buffer.from('GIF89a..........')), null);
  assert.equal(detectarFormatoImagen(Buffer.alloc(4)), null, 'demasiado corto');
  assert.equal(detectarFormatoImagen(null), null);
  assert.equal(detectarFormatoImagen('no soy un buffer'), null);
});

test('magic bytes · un RIFF que no es WEBP no cuela', () => {
  // Un WAV empieza por RIFF pero lleva 'WAVE' en el byte 8.
  const wav = Buffer.alloc(32);

  wav.write('RIFF', 0, 'ascii');
  wav.write('WAVE', 8, 'ascii');

  assert.equal(detectarFormatoImagen(wav), null);
});

test('CASO 4 · mimetype image/jpeg con contenido falso: RECHAZO', () => {
  // El ataque real: renombrar un PDF y declarar Content-Type: image/jpeg.
  const e = capturar(
    () => validarArchivoEvidencia(archivo(pdfFalso(), 'image/jpeg'), LIMITE)
  );

  assert.equal(e.status, 400);
  assert.equal(e.code, CODIGOS_EVIDENCIA.ARCHIVO_NO_IMAGEN);
  assert.match(e.message, /contenido real/);
  assert.match(e.message, /image\/jpeg/, 'dice que mimetype declaro');
});

test('CASOS 1, 2 y 3 · JPEG, PNG y WEBP validos pasan con su formato real', () => {
  assert.deepEqual(
    validarArchivoEvidencia(archivo(jpegReal(), 'image/jpeg'), LIMITE).formato,
    'jpg'
  );
  assert.deepEqual(
    validarArchivoEvidencia(archivo(pngReal(), 'image/png'), LIMITE).formato,
    'png'
  );
  assert.deepEqual(
    validarArchivoEvidencia(archivo(webpReal(), 'image/webp'), LIMITE).formato,
    'webp'
  );

  // el tamano medido sale del BUFFER, no de lo que diga el cliente
  const a = archivo(pngReal());

  assert.equal(
    validarArchivoEvidencia(a, LIMITE).bytes,
    a.buffer.length
  );
});

test('CASO 5 · archivo de mas de 10 MB: RECHAZO', () => {
  const grande = Buffer.concat([
    jpegReal(),
    Buffer.alloc(LIMITE + 1)
  ]);

  const e = capturar(
    () => validarArchivoEvidencia(archivo(grande), LIMITE)
  );

  assert.equal(e.status, 400);
  assert.equal(e.code, CODIGOS_EVIDENCIA.ARCHIVO_DEMASIADO_GRANDE);
  assert.match(e.message, /10 MB/);
});

test('CASO 6 · PDF, HEIC y un buffer vacio: RECHAZO', () => {
  for (const [nombre, buffer] of [
    ['pdf', pdfFalso()],
    ['heic', heicFalso()]
  ]) {
    const e = capturar(
      () => validarArchivoEvidencia(archivo(buffer), LIMITE)
    );

    assert.equal(e.code, CODIGOS_EVIDENCIA.ARCHIVO_NO_IMAGEN, nombre);
  }

  for (const vacio of [undefined, null, {}, { buffer: Buffer.alloc(0) }]) {
    const e = capturar(
      () => validarArchivoEvidencia(vacio, LIMITE)
    );

    assert.equal(e.code, CODIGOS_EVIDENCIA.SIN_ARCHIVO);
  }
});

test('CASOS 8 y 9 · GPS y ADAS no admiten evidencia, con ningun resultado', () => {
  assert.equal(exigeEvidenciaFotografica('GPS'), false);
  assert.equal(exigeEvidenciaFotografica('ADAS'), false);
  assert.equal(exigeEvidenciaFotografica('CAMARAS'), true);
  assert.equal(exigeEvidenciaFotografica('COPILOTO'), true);
  assert.equal(exigeEvidenciaFotografica('RADIO_BASE'), true);

  // normalizado: no depende de como llegue escrito
  assert.equal(exigeEvidenciaFotografica(' gps '), false);
  assert.equal(exigeEvidenciaFotografica('adas'), false);

  for (const familia of ['GPS', 'ADAS']) {
    for (const estado of ['COMPLETADO', 'PARCIAL', 'PENDIENTE', 'NO_APLICA']) {
      const e = capturar(
        () => exigirFamiliaConEvidencia(detalle({ tipo_equipo: familia, estado }))
      );

      assert.equal(e.status, 409, `${familia}/${estado}`);
      assert.equal(e.code, CODIGOS_EVIDENCIA.FAMILIA_SIN_EVIDENCIA);
      assert.match(e.message, /anualidad/);
    }
  }
});

test('CASO 7 · TI y ADMIN suben evidencia', () => {
  assert.equal(
    capturar(() => exigirPuedeSubirEvidencia(orden(), TI)),
    null,
    'TI puede'
  );
  assert.equal(capturar(() => exigirPuedeSubirEvidencia(orden(), ADMIN)), null);

  for (const usuario of [SUPERVISOR, {}, null]) {
    const e = capturar(
      () => exigirPuedeSubirEvidencia(orden(), usuario)
    );

    assert.equal(e.status, 403, `rol ${usuario?.rol}`);
    assert.equal(e.code, CODIGOS_EVIDENCIA.SOLO_TI_SUBE);
  }
});

test('CASOS 15 y 16 · ni TI puede subir con la orden CERRADA o ANULADA', () => {
  for (const estado of ['CERRADA', 'ANULADA']) {
    const e = capturar(
      () => exigirPuedeSubirEvidencia(orden({ estado }), TI)
    );

    assert.equal(e.status, 409, estado);
    assert.equal(e.code, CODIGOS_EVIDENCIA.ORDEN_NO_ABIERTA);
    assert.match(e.message, new RegExp(estado));
  }
});

test('CASO 11 · la quinta evidencia se rechaza', () => {
  assert.equal(MAXIMO_EVIDENCIAS_ACTIVAS, 4);

  for (const activas of [0, 1, 2, 3]) {
    assert.equal(
      capturar(() => exigirHuecoParaEvidencia(activas, detalle())),
      null,
      `con ${activas} activas cabe otra`
    );
  }

  for (const activas of [4, 5]) {
    const e = capturar(
      () => exigirHuecoParaEvidencia(activas, detalle())
    );

    assert.equal(e.status, 409);
    assert.equal(e.code, CODIGOS_EVIDENCIA.MAXIMO_ALCANZADO);
    assert.match(e.message, /máximo/);
  }
});

// -------------------------------------------------------------------- permisos de retiro

test('CASOS 17 y 18 · en ABIERTA retiran TI y ADMIN', () => {
  const r = exigirPuedeRetirarEvidencia({
    orden: orden(),
    detalle: detalle(),
    usuario: TI,
    activas: 1
  });

  assert.equal(r.regla, 'ABIERTA_TI');

  // TI puede retirar incluso la unica: la orden esta abierta y el sustento todavia no se
  // ha cerrado.
  for (const usuario of [SUPERVISOR]) {
    const e = capturar(
      () => exigirPuedeRetirarEvidencia({
        orden: orden(),
        detalle: detalle(),
        usuario,
        activas: 3
      })
    );

    assert.equal(e.status, 403, `rol ${usuario.rol}`);
    assert.equal(e.code, CODIGOS_EVIDENCIA.SOLO_TI_RETIRA);
  }
});

test('ADMIN carga solo en ABIERTA y conserva el bloqueo de órdenes cerradas', () => {
  for (const estado of ['CERRADA', 'ANULADA']) {
    const e = capturar(() => exigirPuedeSubirEvidencia(orden({ estado }), ADMIN));
    assert.equal(e.status, 409);
  }
  const r = exigirPuedeRetirarEvidencia({ orden: orden(), detalle: detalle(), usuario: ADMIN, activas: 1 });
  assert.equal(r.regla, 'ABIERTA_ADMIN');
});

test('CASO 19 · en CERRADA retira ADMIN, y con 2 activas queda 1', () => {
  const r = exigirPuedeRetirarEvidencia({
    orden: orden({ estado: 'CERRADA' }),
    detalle: detalle({ estado: 'COMPLETADO' }),
    usuario: ADMIN,
    activas: 2
  });

  assert.equal(r.regla, 'CERRADA_ADMIN');
});

test('CASO 19bis · en CERRADA ni TI ni supervisor pueden retirar', () => {
  for (const usuario of [TI, SUPERVISOR]) {
    const e = capturar(
      () => exigirPuedeRetirarEvidencia({
        orden: orden({ estado: 'CERRADA' }),
        detalle: detalle(),
        usuario,
        activas: 3
      })
    );

    assert.equal(e.status, 403, `rol ${usuario.rol}`);
    assert.equal(e.code, CODIGOS_EVIDENCIA.SOLO_ADMIN_RETIRA);
  }
});

test('CASO 20 · en CERRADA, ADMIN no puede retirar la ULTIMA obligatoria', () => {
  for (const estado of ESTADOS_QUE_EXIGEN_FOTO) {
    const e = capturar(
      () => exigirPuedeRetirarEvidencia({
        orden: orden({ estado: 'CERRADA' }),
        detalle: detalle({ estado }),
        usuario: ADMIN,
        activas: 1
      })
    );

    assert.equal(e.status, 409, estado);
    assert.equal(e.code, CODIGOS_EVIDENCIA.ULTIMA_OBLIGATORIA);
    assert.match(e.message, /última evidencia obligatoria/);
  }

  // NO_APLICA no exige foto, asi que ahi SI puede retirar la ultima.
  const r = exigirPuedeRetirarEvidencia({
    orden: orden({ estado: 'CERRADA' }),
    detalle: detalle({ estado: 'NO_APLICA' }),
    usuario: ADMIN,
    activas: 1
  });

  assert.equal(r.regla, 'CERRADA_ADMIN');

  // y una familia sin evidencia tampoco protege nada
  const r2 = exigirPuedeRetirarEvidencia({
    orden: orden({ estado: 'CERRADA' }),
    detalle: detalle({ tipo_equipo: 'GPS', estado: 'COMPLETADO' }),
    usuario: ADMIN,
    activas: 1
  });

  assert.equal(r2.regla, 'CERRADA_ADMIN');
});

test('CASO 21 · en ANULADA, ADMIN puede retirar incluso la ultima', () => {
  for (const estado of ['COMPLETADO', 'PARCIAL', 'PENDIENTE', 'NO_APLICA']) {
    const r = exigirPuedeRetirarEvidencia({
      orden: orden({ estado: 'ANULADA' }),
      detalle: detalle({ estado }),
      usuario: ADMIN,
      activas: 1
    });

    assert.equal(r.regla, 'ANULADA_ADMIN', estado);
  }

  // pero sigue siendo cosa de ADMIN
  const e = capturar(
    () => exigirPuedeRetirarEvidencia({
      orden: orden({ estado: 'ANULADA' }),
      detalle: detalle(),
      usuario: TI,
      activas: 2
    })
  );

  assert.equal(e.code, CODIGOS_EVIDENCIA.SOLO_ADMIN_RETIRA);
});

test('CASO 22 · el motivo del retiro es obligatorio y no puede ser blanco', () => {
  assert.equal(
    prepararRetiroEvidencia({ motivo: '  Foto desenfocada  ' }).motivo,
    'Foto desenfocada',
    'se recorta'
  );

  for (const malo of [undefined, null, 7, true, {}, ['x']]) {
    const e = capturar(() => prepararRetiroEvidencia({ motivo: malo }));

    assert.equal(e.status, 400, JSON.stringify(malo));
  }

  // blanco en todas sus formas, con la MISMA clase que F5.1 y que chk_ote_retiro de 018
  for (const blanco of ['', '   ', '\t\n', ' ', '﻿', '　  \t']) {
    const e = capturar(() => prepararRetiroEvidencia({ motivo: blanco }));

    assert.equal(e.status, 400, JSON.stringify(blanco));
    assert.match(e.message, /vacío|obligatorio/);
  }

  // y no admite campos de mas
  const e = capturar(
    () => prepararRetiroEvidencia({ motivo: 'ok', estado: 'RETIRADA' })
  );

  assert.equal(e.status, 400);
  assert.match(e.message, /estado/);
});

// -------------------------------------------------------- validacion del cierre

const paraCierre = (filas) => filas.map((f, i) => ({
  id: 3000 + i,
  estado: 'COMPLETADO',
  observaciones: null,
  tipo_equipo: 'CAMARAS',
  evidencias_activas: 0,
  ...f
}));

test('CASOS 26 y 27 · COMPLETADO y PARCIAL regulares sin foto bloquean el cierre', () => {
  for (const estado of ['COMPLETADO', 'PARCIAL']) {
    for (const familia of ['CAMARAS', 'COPILOTO', 'RADIO_BASE']) {
      const inc = validarEvidenciasParaCierre(
        paraCierre([{ estado, tipo_equipo: familia, evidencias_activas: 0 }])
      );

      assert.equal(inc.length, 1, `${familia}/${estado}`);
      assert.equal(inc[0].falta, 'EVIDENCIA');
      assert.equal(inc[0].tipo_equipo, familia);
      assert.match(inc[0].motivo, /no tiene ninguna evidencia/);
    }

    // con una foto, ya no falta nada
    assert.deepEqual(
      validarEvidenciasParaCierre(
        paraCierre([{ estado, evidencias_activas: 1 }])
      ),
      []
    );
  }
});

test('CASOS 28, 29 y 30 · PENDIENTE regular exige foto Y observaciones', () => {
  // sin foto y sin observacion: DOS incumplimientos, no uno
  const ambos = validarEvidenciasParaCierre(
    paraCierre([{ estado: 'PENDIENTE', evidencias_activas: 0, observaciones: null }])
  );

  assert.equal(ambos.length, 2);
  assert.deepEqual(
    ambos.map(i => i.falta).sort(),
    ['EVIDENCIA', 'OBSERVACIONES']
  );

  // 28 · solo falta la foto
  const sinFoto = validarEvidenciasParaCierre(
    paraCierre([{
      estado: 'PENDIENTE',
      evidencias_activas: 0,
      observaciones: 'No habia repuesto'
    }])
  );

  assert.equal(sinFoto.length, 1);
  assert.equal(sinFoto[0].falta, 'EVIDENCIA');

  // 29 · solo falta la observacion
  const sinObs = validarEvidenciasParaCierre(
    paraCierre([{ estado: 'PENDIENTE', evidencias_activas: 2, observaciones: '   ' }])
  );

  assert.equal(sinObs.length, 1);
  assert.equal(sinObs[0].falta, 'OBSERVACIONES');
  assert.match(sinObs[0].motivo, /no se ejecutó/);

  // 30 · con los dos, valido
  assert.deepEqual(
    validarEvidenciasParaCierre(
      paraCierre([{
        estado: 'PENDIENTE',
        evidencias_activas: 1,
        observaciones: 'Sin repuesto en almacen'
      }])
    ),
    []
  );
});

test('CASOS 31 y 32 · NO_APLICA regular no exige foto pero si observaciones', () => {
  // 31 · sin foto y con observacion: valido
  assert.deepEqual(
    validarEvidenciasParaCierre(
      paraCierre([{
        estado: 'NO_APLICA',
        evidencias_activas: 0,
        observaciones: 'La unidad no tiene esa camara instalada'
      }])
    ),
    []
  );

  // 32 · sin observacion: rechazo, y solo por eso
  const inc = validarEvidenciasParaCierre(
    paraCierre([{ estado: 'NO_APLICA', evidencias_activas: 0, observaciones: null }])
  );

  assert.equal(inc.length, 1);
  assert.equal(inc[0].falta, 'OBSERVACIONES');
  assert.match(inc[0].motivo, /no correspondía/);
});

test('CASOS 33, 34 y 35 · GPS y ADAS nunca exigen foto', () => {
  for (const familia of ['GPS', 'ADAS']) {
    // 33 · COMPLETADO y PARCIAL sin foto: valido
    for (const estado of ['COMPLETADO', 'PARCIAL']) {
      assert.deepEqual(
        validarEvidenciasParaCierre(
          paraCierre([{ tipo_equipo: familia, estado, evidencias_activas: 0 }])
        ),
        [],
        `${familia}/${estado}`
      );
    }

    // 34 y 35 · PENDIENTE y NO_APLICA exigen observacion, NO foto
    for (const estado of ['PENDIENTE', 'NO_APLICA']) {
      const inc = validarEvidenciasParaCierre(
        paraCierre([{
          tipo_equipo: familia,
          estado,
          evidencias_activas: 0,
          observaciones: null
        }])
      );

      assert.equal(inc.length, 1, `${familia}/${estado}`);
      assert.equal(inc[0].falta, 'OBSERVACIONES', 'nunca EVIDENCIA');

      // con la observacion, valido aunque no haya ninguna foto
      assert.deepEqual(
        validarEvidenciasParaCierre(
          paraCierre([{
            tipo_equipo: familia,
            estado,
            evidencias_activas: 0,
            observaciones: 'El equipo no estaba instalado'
          }])
        ),
        []
      );
    }
  }
});

test('el cierre informa TODOS los incumplimientos juntos, no el primero', () => {
  const inc = validarEvidenciasParaCierre(paraCierre([
    { tipo_equipo: 'CAMARAS', estado: 'COMPLETADO', evidencias_activas: 0 },
    { tipo_equipo: 'COPILOTO', estado: 'COMPLETADO', evidencias_activas: 2 },
    { tipo_equipo: 'RADIO_BASE', estado: 'PENDIENTE', evidencias_activas: 0 },
    { tipo_equipo: 'GPS', estado: 'NO_APLICA', evidencias_activas: 0 }
  ]));

  // CAMARAS falta foto · RADIO_BASE falta foto y observacion · GPS falta observacion
  assert.equal(inc.length, 4);
  assert.deepEqual(
    inc.map(i => `${i.tipo_equipo}:${i.falta}`),
    [
      'CAMARAS:EVIDENCIA',
      'RADIO_BASE:EVIDENCIA',
      'RADIO_BASE:OBSERVACIONES',
      'GPS:OBSERVACIONES'
    ]
  );

  // COPILOTO, que estaba bien, no aparece
  assert.ok(!inc.some(i => i.tipo_equipo === 'COPILOTO'));

  const error = errorDeEvidenciasIncompletas(inc);

  assert.equal(error.status, 409);
  assert.equal(error.code, CODIGOS_EVIDENCIA.EVIDENCIAS_INCOMPLETAS);
  assert.equal(error.incumplimientos.length, 4);
  assert.match(error.message, /4 apartado\(s\)/);
});

test('las observaciones solo se exigen en PENDIENTE y NO_APLICA', () => {
  assert.deepEqual(ESTADOS_QUE_EXIGEN_OBSERVACIONES, ['PENDIENTE', 'NO_APLICA']);
  assert.deepEqual(ESTADOS_QUE_EXIGEN_FOTO, ['COMPLETADO', 'PARCIAL', 'PENDIENTE']);

  // COMPLETADO con foto y sin observaciones es valido: no hay nada que explicar
  assert.deepEqual(
    validarEvidenciasParaCierre(
      paraCierre([{ estado: 'COMPLETADO', evidencias_activas: 1, observaciones: null }])
    ),
    []
  );
});

// -------------------------------------------------------- el jsonb legacy, fuera

test('JSONB LEGACY · evidencias ya no es un campo editable de la OT ni del detalle', () => {
  assert.ok(!CAMPOS_EDITABLES_CABECERA.includes('evidencias'));
  assert.ok(!CAMPOS_EDITABLES_DETALLE.includes('evidencias'));
  assert.deepEqual(CAMPOS_EDITABLES_CABECERA, ['minutos', 'observaciones']);
  assert.deepEqual(
    CAMPOS_EDITABLES_DETALLE,
    ['estado', 'nivel_completado', 'observaciones']
  );

  for (const preparar of [
    prepararActualizacionCabecera,
    prepararActualizacionDetalle
  ]) {
    const e = capturar(() => preparar({ evidencias: [] }));

    assert.equal(e.status, 400);
    assert.match(e.message, /evidencias/);
  }

  // y el normalizador del jsonb ya no existe como camino
  const cab = prepararActualizacionCabecera({ minutos: 30 });

  assert.ok(!Object.prototype.hasOwnProperty.call(cab.data, 'evidencias'));
});

test('el presenter NO publica el public_id de Cloudinary', () => {
  const p = presentarEvidencia(
    {
      id: 55,
      detalle_id: 3001,
      tipo_equipo: 'CAMARAS',
      cloudinary_public_id: 'ti-pr-01/evidencias-ot/secreto',
      formato: 'jpg',
      bytes: 2048,
      ancho: 800,
      alto: 600,
      created_at: '2026-10-10T12:00:00.000Z',
      subida_por_id: 3,
      subida_por_username: 'cperez',
      subida_por_nombre: 'CARLOS PEREZ'
    },
    '/api/x/evidencias'
  );

  assert.equal(p.cloudinary_public_id, undefined, 'el public_id NO sale');
  assert.ok(!JSON.stringify(p).includes('secreto'));
  assert.equal(p.imagen, '/api/x/evidencias/55/imagen', 'ruta INTERNA del ERP');
  assert.ok(!JSON.stringify(p).includes('cloudinary'));
  assert.deepEqual(p.subida_por, {
    id: 3,
    username: 'cperez',
    nombre: 'CARLOS PEREZ'
  });
});

// =====================================================================================
// 2 · LOS CONTROLLERS REALES · repositorio y Cloudinary simulados
// =====================================================================================
// Lo que este bloque comprueba y el anterior no puede:
//   · el ORDEN de los cerrojos: cabecera y DESPUES detalle, el mismo que el cierre
//   · que nada se sube a Cloudinary si la regla ya rechazo
//   · la COMPENSACION: Cloudinary sube, el INSERT falla, el asset se destruye
//   · que el cierre lee la BASE y no al cliente
//
// Cloudinary esta MOCKEADO: ni un byte sale de aqui.

let llamadas;
let ordenEnBase;
let detalleEnBase;
let activasEnBase;
let evidenciaEnBase;
let detallesParaCierre;
let fallaElInsert;
let fallaCloudinary;
let activasPrevias;
let fallaElCommit;
let fallaElDestroy;
let alSubir;

mock.module('../src/modules/programas/programacion/ordenes/repository.js', {
  namedExports: {
    obtenerOrdenParaEscritura: async (programaId, programacionId, otId) => {
      llamadas.push(['LOCK_OT', otId]);

      return ordenEnBase;
    },
    // La lectura de PREVALIDACION. Se distingue de la que bloquea por el nombre, y de la
    // relectura posterior por el cliente: aqui nunca llega uno.
    obtenerDetalleParaEvidencia: async (otId, detalleId) => {
      llamadas.push(['PREVAL_DETALLE', otId, detalleId]);

      return detalleEnBase;
    },
    bloquearDetalleParaEvidencia: async (otId, detalleId) => {
      llamadas.push(['LOCK_DETALLE', otId, detalleId]);

      return detalleEnBase;
    },
    contarEvidenciasActivas: async (detalleId, cliente) => {
      // El mismo recuento se hace dos veces: sin transaccion para no gastar una subida, y
      // bajo cerrojo para decidir. Se distinguen por el cliente, que solo existe en la
      // segunda, y asi las pruebas pueden exigir que la que manda sea la de dentro.
      llamadas.push([cliente ? 'CONTAR' : 'PRECONTAR', detalleId]);

      return cliente ? activasEnBase : activasPrevias ?? activasEnBase;
    },
    insertarEvidencia: async datos => {
      llamadas.push(['INSERT', datos.publicId, datos.formato, datos.bytes]);

      if (fallaElInsert) {
        const e = new Error('fallo simulado del INSERT');

        e.code = '23505';

        throw e;
      }

      return 9001;
    },
    obtenerEvidenciaParaRetiro: async (otId, evidenciaId) => {
      llamadas.push(['LOCK_EVIDENCIA', otId, evidenciaId]);

      return evidenciaEnBase;
    },
    retirarEvidencia: async (evidenciaId, motivo, usuarioId) => {
      llamadas.push(['RETIRAR', evidenciaId, motivo, usuarioId]);

      return true;
    },
    obtenerEvidenciasActivasDeOrden: async () => [],
    obtenerEvidenciaDeOrden: async () => evidenciaEnBase,
    obtenerDetallesParaValidarCierre: async otId => {
      llamadas.push(['DETALLES_CIERRE', otId]);

      return detallesParaCierre;
    },
    // Sin cliente es la prevalidacion; con cliente, la relectura que hace editandoLaOrden
    // dentro de la transaccion para construir la respuesta.
    obtenerOrdenPorId: async (programaId, programacionId, otId, cliente) => {
      if (!cliente) {
        llamadas.push(['PREVAL_OT', otId]);
      }

      return ordenEnBase;
    },
    obtenerDetallesDeOrdenes: async ids => new Map(ids.map(i => [i, []])),
    existeVisitaEnPrograma: async () => true,
    obtenerResultadoDeVisita: async () => ({
      id: 12575,
      estado: 'PROGRAMADO',
      fecha_ejecucion: null
    }),
    asignarTecnicoAlCerrar: async () => {
      llamadas.push(['ASIGNAR_TECNICO']);

      return true;
    },
    cerrarOrden: async () => {
      llamadas.push(['CERRAR_OT']);

      return { estado_programacion: 'EJECUTADO', ciclos_afectados: 1 };
    },
    // el resto del modulo, no usado por estas rutas
    obtenerProgramacionParaApertura: async () => null,
    contarEquiposPrevistos: async () => 1,
    contarOrdenesActivas: async () => 0,
    insertarOrden: async () => 1,
    materializarDetalles: async () => 1,
    obtenerOrdenes: async () => [],
    obtenerDetalleDeOrden: async () => null,
    actualizarOrden: async () => 1,
    actualizarDetalle: async () => 1,
    anularOrden: async () => 1
  }
});

mock.module('../src/services/cloudinaryService.js', {
  namedExports: {
    subirEvidenciaAutenticada: async () => {
      llamadas.push(['CLOUDINARY_SUBIR']);

      // El hueco donde cabe la concurrencia REAL del nuevo flujo: mientras esta subida
      // esta en vuelo no hay ninguna transaccion abierta, asi que otra peticion puede
      // cerrar la orden o llenar el apartado. `alSubir` simula justo eso.
      if (alSubir) {
        await alSubir();
      }

      if (fallaCloudinary) {
        throw new Error('fallo simulado de Cloudinary');
      }

      return {
        public_id: 'ti-pr-01/evidencias-ot/abc123',
        formato: 'jpg',
        bytes: 2048,
        ancho: 800,
        alto: 600,
        tipo: 'authenticated',
        recurso: 'image'
      };
    },
    destruirEvidenciaAutenticada: async publicId => {
      llamadas.push(['CLOUDINARY_DESTRUIR', publicId]);

      // destruirEvidenciaAutenticada NUNCA lanza por contrato: devuelve false. Asi se
      // simula el peor caso, el huerfano.
      return !fallaElDestroy;
    },
    urlFirmadaEvidencia: () => 'https://res.cloudinary.com/x/firmada',
    uploadToCloudinary: async () => 'https://x',
    deleteFromCloudinary: async () => true
  }
});

mock.module('../src/modules/programas/repository.js', {
  namedExports: {
    existePrograma: async id => id === 90,
    esTecnicoTiElegible: async () => true
  }
});

mock.module('../src/config/database.js', {
  namedExports: {
    pool: {
      connect: async () => ({
        query: async texto => {
          const verbo = String(texto).trim().split(/\s+/)[0];

          llamadas.push(['sql', verbo]);

          if (verbo === 'COMMIT' && fallaElCommit) {
            throw new Error('fallo simulado del COMMIT');
          }

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
      llamadas.push(['auditar', accion]);
    }
  }
});

mock.module('../src/modules/programas/programacion/ordenes/checklist.js', { namedExports: { validarChecklistAlCerrar: async () => {} } });

const {
  subirEvidencia,
  retirarEvidenciaDeOrden,
  cerrarOrdenTrabajo
} = await import(
  '../src/modules/programas/programacion/ordenes/controller.js'
);

beforeEach(() => {
  llamadas = [];
  ordenEnBase = orden();
  detalleEnBase = detalle();
  activasEnBase = 0;
  evidenciaEnBase = null;
  detallesParaCierre = [];
  fallaElInsert = false;
  fallaCloudinary = false;
  activasPrevias = undefined;
  fallaElCommit = false;
  fallaElDestroy = false;
  alSubir = null;
});

const peticion = (usuario, extra = {}) => ({
  params: {
    programaId: '90',
    programacionId: '12575',
    otId: '7001',
    detalleId: '3001',
    ...(extra.params ?? {})
  },
  body: extra.body ?? {},
  file: extra.file,
  query: extra.query ?? {},
  user: usuario,
  method: 'POST',
  originalUrl: '/api/x',
  headers: {},
  ip: '127.0.0.1'
});

const respuesta = () => ({
  codigo: 200,
  status(c) { this.codigo = c; return this; },
  json(d) { this.datos = d; return this; },
  setHeader() { return this; },
  end(b) { this.cuerpo = b; return this; }
});

const solo = tipo => llamadas.filter(l => l[0] === tipo);
const tx = () => llamadas.filter(l => l[0] === 'sql').map(l => l[1]);
const secuencia = () => llamadas
  .filter(l => l[0] !== 'sql' && l[0] !== 'auditar')
  .map(l => l[0]);

// LA CRONOLOGIA COMPLETA, con BEGIN y COMMIT en su sitio. Es la unica forma de demostrar
// que la subida ocurre FUERA de la transaccion: secuencia() oculta el SQL y tx() oculta
// todo lo demas, asi que ninguna de las dos puede ver la frontera.
const cronologia = () => llamadas
  .filter(l => l[0] !== 'auditar')
  .map(l => (l[0] === 'sql' ? l[1] : l[0]));

// Cierto si la subida a Cloudinary ocurrio sin ninguna transaccion abierta: no hay BEGIN
// anterior sin su COMMIT o ROLLBACK ya emitido.
const subioSinTransaccion = () => {
  let abierta = 0;

  for (const evento of cronologia()) {
    if (evento === 'BEGIN') abierta += 1;
    if (evento === 'COMMIT' || evento === 'ROLLBACK') abierta -= 1;

    if (evento === 'CLOUDINARY_SUBIR' && abierta !== 0) {
      return false;
    }
  }

  return true;
};

// -------------------------------------------------------------------------------------

test('UPLOAD · el orden de cerrojos es cabecera y DESPUES detalle, como el cierre', async () => {
  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal(), 'image/jpeg') }),
    res
  );

  assert.equal(res.codigo, 201);

  // el orden es la regla: sin el de la cabecera primero, una carga y un cierre
  // concurrentes se bloquearian mutuamente
  assert.deepEqual(cronologia(), [
    // FASE 1 · prevalidacion, sin transaccion
    'PREVAL_OT',
    'PREVAL_DETALLE',
    'PRECONTAR',
    // FASE 2 · la subida, todavia sin transaccion
    'CLOUDINARY_SUBIR',
    // FASE 3 · la transaccion corta
    'BEGIN',
    'LOCK_OT',
    'LOCK_DETALLE',
    'CONTAR',
    'INSERT',
    'COMMIT'
  ]);

  assert.deepEqual(tx(), ['BEGIN', 'COMMIT']);
  assert.equal(res.datos.evidencia.id, 9001);
  assert.equal(res.datos.evidencia.tipo_equipo, 'CAMARAS');
  assert.match(res.datos.evidencia.imagen, /\/evidencias\/9001\/imagen$/);
  assert.equal(res.datos.evidencias_activas_del_apartado, 1);
  assert.equal(solo('auditar').length, 1);
  assert.match(solo('auditar')[0][1], /Cargo evidencia fotografica 9001/);
});

test('UPLOAD · ADMIN puede cargar una fotografía en una orden ABIERTA', async () => {
  const res = respuesta();
  await subirEvidencia(peticion(ADMIN, { file: archivo(jpegReal()) }), res);
  assert.equal(res.codigo, 201);
  assert.equal(solo('CLOUDINARY_SUBIR').length, 1);
  assert.deepEqual(tx(), ['BEGIN', 'COMMIT']);
});

test('UPLOAD · un usuario sin autorización no llega ni a mirar el detalle ni a Cloudinary', async () => {
  for (const usuario of [SUPERVISOR]) {
    llamadas = [];

    const res = respuesta();

    await subirEvidencia(
      peticion(usuario, { file: archivo(jpegReal()) }),
      res
    );

    assert.equal(res.codigo, 403, `rol ${usuario.rol}`);
    assert.equal(res.datos.code, CODIGOS_EVIDENCIA.SOLO_TI_SUBE);
    assert.deepEqual(solo('CLOUDINARY_SUBIR'), [], 'no se subio nada');
    assert.deepEqual(solo('LOCK_DETALLE'), [], 'ni se bloqueo el detalle');
    assert.deepEqual(solo('PREVAL_DETALLE'), [], 'ni se leyo el detalle');

    // y ahora ni se abre transaccion: el rechazo ocurre en la prevalidacion
    assert.deepEqual(tx(), []);
  }
});

test('UPLOAD · GPS y ADAS se rechazan ANTES de subir a Cloudinary', async () => {
  for (const familia of ['GPS', 'ADAS']) {
    llamadas = [];
    detalleEnBase = detalle({ tipo_equipo: familia });

    const res = respuesta();

    await subirEvidencia(
      peticion(TI, { file: archivo(jpegReal()) }),
      res
    );

    assert.equal(res.codigo, 409, familia);
    assert.equal(res.datos.code, CODIGOS_EVIDENCIA.FAMILIA_SIN_EVIDENCIA);
    assert.deepEqual(solo('CLOUDINARY_SUBIR'), [], 'no se gasto una subida');
    assert.deepEqual(tx(), [], 'ni se abrio transaccion');
  }
});

test('UPLOAD · un detalle de otra OT da 404 y no revela que existe', async () => {
  detalleEnBase = null;

  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.equal(res.codigo, 404);
  assert.match(res.datos.error, /Apartado no encontrado/);
  assert.deepEqual(solo('CLOUDINARY_SUBIR'), []);
  assert.deepEqual(tx(), [], 'ni se abrio transaccion');
});

test('UPLOAD · la quinta se rechaza sin subir nada', async () => {
  activasEnBase = 4;

  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_EVIDENCIA.MAXIMO_ALCANZADO);
  assert.deepEqual(solo('CLOUDINARY_SUBIR'), []);
  assert.deepEqual(solo('INSERT'), []);
});

test('UPLOAD · el conteo va DESPUES del cerrojo del detalle, no antes', async () => {
  // Es lo que impide que dos cargas simultaneas del mismo apartado lean 3 y entren las dos.
  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(pngReal(), 'image/png') }),
    res
  );

  const orden2 = secuencia();

  assert.ok(
    orden2.indexOf('LOCK_DETALLE') < orden2.indexOf('CONTAR'),
    'el cerrojo del detalle tiene que preceder al recuento'
  );
  assert.ok(
    orden2.indexOf('CONTAR') < orden2.indexOf('INSERT'),
    'y el recuento al INSERT'
  );

  // el PRECONTAR de la prevalidacion no cuenta: no decide nada y ocurre sin cerrojo
  assert.ok(
    orden2.indexOf('PRECONTAR') < orden2.indexOf('LOCK_OT'),
    'el recuento orientativo es anterior a la transaccion'
  );
});

test('UPLOAD · un archivo que no es imagen se rechaza sin tocar Cloudinary', async () => {
  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(pdfFalso(), 'image/jpeg') }),
    res
  );

  assert.equal(res.codigo, 400);
  assert.equal(res.datos.code, CODIGOS_EVIDENCIA.ARCHIVO_NO_IMAGEN);
  assert.deepEqual(solo('CLOUDINARY_SUBIR'), []);
});

test('CASO 13 · si Cloudinary falla, la base no recibe ninguna fila', async () => {
  fallaCloudinary = true;

  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.notEqual(res.codigo, 201);
  assert.deepEqual(solo('INSERT'), [], 'sin INSERT');
  assert.deepEqual(solo('CLOUDINARY_DESTRUIR'), [],
    'no hay nada que destruir: la subida no llego a existir');

  // y ahora la transaccion NO llega a abrirse: la subida es anterior
  assert.deepEqual(tx(), []);
});

test('CASO 14 · Cloudinary OK y la base falla: se DESTRUYE el asset', async () => {
  fallaElInsert = true;

  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.notEqual(res.codigo, 201, 'no se finge un exito');

  // la compensacion: el asset subido se destruye para no dejar un huerfano
  assert.deepEqual(
    solo('CLOUDINARY_DESTRUIR'),
    [['CLOUDINARY_DESTRUIR', 'ti-pr-01/evidencias-ot/abc123']]
  );

  // y el orden importa: sube, abre la transaccion, intenta insertar, revierte y destruye
  assert.deepEqual(cronologia(), [
    'PREVAL_OT',
    'PREVAL_DETALLE',
    'PRECONTAR',
    'CLOUDINARY_SUBIR',
    'BEGIN',
    'LOCK_OT',
    'LOCK_DETALLE',
    'CONTAR',
    'INSERT',
    'ROLLBACK',
    'CLOUDINARY_DESTRUIR'
  ]);

  // la compensacion va DESPUES del ROLLBACK: primero se deshace lo que la base puede
  // deshacer, y solo despues lo que no
  const c = cronologia();

  assert.ok(
    c.indexOf('ROLLBACK') < c.indexOf('CLOUDINARY_DESTRUIR'),
    'el ROLLBACK precede a la destruccion del asset'
  );

  assert.deepEqual(tx(), ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(solo('auditar'), [], 'nada que auditar');
});

// =====================================================================================
// 2b · LA FRONTERA DE LA TRANSACCION · lo que cambio en este ajuste
// =====================================================================================
// Antes la subida ocurria DENTRO de la transaccion y el cerrojo de la cabecera se
// mantenia mientras Cloudinary respondia. Ahora no, y estas pruebas lo fijan.

test('FLUJO · NINGUNA transaccion esta abierta mientras Cloudinary sube', async () => {
  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.equal(res.codigo, 201);
  assert.ok(subioSinTransaccion(), 'la subida ocurrio con una transaccion abierta');

  const c = cronologia();

  assert.ok(
    c.indexOf('CLOUDINARY_SUBIR') < c.indexOf('BEGIN'),
    'la subida tiene que preceder al BEGIN'
  );

  // y no hay ningun BEGIN antes de la subida, ni siquiera uno ya cerrado
  assert.equal(
    c.slice(0, c.indexOf('CLOUDINARY_SUBIR')).filter(e => e === 'BEGIN').length,
    0,
    'la prevalidacion no abre transaccion'
  );
});

test('FLUJO · la prevalidacion no toma ningun cerrojo', async () => {
  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  const c = cronologia();
  const antesDeSubir = c.slice(0, c.indexOf('CLOUDINARY_SUBIR'));

  assert.deepEqual(
    antesDeSubir.filter(e => e.startsWith('LOCK')),
    [],
    'la fase 1 lee sin bloquear'
  );
  assert.deepEqual(antesDeSubir, ['PREVAL_OT', 'PREVAL_DETALLE', 'PRECONTAR']);
});

test('CONCURRENCIA · si la OT se cierra durante la subida, el asset se destruye',
  async () => {
    // La prevalidacion ve la orden ABIERTA. Mientras Cloudinary sube -sin transaccion y
    // sin cerrojos- otra peticion la cierra. Al tomar el cerrojo, la fase 3 ve CERRADA.
    alSubir = async () => {
      ordenEnBase = orden({ estado: 'CERRADA' });
    };

    const res = respuesta();

    await subirEvidencia(
      peticion(TI, { file: archivo(jpegReal()) }),
      res
    );

    assert.equal(res.codigo, 409);
    assert.equal(res.datos.code, CODIGOS_EVIDENCIA.ORDEN_NO_ABIERTA);

    // el asset existia, asi que hay que destruirlo
    assert.deepEqual(
      solo('CLOUDINARY_DESTRUIR'),
      [['CLOUDINARY_DESTRUIR', 'ti-pr-01/evidencias-ot/abc123']]
    );

    assert.deepEqual(solo('INSERT'), [], 'no se escribio ninguna fila');
    assert.deepEqual(tx(), ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(solo('auditar'), []);
  });

test('CONCURRENCIA · si el apartado se llena durante la subida, el asset se destruye',
  async () => {
    // El caso que pediste: dos peticiones ven 3 fotos y las dos suben. Esta es la segunda:
    // su prevalidacion vio 3, y cuando toma el cerrojo ya hay 4.
    activasPrevias = 3;
    alSubir = async () => {
      activasEnBase = 4;
    };

    const res = respuesta();

    await subirEvidencia(
      peticion(TI, { file: archivo(jpegReal()) }),
      res
    );

    assert.equal(res.codigo, 409);
    assert.equal(res.datos.code, CODIGOS_EVIDENCIA.MAXIMO_ALCANZADO);
    assert.match(res.datos.error, /4/);

    assert.deepEqual(
      solo('CLOUDINARY_DESTRUIR'),
      [['CLOUDINARY_DESTRUIR', 'ti-pr-01/evidencias-ot/abc123']]
    );

    assert.deepEqual(solo('INSERT'), [], 'NUNCA se inserta la quinta');

    // el recuento que decidio es el de DENTRO del cerrojo, no el de la prevalidacion
    assert.deepEqual(solo('PRECONTAR'), [['PRECONTAR', 3001]]);
    assert.deepEqual(solo('CONTAR'), [['CONTAR', 3001]]);
  });

test('CONCURRENCIA · de dos cargas que ven 3, solo UNA inserta la cuarta', async () => {
  // Las dos peticiones completas, una detras de otra, compartiendo el estado de la "base".
  // La primera entra y deja el apartado en 4; la segunda ya subio su asset y lo compensa.
  activasEnBase = 3;
  activasPrevias = 3;

  const primera = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    primera
  );

  // la primera inserta: el apartado pasa a 4
  assert.equal(primera.codigo, 201);
  assert.equal(primera.datos.evidencias_activas_del_apartado, 4);
  assert.equal(solo('INSERT').length, 1);
  assert.deepEqual(solo('CLOUDINARY_DESTRUIR'), [], 'la que entra no destruye nada');

  activasEnBase = 4;
  llamadas = [];

  const segunda = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    segunda
  );

  // la segunda se rechaza y compensa su asset
  assert.equal(segunda.codigo, 409);
  assert.equal(segunda.datos.code, CODIGOS_EVIDENCIA.MAXIMO_ALCANZADO);
  assert.deepEqual(solo('INSERT'), []);
  assert.equal(solo('CLOUDINARY_DESTRUIR').length, 1);
});

test('COMPENSACION · si el COMMIT falla, el asset tambien se destruye', async () => {
  // El agujero que el flujo anterior no tenia: con la subida dentro de la transaccion, un
  // COMMIT fallido dejaba el asset sin fila y sin compensar, porque el try solo envolvia
  // al INSERT. Ahora la compensacion envuelve la fase 3 COMPLETA.
  fallaElCommit = true;

  const res = respuesta();

  await subirEvidencia(
    peticion(TI, { file: archivo(jpegReal()) }),
    res
  );

  assert.notEqual(res.codigo, 201, 'no se finge un exito');

  assert.deepEqual(
    solo('CLOUDINARY_DESTRUIR'),
    [['CLOUDINARY_DESTRUIR', 'ti-pr-01/evidencias-ot/abc123']],
    'un COMMIT fallido tiene que compensar igual'
  );

  assert.equal(solo('INSERT').length, 1, 'el INSERT si se intento');
});

test('COMPENSACION · si el destroy falla, se registra el huerfano y manda el error original',
  async () => {
    fallaElInsert = true;
    fallaElDestroy = true;

    const original = console.error;
    const registrado = [];

    console.error = (...a) => registrado.push(a.join(' '));

    const res = respuesta();

    try {
      await subirEvidencia(
        peticion(TI, { file: archivo(jpegReal()) }),
        res
      );
    } finally {
      console.error = original;
    }

    // el huerfano queda registrado con su public_id
    assert.equal(registrado.length, 1);
    assert.match(registrado[0], /\[TI_PR_01_EVIDENCIA_HUERFANA\]/);
    assert.match(registrado[0], /ti-pr-01\/evidencias-ot\/abc123/);
    assert.match(registrado[0], /ot=7001/);
    assert.match(registrado[0], /detalle=3001/);

    // y el error que llega al cliente es el ORIGINAL -el 23505 del INSERT-, no el del
    // destroy fallido
    assert.notEqual(res.codigo, 201);
    assert.equal(res.codigo, 409);
  });

// -------------------------------------------------------------------------------- retiro

const evidencia = (extra = {}) => ({
  id: 9001,
  orden_trabajo_id: 7001,
  detalle_id: 3001,
  cloudinary_public_id: 'ti-pr-01/evidencias-ot/abc123',
  formato: 'jpg',
  bytes: 2048,
  ancho: 800,
  alto: 600,
  estado: 'ACTIVA',
  subida_por_id: 3,
  tipo_equipo: 'CAMARAS',
  detalle_estado: 'COMPLETADO',
  created_at: '2026-10-10T12:00:00.000Z',
  ...extra
});

const peticionRetiro = (usuario, motivo = 'Foto desenfocada') => peticion(
  usuario,
  {
    params: { evidenciaId: '9001' },
    body: motivo === null ? {} : { motivo }
  }
);

test('RETIRO · TI retira en ABIERTA, y el asset NO se destruye', async () => {
  evidenciaEnBase = evidencia();
  activasEnBase = 2;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(TI), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(
    solo('RETIRAR'),
    [['RETIRAR', 9001, 'Foto desenfocada', 3]]
  );

  // LA TRAZABILIDAD MANDA: la imagen sigue en Cloudinary
  assert.deepEqual(solo('CLOUDINARY_DESTRUIR'), []);

  assert.equal(res.datos.evidencia_retirada.regla_aplicada, 'ABIERTA_TI');
  assert.equal(res.datos.evidencias_activas_del_apartado, 1);
  assert.deepEqual(tx(), ['BEGIN', 'COMMIT']);
  assert.match(solo('auditar')[0][1], /Retiro la evidencia 9001/);
  assert.match(solo('auditar')[0][1], /Motivo: Foto desenfocada/);
});

test('RETIRO · ADMIN retira en ABIERTA conservando el registro y la fotografía', async () => {
  evidenciaEnBase = evidencia();
  activasEnBase = 2;
  const res = respuesta();
  await retirarEvidenciaDeOrden(peticionRetiro(ADMIN), res);
  assert.equal(res.codigo, 200);
  assert.equal(res.datos.evidencia_retirada.regla_aplicada, 'ABIERTA_ADMIN');
  assert.deepEqual(solo('CLOUDINARY_DESTRUIR'), []);
  assert.deepEqual(tx(), ['BEGIN', 'COMMIT']);
});

test('RETIRO · el orden de cerrojos tambien aqui: OT, evidencia y detalle', async () => {
  evidenciaEnBase = evidencia();
  activasEnBase = 3;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(TI), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(secuencia(), [
    'LOCK_OT',
    'LOCK_EVIDENCIA',
    'LOCK_DETALLE',
    'CONTAR',
    'RETIRAR'
  ]);
});

test('RETIRO · un usuario sin autorización no puede retirar en ABIERTA', async () => {
  evidenciaEnBase = evidencia();
  activasEnBase = 3;

  for (const usuario of [SUPERVISOR]) {
    llamadas = [];

    const res = respuesta();

    await retirarEvidenciaDeOrden(peticionRetiro(usuario), res);

    assert.equal(res.codigo, 403, `rol ${usuario.rol}`);
    assert.equal(res.datos.code, CODIGOS_EVIDENCIA.SOLO_TI_RETIRA);
    assert.deepEqual(solo('RETIRAR'), []);
    assert.deepEqual(tx(), ['BEGIN', 'ROLLBACK']);
  }
});

test('CASO 19 · ADMIN retira en CERRADA con 2 activas', async () => {
  ordenEnBase = orden({ estado: 'CERRADA' });
  evidenciaEnBase = evidencia();
  activasEnBase = 2;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(ADMIN, 'Foto equivocada'), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.evidencia_retirada.regla_aplicada, 'CERRADA_ADMIN');
  assert.equal(res.datos.evidencias_activas_del_apartado, 1);
  assert.deepEqual(solo('RETIRAR'), [['RETIRAR', 9001, 'Foto equivocada', 1]]);
});

test('CASO 20 · ADMIN no puede retirar la ultima obligatoria en CERRADA', async () => {
  ordenEnBase = orden({ estado: 'CERRADA' });
  evidenciaEnBase = evidencia();
  detalleEnBase = detalle({ estado: 'COMPLETADO' });
  activasEnBase = 1;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(ADMIN), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_EVIDENCIA.ULTIMA_OBLIGATORIA);
  assert.match(res.datos.error, /última evidencia obligatoria/);
  assert.deepEqual(solo('RETIRAR'), []);
  assert.deepEqual(tx(), ['BEGIN', 'ROLLBACK']);
});

test('CASO 21 · ADMIN SI puede retirar la ultima en ANULADA', async () => {
  ordenEnBase = orden({ estado: 'ANULADA' });
  evidenciaEnBase = evidencia();
  detalleEnBase = detalle({ estado: 'COMPLETADO' });
  activasEnBase = 1;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(ADMIN, 'Orden anulada'), res);

  assert.equal(res.codigo, 200);
  assert.equal(res.datos.evidencia_retirada.regla_aplicada, 'ANULADA_ADMIN');
  assert.equal(res.datos.evidencias_activas_del_apartado, 0);
});

test('CASO 22 · retirar sin motivo: 400 antes de abrir transaccion', async () => {
  evidenciaEnBase = evidencia();

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(TI, null), res);

  assert.equal(res.codigo, 400);
  assert.deepEqual(tx(), [], 'no se abrio ninguna transaccion');
  assert.deepEqual(solo('RETIRAR'), []);
});

test('RETIRO · una evidencia ya retirada no se reescribe', async () => {
  evidenciaEnBase = evidencia({
    estado: 'RETIRADA',
    motivo_retiro: 'el primero'
  });

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(TI, 'el segundo'), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_EVIDENCIA.YA_RETIRADA);
  assert.deepEqual(solo('RETIRAR'), []);
});

test('RETIRO · una evidencia de otra OT da 404', async () => {
  evidenciaEnBase = null;

  const res = respuesta();

  await retirarEvidenciaDeOrden(peticionRetiro(TI), res);

  assert.equal(res.codigo, 404);
  assert.match(res.datos.error, /Evidencia no encontrada/);
});

// ---------------------------------------------------------------- validacion del cierre

const peticionCierre = (usuario = TI) => ({
  ...peticion(usuario),
  params: {
    programaId: '90',
    programacionId: '12575',
    otId: '7001'
  },
  body: {}
});

test('CIERRE · se valida el sustento ANTES de resolver el tecnico y de cerrar', async () => {
  detallesParaCierre = [
    {
      id: 3001,
      estado: 'COMPLETADO',
      observaciones: null,
      tipo_equipo: 'CAMARAS',
      evidencias_activas: 0
    }
  ];

  const res = respuesta();

  await cerrarOrdenTrabajo(peticionCierre(), res);

  assert.equal(res.codigo, 409);
  assert.equal(res.datos.code, CODIGOS_EVIDENCIA.EVIDENCIAS_INCOMPLETAS);

  // el contrato estructurado que el frontend va a consumir
  assert.equal(res.datos.incumplimientos.length, 1);
  assert.deepEqual(res.datos.incumplimientos[0].tipo_equipo, 'CAMARAS');
  assert.deepEqual(res.datos.incumplimientos[0].falta, 'EVIDENCIA');

  // y no se llego a nada de lo que viene despues
  assert.deepEqual(solo('ASIGNAR_TECNICO'), []);
  assert.deepEqual(solo('CERRAR_OT'), []);
  assert.deepEqual(tx(), ['BEGIN', 'ROLLBACK']);

  // la fuente de verdad fue la BASE
  assert.deepEqual(solo('DETALLES_CIERRE'), [['DETALLES_CIERRE', 7001]]);
});

test('CIERRE · con el sustento completo, el cierre sigue su curso', async () => {
  detallesParaCierre = [
    {
      id: 3001,
      estado: 'COMPLETADO',
      observaciones: null,
      tipo_equipo: 'CAMARAS',
      evidencias_activas: 2
    },
    {
      id: 3002,
      estado: 'NO_APLICA',
      observaciones: 'No tiene ese equipo',
      tipo_equipo: 'GPS',
      evidencias_activas: 0
    }
  ];

  const res = respuesta();

  await cerrarOrdenTrabajo(peticionCierre(), res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(solo('CERRAR_OT'), [['CERRAR_OT']]);
  assert.equal(res.datos.estado_programacion, 'EJECUTADO');

  // la validacion ocurre antes del tecnico y del cierre
  const s = secuencia();

  assert.ok(s.indexOf('DETALLES_CIERRE') < s.indexOf('CERRAR_OT'));
});

test('CIERRE · el 409 nombra TODOS los apartados que incumplen', async () => {
  detallesParaCierre = [
    {
      id: 3001,
      estado: 'COMPLETADO',
      observaciones: null,
      tipo_equipo: 'CAMARAS',
      evidencias_activas: 0
    },
    {
      id: 3002,
      estado: 'PENDIENTE',
      observaciones: null,
      tipo_equipo: 'RADIO_BASE',
      evidencias_activas: 0
    },
    {
      id: 3003,
      estado: 'PENDIENTE',
      observaciones: null,
      tipo_equipo: 'ADAS',
      evidencias_activas: 0
    }
  ];

  const res = respuesta();

  await cerrarOrdenTrabajo(peticionCierre(), res);

  assert.equal(res.codigo, 409);

  // CAMARAS foto · RADIO_BASE foto + observaciones · ADAS solo observaciones
  assert.equal(res.datos.incumplimientos.length, 4);
  assert.deepEqual(
    res.datos.incumplimientos.map(i => `${i.tipo_equipo}:${i.falta}`),
    [
      'CAMARAS:EVIDENCIA',
      'RADIO_BASE:EVIDENCIA',
      'RADIO_BASE:OBSERVACIONES',
      'ADAS:OBSERVACIONES'
    ]
  );

  // ADAS no puede aparecer nunca con falta de EVIDENCIA
  assert.ok(
    !res.datos.incumplimientos.some(
      i => i.tipo_equipo === 'ADAS' && i.falta === 'EVIDENCIA'
    )
  );
});
