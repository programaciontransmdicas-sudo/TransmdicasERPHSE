import {
  obtenerUnidadesPorPrograma,
  obtenerUnidadPorId,
  existeVehiculo,
  insertarUnidad,
  actualizarUnidad
} from './repository.js';

import {
  prepararNuevaUnidad,
  prepararActualizacionUnidad,
  normalizarPlaca
} from './service.js';

import {
  existePrograma
} from '../repository.js';

import {
  normalizarId,
  noEncontrado,
  manejar,
  ValidationError
} from '../comun.js';

import {
  logAction
} from '../../../services/auditService.js';

// La base ya garantiza la pertenencia al programa, la existencia del vehículo, la unicidad
// (programa_id, placa) y el día de quincena. Aquí solo se nombra cada rechazo; la
// taxonomía de códigos vive en comun.js y nunca se devuelve el mensaje del driver.
const ERRORES = {
  mensajes: {
    uq_programa_mantenimiento_unidad: {
      status: 409,
      error: 'Esa placa ya está incorporada a este programa'
    },
    fk_programa_unidad_vehiculo: {
      status: 409,
      error: 'La placa no existe en el maestro de vehículos'
    },
    fk_programa_unidad_programa: {
      status: 404,
      error: 'Programa de mantenimiento no encontrado'
    },
    chk_programa_unidad_quincena_incorporacion: {
      status: 400,
      error: 'quincena_incorporacion debe caer el día 1 o el día 16'
    }
  }
};

const NO_ENCONTRADA =
  'Unidad no encontrada en este programa';

// El programa se comprueba en todos los handlers: sin eso, una lista vacía y un programa
// inexistente darían la misma respuesta, y no son lo mismo.
const programaDe = async req => {
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

  return programaId;
};

const unidadDe = async (
  programaId,
  req
) => {
  const id = normalizarId(
    'id',
    req.params.id
  );

  const unidad =
    await obtenerUnidadPorId(
      programaId,
      id
    );

  if (!unidad) {
    throw noEncontrado(NO_ENCONTRADA);
  }

  return unidad;
};

export const listarUnidades = manejar(
  async (req, res) => {
    const programaId =
      await programaDe(req);

    const placa = req.query.placa
      ? normalizarPlaca(req.query.placa)
      : null;

    const unidades =
      await obtenerUnidadesPorPrograma(
        programaId,
        { placa }
      );

    return res.json({
      programa_id: programaId,
      total: unidades.length,
      unidades
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar las unidades del programa'
  }
);

export const obtenerUnidad = manejar(
  async (req, res) => {
    const programaId =
      await programaDe(req);

    return res.json(
      await unidadDe(programaId, req)
    );
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al obtener la unidad del programa'
  }
);

export const agregarUnidad = manejar(
  async (req, res) => {
    const programaId =
      await programaDe(req);

    const datos = prepararNuevaUnidad(
      req.body
    );

    // Comprobación previa para dar un 409 claro. La FK sigue siendo la autoridad y su
    // rechazo también está traducido: esto solo evita el caso corriente.
    if (
      !await existeVehiculo(datos.placa)
    ) {
      throw new ValidationError(
        `La placa ${datos.placa} no existe en el maestro de vehículos`,
        409
      );
    }

    const unidad = await insertarUnidad({
      programa_id: programaId,
      ...datos
    });

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Incorporó la unidad ${datos.placa} al programa ${programaId}`,
      'programa_mantenimiento_unidades',
      req,
      null,
      unidad
    );

    return res
      .status(201)
      .json(unidad);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al incorporar la unidad al programa'
  }
);

export const editarUnidad = manejar(
  async (req, res) => {
    const programaId =
      await programaDe(req);

    const anterior = await unidadDe(
      programaId,
      req
    );

    const {
      campos,
      data
    } = prepararActualizacionUnidad(
      req.body
    );

    const unidad = await actualizarUnidad(
      programaId,
      anterior.id,
      campos,
      data
    );

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Editó la unidad ${anterior.placa} del programa ${programaId}`,
      'programa_mantenimiento_unidades',
      req,
      anterior,
      unidad
    );

    return res.json(unidad);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al editar la unidad del programa'
  }
);
