// ==========================================
// UNIDADES DE UN PROGRAMA DE MANTENIMIENTO (TI-PR-01)
// Reglas de negocio y normalización. No conoce HTTP ni SQL.
// ==========================================
//
// MODELO VIGENTE. programa_mantenimiento_unidades conserva tras el cleanup:
// id, programa_id, placa, quincena_incorporacion, observaciones y las marcas de tiempo.
//
// fecha_base_m1, fecha_base_m2, fecha_base_m3 y quincena_arranque son LEGACY: las retira
// 20261001_900. No se validan, no se leen y no se escriben. La fase de cada equipo vive
// hoy en programa_mantenimiento_unidad_ciclos y programa_mantenimiento_unidad_anclas, con
// grano (unidad, tipo_equipo, nivel), que es lo que el generador consume.

import {
  ValidationError,
  normalizarTextoOpcional,
  separarCamposEditables
} from '../comun.js';

// DECISION FIJADA: placa y programa_id son la identidad de la fila
// -uq_programa_mantenimiento_unidad- y el destino de fk_programa_unidad_vehiculo. Cambiar
// la placa de una unidad ya incorporada arrastraria sus ciclos, sus anclas y su
// programacion; eso es dar de baja una unidad y alta a otra.
export const CAMPOS_EDITABLES = [
  'quincena_incorporacion',
  'observaciones'
];

const CAMPOS_ALTA = [
  'placa',
  ...CAMPOS_EDITABLES
];

const LONGITUD_PLACA = 20;

const AYUDA_LEGACY =
  'fecha_base_m1, fecha_base_m2, fecha_base_m3 y quincena_arranque son columnas legacy '
  + 'que el cleanup elimina: la fase de cada equipo vive en los ciclos y las anclas de '
  + 'la unidad.';

const AYUDA_IDENTIDAD =
  'La placa y el programa son la identidad de la fila; para cambiarlos se da de baja la '
  + 'unidad y se incorpora otra.';

export const normalizarPlaca = valor => {
  if (typeof valor !== 'string') {
    throw new ValidationError(
      'placa es obligatoria'
    );
  }

  const placa = valor
    .trim()
    .toUpperCase();

  if (!placa) {
    throw new ValidationError(
      'placa es obligatoria'
    );
  }

  if (placa.length > LONGITUD_PLACA) {
    throw new ValidationError(
      `placa no puede superar ${LONGITUD_PLACA} caracteres`
    );
  }

  return placa;
};

// DECISION FIJADA: quincena_incorporacion es NULLABLE y, cuando tiene valor, cae el dia 1
// o el 16. Es el espejo de chk_programa_unidad_quincena_incorporacion. Se valida aqui para
// devolver un 400 con el motivo en vez de dejar que la base conteste con un 23514
// ilegible. La base sigue siendo la autoridad; esto solo traduce.
export const normalizarQuincena = valor => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  if (typeof valor !== 'string') {
    throw new ValidationError(
      'quincena_incorporacion debe ser una fecha AAAA-MM-DD'
    );
  }

  const texto = valor.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(texto)
  ) {
    throw new ValidationError(
      'quincena_incorporacion debe tener el formato AAAA-MM-DD'
    );
  }

  const [
    anio,
    mes,
    dia
  ] = texto
    .split('-')
    .map(Number);

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new ValidationError(
      `quincena_incorporacion ${texto} no es una fecha válida`
    );
  }

  if (dia !== 1 && dia !== 16) {
    throw new ValidationError(
      'quincena_incorporacion debe caer el día 1 o el día 16: es una quincena '
      + 'administrativa, no una fecha libre'
    );
  }

  return texto;
};

const datosDe = (
  datos,
  campos
) => {
  const salida = {};

  if (campos.includes('quincena_incorporacion')) {
    salida.quincena_incorporacion =
      normalizarQuincena(
        datos.quincena_incorporacion
      );
  }

  if (campos.includes('observaciones')) {
    salida.observaciones =
      normalizarTextoOpcional(
        'observaciones',
        datos.observaciones
      );
  }

  return salida;
};

export const prepararNuevaUnidad = datos => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      'Datos de la unidad no válidos'
    );
  }

  const rechazados = Object.keys(datos)
    .filter(
      campo => !CAMPOS_ALTA.includes(campo)
    );

  if (rechazados.length > 0) {
    throw new ValidationError(
      `Estos campos no se aceptan: ${rechazados.join(', ')}. `
      + `Admitidos: ${CAMPOS_ALTA.join(', ')}. ${AYUDA_LEGACY}`
    );
  }

  return {
    placa: normalizarPlaca(datos.placa),
    quincena_incorporacion:
      normalizarQuincena(
        datos.quincena_incorporacion
      ),
    observaciones:
      normalizarTextoOpcional(
        'observaciones',
        datos.observaciones
      )
  };
};

export const prepararActualizacionUnidad = datos => {
  const campos = separarCamposEditables(
    datos,
    CAMPOS_EDITABLES,
    {
      sujeto: 'en la unidad',
      ayuda: AYUDA_IDENTIDAD
    }
  );

  return {
    campos,
    data: datosDe(datos, campos)
  };
};
