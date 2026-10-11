import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../../services/cloudinaryService.js';

import {
  existeVehiculo
} from './repository.js';

export class InspeccionValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'InspeccionValidationError';
    this.status = status;
  }
}

export const validarEvidenciasInspeccion = files => {
  const archivos = ['img_tablet', 'img_radio', 'img_camaras']
    .flatMap(campo => Array.isArray(files?.[campo]) ? files[campo] : []);

  if (archivos.length === 0) {
    throw new InspeccionValidationError(
      'Adjunta al menos una foto de evidencia para registrar la inspección.'
    );
  }

  if (archivos.some(archivo =>
    !Buffer.isBuffer(archivo?.buffer) ||
    archivo.buffer.length === 0 ||
    !archivo.mimetype?.startsWith('image/')
  )) {
    throw new InspeccionValidationError(
      'Las evidencias deben ser imágenes y no pueden estar vacías.'
    );
  }
};

export const fechaISOValida = valor => {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
    valor.startsWith('0000-')
  ) {
    return false;
  }

  const fecha = new Date(
    `${valor}T00:00:00.000Z`
  );

  return (
    Number.isFinite(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor
  );
};

export const validarDatosInspeccion =
  async (
    datosOriginales,
    esNueva,
    alcance = {}
  ) => {
    const datos = {
      ...(datosOriginales || {})
    };

    for (const campo of ['fecha', 'hora']) {
      if (
        datos[campo] != null &&
        typeof datos[campo] !== 'string'
      ) {
        throw new InspeccionValidationError(
          `${campo}: se esperaba texto.`
        );
      }

      datos[campo] =
        datos[campo]?.trim() || null;
    }

    if (
      (esNueva && !datos.fecha) ||
      (
        datos.fecha &&
        !fechaISOValida(datos.fecha)
      )
    ) {
      throw new InspeccionValidationError(
        'Indica una fecha real con formato AAAA-MM-DD.'
      );
    }

    if (
      (esNueva && !datos.hora) ||
      (
        datos.hora &&
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
          datos.hora
        )
      )
    ) {
      throw new InspeccionValidationError(
        'Indica una hora válida con formato HH:MM.'
      );
    }

    if (esNueva) {
      if (
        typeof datos.placa !== 'string' ||
        !datos.placa.trim() ||
        datos.placa.trim().length > 20
      ) {
        throw new InspeccionValidationError(
          'Selecciona una placa del maestro de vehículos.'
        );
      }

      datos.placa =
        datos.placa
          .trim()
          .toUpperCase();

      const existe =
        await existeVehiculo({
          placa:
            datos.placa,
          accesoTotal:
            alcance.accesoTotal,
          clienteOperacionIds:
            alcance.clienteOperacionIds
        });

      if (!existe) {
        throw new InspeccionValidationError(
          'La placa no existe o no pertenece a sus clientes y operaciones asignados.',
          403
        );
      }
    }
    datos.fecha_hora =
  datos.fecha && datos.hora
    ? `${datos.fecha} ${datos.hora.length === 5 ? `${datos.hora}:00` : datos.hora}`
    : null;
    return datos;
  };

export const subirImagenesInspeccion =
  async files => {
    let imgTablet = '';
    let imgRadio = '';
    let imgCamaras = '';

    try {
      if (files?.img_tablet?.length) {
        imgTablet =
          await uploadToCloudinary(
            files.img_tablet[0].buffer,
            'flotas_inspecciones'
          );
      }

      if (files?.img_radio?.length) {
        imgRadio =
          await uploadToCloudinary(
            files.img_radio[0].buffer,
            'flotas_inspecciones'
          );
      }

      if (files?.img_camaras?.length) {
        imgCamaras =
          await uploadToCloudinary(
            files.img_camaras[0].buffer,
            'flotas_inspecciones'
          );
      }

      return {
        imgTablet,
        imgRadio,
        imgCamaras
      };
    } catch (error) {
      await eliminarImagenes([
        imgTablet,
        imgRadio,
        imgCamaras
      ]);

      throw error;
    }
  };

export const eliminarImagenes =
  async urls => {
    await Promise.allSettled(
      urls
        .filter(Boolean)
        .map(
          url =>
            deleteFromCloudinary(url)
        )
    );
  };
