// ==========================================
// PROGRAMAS DE MANTENIMIENTO (TI-PR-01)
// Reglas de negocio y normalización. No conoce HTTP ni SQL.
// ==========================================
//
// MODELO VIGENTE, no el de septiembre. Lo fija 20260923_004 y lo remata el cleanup
// 20261001_901: TI-PR-01 es UN programa permanente, identificado por su codigo. El
// encabezado conserva solo codigo, nombre y estado. Los datos DOCUMENTALES -version,
// fecha_documento, periodo_inicio, periodo_fin- viven en programas_mantenimiento_versiones,
// y las periodicidades en programa_mantenimiento_frecuencias.
//
// Por eso esta capa NO valida periodo_*, version, fecha_documento ni frecuencia_m*_dias:
// son columnas que el cleanup elimina del encabezado. Validarlas aqui seria construir
// deuda nueva sobre columnas condenadas.

import {
  ValidationError,
  normalizarTextoObligatorio,
  separarCamposEditables
} from './comun.js';

// chk_programas_mantenimiento_estado
export const ESTADOS_PROGRAMA = [
  'ACTIVO',
  'CERRADO',
  'ANULADO'
];

// chk_version_estado. Solo lectura en esta etapa: crear o publicar versiones exige una
// decisión de negocio que todavía no está tomada -quién cierra la vigencia de la anterior-.
export const ESTADOS_VERSION = [
  'BORRADOR',
  'VIGENTE',
  'SUPERSEDIDA',
  'ANULADA'
];

// DECISION FIJADA: codigo es INMUTABLE tras la creación. Es la identidad permanente del
// programa -uq_programas_mantenimiento_codigo- y renombrarlo equivaldría a convertirlo en
// otro programa sin dejar rastro. El estado tiene su propio endpoint y updated_at lo
// mantiene trg_set_updated_at_programas_mantenimiento.
export const CAMPOS_EDITABLES = [
  'nombre'
];

const LONGITUD_NOMBRE = 200;

const AYUDA_EDICION =
  'Los datos documentales -version, fecha_documento, periodo_inicio, periodo_fin- '
  + 'pertenecen a las versiones del programa, y las periodicidades a sus frecuencias. '
  + 'El codigo es inmutable y el estado tiene su propio endpoint.';

export const normalizarEstado = valor => {
  const estado = String(
    valor ?? ''
  )
    .trim()
    .toUpperCase();

  if (
    !ESTADOS_PROGRAMA.includes(estado)
  ) {
    throw new ValidationError(
      `El estado debe ser ${ESTADOS_PROGRAMA.join(', ')}`
    );
  }

  return estado;
};

export const prepararActualizacionPrograma = datos => {
  const campos = separarCamposEditables(
    datos,
    CAMPOS_EDITABLES,
    {
      sujeto: 'en el programa',
      ayuda: AYUDA_EDICION
    }
  );

  return {
    campos,
    data: {
      nombre: campos.includes('nombre')
        ? normalizarTextoObligatorio(
          'nombre',
          datos.nombre,
          LONGITUD_NOMBRE
        )
        : undefined
    }
  };
};

export const prepararCambioEstado = datos => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      'Datos del cambio de estado no válidos'
    );
  }

  return {
    estado: normalizarEstado(
      datos.estado
    )
  };
};

// Misma regla que versionDe() del generador: intervalo SEMIABIERTO
// [vigencia_desde, vigencia_hasta). No se mira el estado, porque la línea de tiempo ya la
// protege exc_version_vigencia_sin_solape para VIGENTE y SUPERSEDIDA.
//
// Se expresa aquí, en JavaScript, y no en SQL: el generador ya la implementa así y dos
// implementaciones de la misma regla acabarían divergiendo.
export const esVigenteEn = (
  version,
  fecha
) => {
  if (!version) {
    return false;
  }

  return (
    version.vigencia_desde <= fecha &&
    (
      version.vigencia_hasta === null ||
      version.vigencia_hasta > fecha
    )
  );
};

export const marcarVigente = (
  versiones,
  fecha
) => versiones.map(
  version => ({
    ...version,
    vigente_en_fecha: esVigenteEn(
      version,
      fecha
    )
  })
);

export const vigenteDe = (
  versiones,
  fecha
) => marcarVigente(versiones, fecha)
  .find(
    version => version.vigente_en_fecha
  ) ?? null;
