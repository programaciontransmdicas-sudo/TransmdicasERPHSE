const CAMPOS_EDITABLES = [
  'tipo_vehiculo',
  'marca_tracto',
  'modelo_tracto',
  'anio_fabricacion',
  'operacion',
  'cliente'
];

export class FlotaValidationError extends Error {
  constructor(
    message,
    status = 400
  ) {
    super(message);

    this.name =
      'FlotaValidationError';

    this.status = status;
  }
}

export const calcularEstado =
  vehiculo => {
    const tablet = String(
      vehiculo.tablet || ''
    )
      .trim()
      .toUpperCase();

    const radio = String(
      vehiculo.radio || ''
    )
      .trim()
      .toUpperCase();

    const camaras = String(
      vehiculo.camaras || ''
    )
      .trim()
      .toUpperCase();

    if (
      !tablet &&
      !radio &&
      !camaras
    ) {
      return 'Falta de revisión';
    }

    const esCorrectoONoAplica =
      valor =>
        [
          'OK',
          'N/A',
          'NO APLICA'
        ].includes(valor);

    const esNoAplica =
      valor =>
        [
          'N/A',
          'NO APLICA'
        ].includes(valor);

    const tieneError = [
      tablet,
      radio,
      camaras
    ].some(
      valor =>
        valor === 'ERROR'
    );

    const tieneFaltante = [
      tablet,
      radio,
      camaras
    ].some(
      valor =>
        valor.includes('FALTA')
    );

    if (tieneError) {
      return 'Observada';
    }

    if (tieneFaltante) {
      return 'Falta de revisión';
    }

    if (
      esNoAplica(tablet) &&
      esNoAplica(radio) &&
      esNoAplica(camaras)
    ) {
      return 'N/A';
    }

    if (
      esCorrectoONoAplica(
        tablet
      ) &&
      esCorrectoONoAplica(
        radio
      ) &&
      esCorrectoONoAplica(
        camaras
      )
    ) {
      return 'Operativa';
    }

    return 'Observada';
  };

export const prepararFiltrosVehiculos =
  query => {
    const page = Math.max(
      Number.parseInt(
        query.page,
        10
      ) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number.parseInt(
          query.limit,
          10
        ) || 50,
        1
      ),
      200
    );

    const search = String(
      query.search || ''
    )
      .trim()
      .toLowerCase();

    const operacion =
      query.operacion &&
      query.operacion !== 'Todos'
        ? String(
            query.operacion
          ).trim()
        : '';

    const estado = String(
      query.estado || 'Todos'
    ).trim();

    return {
      page,
      limit,
      offset:
        (page - 1) * limit,
      search,
      operacion,
      estado
    };
  };

export const prepararNuevoVehiculo =
  datos => {
    const {
      placa,
      programa,
      tipo_vehiculo,
      operacion,
      cliente,
      marca_tracto,
      modelo_tracto,
      anio_fabricacion
    } = datos || {};

    const placaFinal = String(
      placa || ''
    )
      .trim()
      .toUpperCase();

    const operacionFinal =
      String(
        operacion ||
          programa ||
          ''
      ).trim();

    if (
      !placaFinal ||
      !operacionFinal
    ) {
      throw new FlotaValidationError(
        'Placa y operación son obligatorios'
      );
    }

    return {
      placa: placaFinal,
      operacion:
        operacionFinal,
      tipo_vehiculo,
      cliente,
      marca_tracto,
      modelo_tracto,
      anio_fabricacion
    };
  };

export const prepararActualizacionVehiculo =
  (placaParam, data) => {
    const placa = String(
      placaParam || ''
    )
      .trim()
      .toUpperCase();

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      throw new FlotaValidationError(
        'Datos del vehículo no válidos'
      );
    }

    const campos =
      CAMPOS_EDITABLES.filter(
        campo =>
          Object.prototype
            .hasOwnProperty
            .call(
              data,
              campo
            )
      );

    if (!campos.length) {
      throw new FlotaValidationError(
        'No se enviaron campos editables'
      );
    }

    if (
      campos.some(
        campo =>
          data[campo] !== null &&
          typeof data[campo] !==
            'string'
      )
    ) {
      throw new FlotaValidationError(
        'Los campos deben contener texto o null'
      );
    }

    return {
      placa,
      campos,
      data
    };
  };

export const normalizarPlaca =
  placa =>
    String(placa || '')
      .trim()
      .toUpperCase();