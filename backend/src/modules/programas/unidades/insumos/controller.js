import {
  obtenerEquiposDeUnidad,
  obtenerCiclosDeUnidad,
  obtenerAnclasDeUnidad
} from './repository.js';

import {
  normalizarFiltrosEquipos,
  normalizarFiltrosCiclos,
  proyectarInventario,
  TIPOS_FISICOS
} from './service.js';

import {
  obtenerUnidadPorId
} from '../repository.js';

import {
  existePrograma
} from '../../repository.js';

import {
  normalizarId,
  noEncontrado,
  manejar
} from '../../comun.js';

const ERRORES = {
  mensajeGenerico: null,
  mensajes: {}
};

// El programa y la unidad se comprueban por separado: una lista vacía, un programa que no
// existe y una unidad que pertenece a OTRO programa son tres cosas distintas y no pueden
// contestar lo mismo.
const unidadDelPrograma = async req => {
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

  const unidadId = normalizarId(
    'id',
    req.params.id
  );

  const unidad = await obtenerUnidadPorId(
    programaId,
    unidadId
  );

  if (!unidad) {
    throw noEncontrado(
      'Unidad no encontrada en este programa'
    );
  }

  return { programaId, unidad };
};

export const listarEquipos = manejar(
  async (req, res) => {
    const {
      programaId,
      unidad
    } = await unidadDelPrograma(req);

    const filtros =
      normalizarFiltrosEquipos(req.query);

    const conFiltro = Boolean(
      filtros.tipo_equipo ||
      filtros.estado_inventario
    );

    const filas =
      await obtenerEquiposDeUnidad(
        programaId,
        unidad.id,
        filtros
      );

    const equipos = proyectarInventario(
      filas,
      { completar: !conFiltro }
    );

    return res.json({
      programa_id: programaId,
      unidad: {
        id: unidad.id,
        placa: unidad.placa
      },
      // Dominio real de la tabla, para que el cliente no tenga que adivinarlo ni
      // inventarse estados que el esquema no tiene.
      tipos_fisicos: TIPOS_FISICOS,
      total_registrados: filas.length,
      total_ausentes: equipos.filter(
        e => !e.presente
      ).length,
      equipos
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al consultar el inventario TI de la unidad'
  }
);

// Devuelve las DOS tablas, cada una con sus columnas reales y en su propio array. No se
// fusionan: el ciclo es ejecución ocurrida y el ancla es punto de partida de fase. La
// precedencia entre ambas la resuelve el generador, no este endpoint.
export const listarCiclos = manejar(
  async (req, res) => {
    const {
      programaId,
      unidad
    } = await unidadDelPrograma(req);

    const filtros =
      normalizarFiltrosCiclos(req.query);

    const [
      ciclos,
      anclas
    ] = await Promise.all([
      obtenerCiclosDeUnidad(
        programaId,
        unidad.id,
        filtros
      ),
      obtenerAnclasDeUnidad(
        programaId,
        unidad.id,
        filtros
      )
    ]);

    return res.json({
      programa_id: programaId,
      unidad: {
        id: unidad.id,
        placa: unidad.placa,
        quincena_incorporacion:
          unidad.quincena_incorporacion
      },
      ciclos: {
        descripcion:
          'Ejecución ya ocurrida. ultima_quincena es la quincena administrativa; '
          + 'ultima_fecha_real es el día físico y es independiente: no mueve el ciclo.',
        total: ciclos.length,
        items: ciclos
      },
      anclas: {
        descripcion:
          'Punto de partida de fase para un nivel que todavía no tuvo ejecución real. '
          + 'No es la próxima fecha y no tiene día físico ni fuente.',
        total: anclas.length,
        items: anclas
      }
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al consultar los ciclos y anclas de la unidad'
  }
);
