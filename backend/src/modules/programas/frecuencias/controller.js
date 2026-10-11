import {
  obtenerFrecuencias
} from './repository.js';

import {
  normalizarFiltros,
  FAMILIAS_ANUALES
} from './service.js';

import {
  existePrograma
} from '../repository.js';

import {
  normalizarId,
  noEncontrado,
  manejar
} from '../comun.js';

const ERRORES = {
  mensajes: {
    fk_frecuencia_programa: {
      status: 404,
      error: 'Programa de mantenimiento no encontrado'
    }
  }
};

export const listarFrecuencias = manejar(
  async (req, res) => {
    const programaId = normalizarId(
      'programaId',
      req.params.programaId
    );

    if (
      !await existePrograma(programaId)
    ) {
      throw noEncontrado(
        'Programa de mantenimiento no encontrado'
      );
    }

    const filtros = normalizarFiltros(
      req.query
    );

    const frecuencias =
      await obtenerFrecuencias(
        programaId,
        filtros
      );

    return res.json({
      programa_id: programaId,
      total: frecuencias.length,
      // La unidad de cadencia es la QUINCENA, no el día: la deja dicho el nombre de la
      // columna y lo exige el modelo desde 20260918_002.
      unidad_de_frecuencia: 'quincenas',
      familias_anuales: FAMILIAS_ANUALES,
      frecuencias
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar las frecuencias del programa'
  }
);
