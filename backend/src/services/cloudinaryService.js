import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

const VARIABLES_CLOUDINARY = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

const variablesFaltantes = VARIABLES_CLOUDINARY.filter(
  variable => !String(process.env[variable] || '').trim()
);

if (variablesFaltantes.length > 0) {
  throw new Error(
    `Faltan variables de Cloudinary: ${variablesFaltantes.join(', ')}`
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadToCloudinary = (
  buffer,
  folderName,
  resourceType = 'auto'
) => {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buffer)) {
      reject(
        new Error('No se recibió un archivo válido para Cloudinary')
      );
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folderName,
        resource_type: resourceType
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url) {
          reject(
            new Error('Cloudinary no devolvió la URL del archivo')
          );
          return;
        }

        resolve(result.secure_url);
      }
    );

    streamifier
      .createReadStream(buffer)
      .pipe(uploadStream);
  });
};

// =====================================================================================
// EVIDENCIA FOTOGRAFICA DE TI-PR-01 · F5.2
// =====================================================================================
// TRES FUNCIONES NUEVAS, ADITIVAS. uploadToCloudinary y deleteFromCloudinary NO se tocan:
// entregas, inspecciones y tickets siguen con su comportamiento exacto.
//
// POR QUE NO SIRVE uploadToCloudinary PARA ESTO, y son tres razones:
//
//   1. devuelve SOLO result.secure_url y descarta public_id, format, bytes, width y
//      height, que son justo los metadatos que 018 exige NOT NULL;
//   2. usa resource_type 'auto', que aceptaria un video o un PDF;
//   3. sube como type 'upload', es decir con URL publica permanente.
//
// LO QUE SE MIDIO CONTRA LA CUENTA REAL, con una subida de prueba ya destruida:
//
//   type 'authenticated' aceptado          · metadatos completos devueltos
//   URL sin firmar            -> 401       · URL firmada            -> 200
//   miniatura transformada y firmada -> 200
//   add-on de URLs con caducidad (auth_token) -> 401, NO disponible en esta cuenta
//
// Consecuencia de lo ultimo: la firma NO expira. Lo que aporta es que la URL no se puede
// construir sin el API_SECRET, que vive solo aqui. Por eso la URL firmada NUNCA se entrega
// al navegador: la genera el backend y sirve la imagen el propio ERP.
const CARPETA_EVIDENCIAS = 'ti-pr-01/evidencias-ot';

// Sube una imagen como asset AUTENTICADO y devuelve el resultado completo.
//
// resource_type 'image' explicito, no 'auto': si lo que llega no es una imagen, Cloudinary
// falla aqui en vez de guardar un video con cara de foto. Es la ultima comprobacion de
// formato despues de la de magic bytes que hace el service.
export const subirEvidenciaAutenticada = (
  buffer,
  carpeta = CARPETA_EVIDENCIAS
) => new Promise((resolve, reject) => {
  if (!Buffer.isBuffer(buffer)) {
    reject(
      new Error('No se recibió un archivo válido para Cloudinary')
    );

    return;
  }

  const flujo = cloudinary.uploader.upload_stream(
    {
      folder: carpeta,
      resource_type: 'image',
      type: 'authenticated'
    },
    (error, resultado) => {
      if (error) {
        reject(error);

        return;
      }

      // Los cinco que 018 declara NOT NULL. Si Cloudinary no los diera, es mejor fallar
      // aqui que insertar una fila incompleta y que la base la rechace con un 23502.
      const faltan = ['public_id', 'format', 'bytes', 'width', 'height']
        .filter(
          campo => resultado?.[campo] === undefined ||
            resultado?.[campo] === null
        );

      if (faltan.length > 0) {
        reject(
          new Error(
            `Cloudinary no devolvió ${faltan.join(', ')} de la imagen subida`
          )
        );

        return;
      }

      resolve({
        public_id: resultado.public_id,
        formato: String(resultado.format).toLowerCase(),
        bytes: resultado.bytes,
        ancho: resultado.width,
        alto: resultado.height,
        // Solo para el log de la compensacion: NO se persiste ni se publica.
        tipo: resultado.type,
        recurso: resultado.resource_type
      });
    }
  );

  streamifier
    .createReadStream(buffer)
    .pipe(flujo);
});

// LA URL FIRMADA, que no sale de aqui. La construye el backend justo antes de leer la
// imagen y la descarta; el navegador nunca la ve.
//
// `ancho` opcional: cuando se pide, Cloudinary entrega la miniatura ya redimensionada, lo
// que ahorra transferir la foto completa para un listado. Medido: la miniatura firmada
// tambien responde 200.
export const urlFirmadaEvidencia = (
  publicId,
  ancho = null
) => cloudinary.url(publicId, {
  resource_type: 'image',
  type: 'authenticated',
  sign_url: true,
  secure: true,
  ...(Number.isInteger(ancho) && ancho > 0
    ? {
      transformation: [
        {
          width: ancho,
          crop: 'limit',
          quality: 'auto'
        }
      ]
    }
    : {})
});

// LA COMPENSACION. Se invoca cuando Cloudinary ya subio el asset y la transaccion de
// PostgreSQL no pudo confirmarse: sin esto quedaria un huerfano pagando almacenamiento y
// sin ninguna fila que lo explique.
//
// Devuelve si el asset ya no esta -'ok' o 'not found'- para que quien llame pueda
// distinguir el huerfano real y registrarlo. NUNCA lanza: se usa dentro de un catch y una
// excepcion aqui taparia el error original, que es el que de verdad hay que contar.
export const destruirEvidenciaAutenticada = async publicId => {
  if (
    typeof publicId !== 'string' ||
    publicId.trim() === ''
  ) {
    return false;
  }

  try {
    const resultado = await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true
      }
    );

    return ['ok', 'not found'].includes(resultado?.result);
  } catch (error) {
    console.error(
      `[TI_PR_01_EVIDENCIA] fallo al destruir el asset ${publicId}:`,
      error.message
    );

    return false;
  }
};

export const deleteFromCloudinary = async url => {
  if (
    typeof url !== 'string' ||
    !url.includes('cloudinary.com')
  ) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const partes = parsedUrl.pathname
      .split('/')
      .filter(Boolean);

    const uploadIndex = partes.indexOf('upload');

    if (
      uploadIndex === -1 ||
      uploadIndex >= partes.length - 1
    ) {
      return false;
    }

    const tipoEncontrado = partes.find(parte =>
      ['image', 'raw', 'video'].includes(parte)
    );

    const resourceType = tipoEncontrado || 'image';

    let partesPublicId = partes.slice(uploadIndex + 1);

    if (
      partesPublicId[0] &&
      /^v\d+$/.test(partesPublicId[0])
    ) {
      partesPublicId = partesPublicId.slice(1);
    }

    const publicIdConExtension = decodeURIComponent(
      partesPublicId.join('/')
    );

    const publicId = resourceType === 'raw'
      ? publicIdConExtension
      : publicIdConExtension.replace(/\.[^/.]+$/, '');

    if (!publicId) {
      return false;
    }

    const resultado = await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: resourceType,
        invalidate: true
      }
    );

    console.log(
      `Archivo eliminado de Cloudinary: ${publicId}`
    );

    return ['ok', 'not found'].includes(resultado.result);
  } catch (error) {
    console.error(
      `Error eliminando archivo de Cloudinary (${url}):`,
      error
    );

    return false;
  }
};
