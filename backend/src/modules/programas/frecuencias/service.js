// ==========================================
// FRECUENCIAS DE UN PROGRAMA (TI-PR-01)
// Dominio y normalización de filtros. No conoce HTTP ni SQL.
// ==========================================
//
// SOLO LECTURA EN ESTA ETAPA. programa_mantenimiento_frecuencias es CONFIGURACION del
// programa, no dato de operación: sus 14 filas las carga cargar-fase-b.mjs desde el
// cajetín del documento TI-PR-01 y las gobierna uq_frecuencia_programa_equipo_nivel.
//
// Las periodicidades NO se hardcodean aquí: se leen de la tabla. Estas constantes son el
// DOMINIO -lo que los CHECK admiten-, no los valores.
//   chk_frecuencia_tipo_equipo, chk_frecuencia_nivel, chk_frecuencia_quincenas > 0,
//   chk_frecuencia_anual_solo_m3: GPS y ADAS solo pueden existir en M3.

import {
  ValidationError
} from '../comun.js';

// UNA SOLA FUENTE DE VERDAD. Las familias, su reparto entre regulares y anuales y el orden
// de los niveles ya están definidos en el núcleo del generador, que es quien los usa para
// proyectar y quien tiene el banco de 174 pruebas encima. Aquí se IMPORTAN, no se
// redefinen: una segunda copia de la regla GPS/ADAS acabaría divergiendo de la primera.
//
// El núcleo es puro -0 imports, 0 efectos al cargarlo-, así que importarlo desde la API no
// arrastra nada. La base respalda la misma regla con chk_frecuencia_anual_solo_m3.
import {
  REGULARES,
  ANUALES,
  ORDEN
} from '../../../../scripts/ti-pr-01/generador-nucleo.mjs';

export const TIPOS_EQUIPO = [
  ...REGULARES,
  ...ANUALES
];

// Las dos familias que chk_frecuencia_anual_solo_m3 restringe a M3.
export {
  ANUALES as FAMILIAS_ANUALES
};

export const NIVELES = Object.keys(ORDEN);

const normalizarDeDominio = (
  campo,
  valor,
  dominio
) => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  const texto = String(valor)
    .trim()
    .toUpperCase();

  if (!dominio.includes(texto)) {
    throw new ValidationError(
      `${campo} debe ser ${dominio.join(', ')}`
    );
  }

  return texto;
};

export const normalizarFiltros = (
  query = {}
) => ({
  tipo_equipo: normalizarDeDominio(
    'tipo_equipo',
    query.tipo_equipo,
    TIPOS_EQUIPO
  ),
  nivel_mantenimiento: normalizarDeDominio(
    'nivel_mantenimiento',
    query.nivel_mantenimiento,
    NIVELES
  )
});
