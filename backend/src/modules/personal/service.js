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
  'estado'
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

  return resultado;
};

export const validarNuevoPersonal =
  datos =>
    validarDatosPersonal(
      datos,
      false
    );