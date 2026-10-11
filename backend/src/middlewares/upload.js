import multer from 'multer';

const storage = multer.memoryStorage();
const MB = 1024 * 1024;

const TIPOS_IMAGEN = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif'
]);

const CAMPOS_IMAGEN = new Set([
  'img_tablet',
  'img_radio',
  'img_camaras',
  'evidencia',
  'evidencias'
]);

const TIPOS_EXCEL = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream'
]);

const filtrarArchivo = (_req, file, callback) => {
  let permitido = false;

  if (CAMPOS_IMAGEN.has(file.fieldname)) {
    permitido = TIPOS_IMAGEN.has(file.mimetype);
  } else if (file.fieldname === 'acta') {
    permitido =
      TIPOS_IMAGEN.has(file.mimetype) ||
      file.mimetype === 'application/pdf';
  } else if (file.fieldname === 'file') {
    permitido =
      /\.(xlsx|xls)$/i.test(file.originalname) &&
      TIPOS_EXCEL.has(file.mimetype);
  }

  if (!permitido) {
    const error = new Error(
      'Tipo de archivo no permitido para este campo'
    );

    error.code = 'INVALID_FILE_TYPE';

    return callback(error);
  }

  return callback(null, true);
};

export const upload = multer({
  storage,
  fileFilter: filtrarArchivo,

  limits: {
    fileSize: 10 * MB,
    files: 3,
    fields: 40,
    fieldSize: 64 * 1024
  }
});

const ticketEvidenceUpload = multer({
  storage,
  fileFilter: filtrarArchivo,

  limits: {
    fileSize: 5 * MB,
    files: 20,
    fields: 40,
    fieldSize: 64 * 1024
  }
});

export const receiveTicketEvidence =
  ticketEvidenceUpload.array('evidencias', 20);

// =====================================================================================
// EVIDENCIA FOTOGRAFICA DE TI-PR-01 · F5.2
// =====================================================================================
// Instancia PROPIA, no la compartida: sus limites son mas estrictos y su lista de tipos es
// mas corta. Reutilizar `upload` habria admitido gif, avif, heic y heif, que F5.2 no acepta,
// y habria permitido tres archivos por peticion.
//
// UN SOLO ARCHIVO POR PETICION, y es una decision de diseno, no una limitacion: el tope de
// 4 activas por apartado se comprueba con FOR UPDATE + COUNT + INSERT dentro de una
// transaccion, y con varios archivos en el mismo cuerpo habria que decidir si se aceptan
// los que caben y se rechazan los demas -una respuesta parcial que el cliente no sabria
// interpretar-. De uno en uno, cada peticion tiene una respuesta inequivoca.
//
// ESTE FILTRO NO ES LA VALIDACION DE FORMATO. file.mimetype lo declara el cliente y es
// falsificable: aqui solo sirve para rechazar lo evidente antes de leer el cuerpo entero.
// La comprobacion de verdad son los MAGIC BYTES del buffer, en el service.
const TIPOS_EVIDENCIA_TI = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export const LIMITE_EVIDENCIA_TI_BYTES = 10 * MB;

const evidenciaOrdenUpload = multer({
  storage,

  fileFilter: (_req, file, callback) => {
    if (!TIPOS_EVIDENCIA_TI.has(file.mimetype)) {
      const error = new Error(
        'Solo se admiten fotografías JPEG, PNG o WEBP'
      );

      error.code = 'INVALID_FILE_TYPE';

      return callback(error);
    }

    return callback(null, true);
  },

  limits: {
    fileSize: LIMITE_EVIDENCIA_TI_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 64 * 1024
  }
});

// El campo se llama `imagen` en singular, justo porque es uno.
export const receiveEvidenciaOrden =
  evidenciaOrdenUpload.single('imagen');