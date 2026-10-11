import {
  obtenerProgramas,
  obtenerProgramaPorId,
  obtenerVersionesDeProgramas,
  obtenerTecnicosTi,
  actualizarPrograma,
  actualizarEstadoPrograma
} from './repository.js';

import {
  prepararActualizacionPrograma,
  prepararCambioEstado,
  marcarVigente,
  vigenteDe
} from './service.js';

import {
  normalizarId,
  noEncontrado,
  manejar,
  esUsuarioTi
} from './comun.js';

import {
  logAction
} from '../../services/auditService.js';

// Un solo mapa de traducción para todo el dominio. La taxonomía de códigos vive en
// comun.js; aquí solo el texto propio de programas.
const ERRORES = {
  mensajes: {
    uq_programas_mantenimiento_codigo: {
      status: 409,
      error: 'Ya existe un programa con ese código'
    }
  }
};

const NO_ENCONTRADO =
  'Programa de mantenimiento no encontrado';

const idDe = req => normalizarId(
  'El id del programa',
  req.params.id
);

const programaOFalla = async id => {
  const {
    fecha_negocio,
    programa
  } = await obtenerProgramaPorId(id);

  if (!programa) {
    throw noEncontrado(NO_ENCONTRADO);
  }

  return { fecha_negocio, programa };
};

export const listarProgramas = manejar(
  async (req, res) => {
    const estado = req.query.estado
      ? String(req.query.estado)
        .trim()
        .toUpperCase()
      : null;

    const {
      fecha_negocio: fecha,
      programas
    } = await obtenerProgramas({ estado });

    if (programas.length === 0) {
      return res.json({
        fecha_negocio: null,
        programas: []
      });
    }

    // Una consulta para las versiones de TODOS los programas del listado.
    const versiones =
      await obtenerVersionesDeProgramas(
        programas.map(p => p.id)
      );

    return res.json({
      fecha_negocio: fecha,
      programas: programas.map(
        programa => ({
          ...programa,
          version_vigente: vigenteDe(
            versiones.get(programa.id),
            fecha
          )
        })
      )
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar los programas de mantenimiento'
  }
);

export const obtenerPrograma = manejar(
  async (req, res) => {
    const id = idDe(req);

    const {
      fecha_negocio: fecha,
      programa
    } = await programaOFalla(id);

    const versiones = marcarVigente(
      (
        await obtenerVersionesDeProgramas(
          [id]
        )
      ).get(id),
      fecha
    );

    return res.json({
      fecha_negocio: fecha,
      ...programa,
      versiones,
      version_vigente:
        versiones.find(
          version =>
            version.vigente_en_fecha
        ) ?? null
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al obtener el programa de mantenimiento'
  }
);

// ------------------------------------------------------------------------------------
// GET · catalogo de tecnicos TI · F5.1
// ------------------------------------------------------------------------------------
// POR QUE VIVE AQUI Y NO EN /api/personal. El catalogo solo lo necesita el modal de cierre
// de una orden de trabajo, y quien puede cerrar una OT es exactamente quien tiene el modulo
// de permiso `mantenimiento`: hoy admin y ti, y NO supervisor -medido en ROLE_PERMISSIONS-.
// Montado en este router, /api/programas-mantenimiento, hereda esa misma regla de
// middlewares/security.js, asi que la audiencia del catalogo coincide exactamente con la de
// la accion que lo usa.
//
// Bajo /api/personal habria heredado el modulo `personal`, que es otra audiencia -y ademas
// GET /api/personal hace SELECT * sobre las 362 filas e incluye el DNI, que no tiene por que
// viajar a un selector de cierre-.
//
// No depende de ningun programa: es un catalogo del dominio, no de una fila. Por eso cuelga
// de la raiz del router y no de /:id.
//
// Solo lectura, sin auditoria: listar no es un hecho que auditar.
// EL BLOQUE `solicitante` ES LO QUE EVITA QUE EL CLIENTE DECIDA. El modal de cierre tiene
// tres presentaciones -autoasignacion, selector obligatorio, solo lectura- y cual aplica es
// una pregunta del backend, no un `rol === 'ti'` escrito en JavaScript. Aqui se contesta:
//
//   puede_autoasignarse true   -> el modal muestra `nombre` y NO pinta selector
//   puede_autoasignarse false  -> el modal pinta el selector con `tecnicos`
//
// El tercer caso -la OT ya tiene tecnico- no necesita este endpoint: lo resuelve la propia
// orden, que ya publica `tecnico.nombre`.
//
// `nombre` se busca en la lista ya traida en vez de con una consulta extra: si el solicitante
// es TI y elegible, esta en ella por el MISMO predicado. Si no esta, no es elegible, y eso
// es justo lo que hay que contestar.
export const listarTecnicosTi = manejar(
  async (req, res) => {
    const tecnicos = await obtenerTecnicosTi();

    const esTi = esUsuarioTi(req.user);

    const propia = Number.isInteger(req.user?.persona_id)
      ? req.user.persona_id
      : null;

    const mia = propia === null
      ? null
      : tecnicos.find(t => t.id === propia) ?? null;

    return res.json({
      descripcion:
        'Personas con una cuenta de TI activa, que son las únicas elegibles como técnico '
        + 'ejecutor de una orden de trabajo. El id es de personal, que es lo que '
        + 'ordenes_trabajo.tecnico_id referencia, no el id del usuario.',
      criterio:
        "usuarios.rol = 'ti' y usuario activo y usuarios.persona_id no nulo y "
        + "personal.estado = 'Activo'",
      total: tecnicos.length,
      tecnicos,
      solicitante: {
        es_ti: esTi,
        persona_id: propia,
        nombre: mia
          ? mia.nombre
          : null,
        puede_autoasignarse: esTi && mia !== null,
        motivo: !esTi
          ? 'Tu usuario no es de TI, así que el sistema no puede deducir quién ejecutó el '
            + 'mantenimiento: hay que seleccionar al técnico TI que lo realizó.'
          : mia === null
            ? 'Tu usuario es de TI pero no está vinculado a un registro de personal '
              + 'activo, así que no se puede asignar automáticamente.'
            : null
      }
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar los técnicos de TI'
  }
);

// ==========================================
// POST · BLOQUEADO, YA NO POR EL ESQUEMA
// ==========================================
// HISTORICO. Este endpoint se bloqueo porque crear un programa exigia escribir 7 columnas
// NOT NULL sin DEFAULT que los cleanup eliminaban del encabezado: periodo_inicio,
// periodo_fin, version y fecha_documento -20261001_901- y frecuencia_m1/m2/m3_dias
// -20261001_900-. Comprobado entonces en transaccion revertida:
//   INSERT (codigo, nombre, estado)  -> 23502 null value in column "periodo_inicio"
//   INSERT + las 7 columnas legacy   -> ACEPTADO
//
// ESO YA NO ES CIERTO. Medido el 2026-10-09 contra information_schema.columns en
// db-refactor: programas_mantenimiento conserva 6 columnas -id, codigo, nombre, estado,
// created_at, updated_at- y NINGUNA de las 7 condenadas existe. Los dos cleanup estan
// aplicados, aunque sus ficheros sigan en migrations/pending_cleanup/. El motivo de esquema
// desaparecio.
//
// LO QUE SIGUE JUSTIFICANDO EL 501 es la OTRA razon, que nunca fue tecnica: falta la
// decision de negocio sobre quien cierra la vigencia de la version anterior al publicar una
// nueva, y los datos documentales -periodo, version, fecha- viven ahora en
// programas_mantenimiento_versiones, que NO tiene ningun endpoint de escritura. Crear un
// programa sin poder crearle su primera version dejaria un programa sin periodo aplicable,
// y de ese periodo depende hoy el catalogo de destinos de reprogramacion.
//
// Por eso el estado y la respuesta publica NO se cambian aqui: reabrir el POST exige esa
// decision y un endpoint de versiones, no solo borrar un comentario. Queda señalado.
//
// La respuesta publica NO cita migraciones, columnas ni SQL -y nunca las cito-: el detalle
// queda en este comentario y en el log del servidor.
const CODIGO_BLOQUEO = 'TI_PR_01_SCHEMA_TRANSITION';

export const registrarPrograma = manejar(
  async (req, res) => {
    console.warn(
      `[${CODIGO_BLOQUEO}] POST /api/programas-mantenimiento rechazado: `
      + 'el alta por API sigue deshabilitada. El motivo de esquema ya no aplica -los '
      + 'cleanup 20261001_900 y 20261001_901 estan aplicados y las 7 columnas NOT NULL '
      + 'legacy no existen-; lo que falta es el endpoint de escritura de '
      + 'programas_mantenimiento_versiones y la decision de negocio sobre el cierre de '
      + 'vigencia de la version anterior. Ver comentario en modules/programas/controller.js.'
    );

    return res
      .status(501)
      .json({
        error:
          'Crear programas de mantenimiento no está disponible todavía',
        code: CODIGO_BLOQUEO,
        message:
          'El modelo de programas está en transición y la creación por API queda '
          + 'deshabilitada hasta que termine. La consulta, la edición del nombre y el '
          + 'cambio de estado funcionan con normalidad.',
        details: {
          disponible: [
            'GET /api/programas-mantenimiento',
            'GET /api/programas-mantenimiento/:id',
            'PUT /api/programas-mantenimiento/:id',
            'PATCH /api/programas-mantenimiento/:id/estado'
          ],
          alta_de_programas:
            'se realiza por carga controlada, no por API',
          reintentar: false
        }
      });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al procesar la creación del programa'
  }
);

export const editarPrograma = manejar(
  async (req, res) => {
    const id = idDe(req);

    const {
      programa: anterior
    } = await programaOFalla(id);

    const {
      campos,
      data
    } = prepararActualizacionPrograma(
      req.body
    );

    const programa =
      await actualizarPrograma(
        id,
        campos,
        data
      );

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Editó el programa de mantenimiento ${anterior.codigo}`,
      'programas_mantenimiento',
      req,
      anterior,
      programa
    );

    return res.json(programa);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al editar el programa de mantenimiento'
  }
);

export const cambiarEstadoPrograma = manejar(
  async (req, res) => {
    const id = idDe(req);

    const {
      programa: anterior
    } = await programaOFalla(id);

    const {
      estado
    } = prepararCambioEstado(req.body);

    const programa =
      await actualizarEstadoPrograma(
        id,
        estado
      );

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Cambió el estado del programa ${anterior.codigo} a ${estado}`,
      'programas_mantenimiento',
      req,
      anterior,
      programa
    );

    return res.json(programa);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al cambiar el estado del programa de mantenimiento'
  }
);
