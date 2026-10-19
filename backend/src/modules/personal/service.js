export class PersonalValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PersonalValidationError';
    this.status = status;
  }
}

export const CAMPOS_PERSONAL = [
  'nombre_completo',
  'dni',
  'modalidad',
  'area',
  'cargo',
  'estado',
  'cliente',
  'operacion',
  'cliente_operacion_id'
];

export const validarDatosPersonal = (
  datos,
  parcial = false
) => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new PersonalValidationError(
      'Los datos del personal no son válidos'
    );
  }

  const resultado = {};

  for (const campo of CAMPOS_PERSONAL) {
    if (!Object.hasOwn(datos, campo)) {
      continue;
    }

    const valor = datos[campo];
    if (campo === 'cliente_operacion_id') {
      if (!Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) {
        throw new PersonalValidationError('Seleccione una operación válida');
      }
      resultado[campo] = Number(valor);
      continue;
    }

    if (
      valor !== null &&
      typeof valor !== 'string'
    ) {
      throw new PersonalValidationError(
        `El campo ${campo} debe contener texto o null`
      );
    }

    resultado[campo] =
      typeof valor === 'string'
        ? valor.trim()
        : null;
  }

  for (const campo of [
    'nombre_completo',
    'dni'
  ]) {
    const fueEnviado =
      Object.hasOwn(
        resultado,
        campo
      );

    if (
      (!parcial || fueEnviado) &&
      !resultado[campo]
    ) {
      throw new PersonalValidationError(
        'Nombre y DNI no pueden estar vacíos'
      );
    }
  }

  if (
    Object.keys(resultado).length === 0
  ) {
    throw new PersonalValidationError(
      'No se enviaron campos editables'
    );
  }

  if (Object.hasOwn(resultado, 'nombre_completo')) {
    const partes = String(resultado.nombre_completo || '').split(',');
    if (partes.length !== 2 || partes.some(parte => !parte.trim())) {
      throw new PersonalValidationError('Escriba el nombre con el formato APELLIDOS, NOMBRES');
    }
    resultado.nombre_completo = partes.map(parte => parte.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es')).join(', ');
  }
  if (resultado.estado && !['Activo', 'Inactivo'].includes(resultado.estado)) {
    throw new PersonalValidationError('El estado debe ser Activo o Inactivo');
  }
  return resultado;
};

export const validarNuevoPersonal =
  datos =>
    validarDatosPersonal(
      datos,
      false
    );