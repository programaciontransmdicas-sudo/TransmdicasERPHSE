import multer from 'multer';
export const notFound = (_req, res) => {
  return res.status(404).json({
    error: 'Ruta no encontrada'
  });
};

export const handleError = (error, _req, res, next) => {
  // Si la respuesta ya empezó, Express debe terminar de manejarla.
  if (res.headersSent) {
    return next(error);
  }
  if (error.code === 'INVALID_FILE_TYPE') {
  return res.status(400).json({
    error: error.message
  });
}
  if (error instanceof multer.MulterError) {
  const mensajes = {
    LIMIT_FILE_SIZE:
      'El archivo supera el tamaño máximo permitido',

    LIMIT_FILE_COUNT:
      'Se adjuntaron demasiados archivos',

    LIMIT_UNEXPECTED_FILE:
      'Se recibió un archivo en un campo no permitido o se superó su cantidad',

    LIMIT_FIELD_COUNT:
      'Se enviaron demasiados campos',

    LIMIT_FIELD_VALUE:
      'Un campo de texto supera el tamaño permitido'
  };

  const status = [
    'LIMIT_FILE_SIZE',
    'LIMIT_FIELD_VALUE'
  ].includes(error.code) ? 413 : 400;

  return res.status(status).json({
    error:
      mensajes[error.code] ||
      'La carga de archivos no es válida'
  });
}

  // Por ejemplo: recibir un cuerpo JSON con una llave sin cerrar.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'El cuerpo JSON no es válido'
    });
  }

  // Se superó el límite configurado para el cuerpo de la petición.
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'La solicitud supera el tamaño permitido'
    });
  }

  // Registrar información básica sin imprimir el contenido de la petición.
  console.error('Error no controlado:', {
    nombre: error.name,
    codigo: error.code
  });

  return res.status(500).json({
    error: 'Error interno del servidor'
  });
};