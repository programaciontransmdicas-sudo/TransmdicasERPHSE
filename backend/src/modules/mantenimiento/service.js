export class MantenimientoValidationError extends Error {
  constructor(
    message,
    status = 400
  ) {
    super(message);

    this.name =
      'MantenimientoValidationError';

    this.status = status;
  }
}

export const normalizarMantenimientos =
  mantenimientos => {
    return mantenimientos.map(
      mantenimiento => {
        let fecha =
          mantenimiento
            .fecha_ejecutada_raw;

        if (
          fecha &&
          fecha.includes('--')
        ) {
          fecha = null;
        }

        if (
          fecha &&
          fecha.includes('/')
        ) {
          const partes =
            fecha.split('/');

          if (
            partes.length === 3
          ) {
            fecha =
              `${partes[2]}-${partes[1]}-${partes[0]}`;
          }
        }

        return {
          ...mantenimiento,
          fecha_ejecutada:
            fecha
        };
      }
    );
  };

export const validarNuevoMantenimiento =
  datos => {
    const mantenimiento =
      datos || {};

    if (
      typeof mantenimiento.placa !==
        'string' ||
      !mantenimiento.placa.trim()
    ) {
      throw new MantenimientoValidationError(
        'Debe seleccionar un vehículo para registrar el mantenimiento'
      );
    }

    return {
      ...mantenimiento,
      placa:
        mantenimiento.placa.trim()
    };
  };