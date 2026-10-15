import { validarChecklistAlCerrar } from './checklist.js';
import { pool } from '../../../../config/database.js';

import {
  subirEvidenciaAutenticada,
  urlFirmadaEvidencia,
  destruirEvidenciaAutenticada
} from '../../../../services/cloudinaryService.js';

import {
  LIMITE_EVIDENCIA_TI_BYTES
} from '../../../../middlewares/upload.js';

import {
  obtenerProgramacionParaApertura,
  contarEquiposPrevistos,
  contarOrdenesActivas,
  insertarOrden,
  materializarDetalles,
  obtenerOrdenes,
  obtenerOrdenPorId,
  obtenerDetallesDeOrdenes,
  existeVisitaEnPrograma,
  obtenerOrdenParaEscritura,
  obtenerDetalleDeOrden,
  actualizarOrden,
  actualizarDetalle,
  asignarTecnicoAlCerrar,
  obtenerDetalleParaEvidencia,
  bloquearDetalleParaEvidencia,
  contarEvidenciasActivas,
  insertarEvidencia,
  obtenerEvidenciasActivasDeOrden,
  obtenerEvidenciaDeOrden,
  obtenerEvidenciaParaRetiro,
  retirarEvidencia,
  obtenerDetallesParaValidarCierre,
  cerrarOrden,
  anularOrden,
  obtenerResultadoDeVisita
} from './repository.js';

import {
  prepararApertura,
  prepararActualizacionCabecera,
  prepararActualizacionDetalle,
  validarEnlaceVideoDelEquipo,
  prepararCierre,
  prepararAnulacion,
  bloqueosDeApertura,
  resolverResultado,
  exigirOrdenAbierta,
  exigirAnulable,
  yaEstaAnulada,
  presentarOrden,
  exigirVisita,
  resolverTecnicoDelCierre,
  exigirPuedeSubirEvidencia,
  exigirFamiliaConEvidencia,
  exigirHuecoParaEvidencia,
  exigirPuedeRetirarEvidencia,
  validarArchivoEvidencia,
  prepararRetiroEvidencia,
  validarEvidenciasParaCierre,
  errorDeEvidenciasIncompletas,
  presentarEvidencia,
  exigeEvidenciaFotografica,
  ESTADOS_QUE_EXIGEN_FOTO,
  ESTADOS_QUE_EXIGEN_OBSERVACIONES,
  MAXIMO_EVIDENCIAS_ACTIVAS,
  CODIGOS_EVIDENCIA,
  ORIGEN_TECNICO,
  CODIGOS_TECNICO,
  MENSAJES,
  ESTADOS,
  ESTADOS_DETALLE,
  minimoEvidenciasParaDetalle
} from './service.js';

import {
  existePrograma,
  esTecnicoTiElegible
} from '../../repository.js';

import {
  normalizarId,
  noEncontrado,
  manejar,
  ValidationError
} from '../../comun.js';

import {
  logAction
} from '../../../../services/auditService.js';

// La base es la autoridad. Aquí solo se traduce su rechazo, y nunca se devuelve el mensaje
// del driver. Los patrones corresponden a los RAISE EXCEPTION de 20260925_013 y 014, cuyos
// textos se midieron uno por uno en la etapa 4.0.
// Los textos salen de MENSAJES, en el service: una sola redaccion por regla, venga el
// rechazo de la comprobacion previa o del trigger de la base.
const ERRORES = {
  mensajes: {
    uq_ot_programacion_activa: {
      status: 409,
      error: MENSAJES.activa
    },
    fk_ot_tecnico: {
      status: 409,
      error: MENSAJES.tecnicoInexistente
    }
  },
  reglasDeNegocio: [
    {
      patron: /esta PROYECTADO/,
      status: 409,
      code: 'VISITA_PROYECTADA',
      error: MENSAJES.proyectada
    },
    {
      patron: /esta CANCELADA: no admite abrir/,
      status: 409,
      code: 'VISITA_CANCELADA',
      error: MENSAJES.cancelada
    },
    {
      patron: /solo PROGRAMADO o REPROGRAMADO admiten/,
      status: 409,
      code: 'ESTADO_NO_ADMITE_OT',
      error: MENSAJES.estadoNoAdmite
    },
    {
      patron: /Una OT nace ABIERTA/,
      status: 409,
      code: 'ESTADO_INICIAL_OT',
      error: MENSAJES.nace
    },
    {
      patron: /alcance de la visita esta congelado/,
      status: 409,
      code: 'ALCANCE_CONGELADO',
      error: MENSAJES.alcanceCongelado
    },
    // Las siete excepciones de cerrar_orden_trabajo(), inventariadas una por una desde
    // pg_proc antes de escribir esto. Todas llegan como P0001: la funcion no usa ERRCODE,
    // asi que el patron es su texto. Nada de coincidencias vagas.
    {
      patron: /no se puede cerrar de nuevo/,
      status: 409,
      code: 'OT_YA_CERRADA',
      error: MENSAJES.cierreYaCerrada
    },
    {
      patron: /no tiene quincena_efectiva/,
      status: 409,
      code: 'VISITA_SIN_FASE',
      error: MENSAJES.cierreSinQuincena
    },
    {
      patron: /es futura respecto a la fecha de negocio/,
      status: 409,
      code: 'FECHA_FUTURA',
      error: MENSAJES.cierreFechaFutura
    },
    {
      patron: /no prevee ningun equipo/,
      status: 409,
      code: 'VISITA_VACIA',
      error: MENSAJES.cierreVisitaVacia
    },
    {
      patron: /No se puede cerrar una visita incompleta/,
      status: 409,
      code: 'VISITA_INCOMPLETA',
      error: MENSAJES.cierreVisitaIncompleta
    },
    {
      patron: /exige fecha_ejecucion/,
      status: 409,
      code: 'CIERRE_EXIGE_FECHA',
      error: MENSAJES.cierreExigeFecha
    },
    {
      patron: /^La OT \d+ no existe/,
      status: 404,
      code: 'OT_INEXISTENTE',
      error: MENSAJES.cierreOtInexistente
    }
  ]
};

const NO_ENCONTRADA_VISITA =
  'Programación no encontrada en este programa';

const NO_ENCONTRADA_ORDEN =
  'Orden de trabajo no encontrada en esta programación';

// Mismo orden de comprobación en los tres handlers: programa, luego visita, luego OT. Así
// un id de otro programa nunca llega a tocar la OT.
const idsDe = async req => {
  const programaId = normalizarId(
    'programaId',
    req.params.programaId
  );

  const programacionId = normalizarId(
    'programacionId',
    req.params.programacionId
  );

  if (
    !await existePrograma(programaId)
  ) {
    throw noEncontrado(
      'Programa de mantenimiento no encontrado'
    );
  }

  return { programaId, programacionId };
};

// ------------------------------------------------------------------------------------
// POST · abrir
// ------------------------------------------------------------------------------------
// Una sola transacción, y el orden importa:
//
//   BEGIN
//   1. leer y BLOQUEAR la visita            FOR UPDATE OF p
//   2. validar pertenencia y estado
//   3. comprobar alcance previsto y OT activa
//   4. INSERT de la cabecera
//   5. INSERT ... SELECT de todos los detalles      una sentencia
//   6. releer la OT ya completa
//   7. logAction con el MISMO client
//   COMMIT        · ROLLBACK ante cualquier error
//
// El cerrojo del paso 1 se toma ANTES de decidir, no después: es lo que serializa la
// apertura contra una reprogramación, una cancelación o una promoción concurrentes.
//
// logAction va con { client }: desde la etapa 3.2 eso hace que el INSERT de auditoría entre
// en esta transacción y que su fallo la revierta entera. Nunca pool.query aquí.
export const abrirOrden = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const { tecnico_id } = prepararApertura(req.body);

    // abierta_por_id NO viene del cuerpo: sale del usuario autenticado que fija
    // authenticateRequest en app.js antes de este router (middlewares/auth.js establece
    // req.user con el id leído de la tabla usuarios). La ruta está cubierta por la regla
    // /^\/api\/programas-mantenimiento(?:\/|$)/ de security.js, así que no hay forma de
    // llegar aquí sin sesión; aun así se comprueba, porque la columna es NOT NULL.
    const abiertaPorId = req.user?.id ?? null;

    if (!abiertaPorId) {
      throw new ValidationError(
        'No se pudo determinar el usuario que abre la orden de trabajo',
        401
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const visita = exigirVisita(
        await obtenerProgramacionParaApertura(
          programaId,
          programacionId,
          client
        )
      );

      const previstos = await contarEquiposPrevistos(
        programacionId,
        client
      );

      const activas = await contarOrdenesActivas(
        programacionId,
        client
      );

      const permiso = bloqueosDeApertura(
        visita,
        { activas, previstos }
      );

      if (!permiso.puede_abrir) {
        throw new ValidationError(
          permiso.motivo_abrir,
          409
        );
      }

      const otId = await insertarOrden(
        programacionId,
        tecnico_id,
        abiertaPorId,
        client
      );

      const materializados = await materializarDetalles(
        otId,
        programacionId,
        client
      );

      // Si el alcance previsto y los detalles no coinciden, la OT no podría cerrarse
      // nunca. Se comprueba aquí, dentro de la transacción, para revertir en el sitio.
      if (materializados !== previstos) {
        throw new Error(
          `Se materializaron ${materializados} detalles para ${previstos} equipos `
          + 'previstos'
        );
      }

      const orden = await obtenerOrdenPorId(
        programaId,
        programacionId,
        otId,
        client
      );

      const detalles = (
        await obtenerDetallesDeOrdenes([otId], client)
      ).get(otId);

      await logAction(
        abiertaPorId,
        `Abrió la orden de trabajo ${otId} de la visita ${programacionId} `
        + `(${visita.placa}, quincena ${visita.quincena_efectiva}) con `
        + `${materializados} equipo(s) previsto(s)`,
        'ordenes_trabajo',
        req,
        null,
        orden,
        { client }
      );

      await client.query('COMMIT');

      return res
        .status(201)
        .json(
          presentarOrden(orden, detalles)
        );
    } catch (error) {
      await client.query('ROLLBACK');

      throw error;
    } finally {
      client.release();
    }
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al abrir la orden de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// PATCH · esqueleto transaccional comun a las dos ediciones (etapa 4.2)
// ------------------------------------------------------------------------------------
// Los dos PATCH hacen lo mismo alrededor de su escritura, y escribirlo dos veces seria
// duplicar justo la parte delicada: el cerrojo, su orden y el ROLLBACK.
//
//   BEGIN
//   1. leer y BLOQUEAR la CABECERA           FOR UPDATE OF o
//   2. 404 si no existe en ese programa y esa visita
//   3. 409 si no esta ABIERTA
//   4. el trabajo propio de cada endpoint    -> devuelve si hubo escritura y su accion
//   5. releer la OT y sus detalles
//   6. logAction con el MISMO client, SOLO si hubo escritura real
//   COMMIT        · ROLLBACK ante cualquier error
//
// El cerrojo se toma SIEMPRE primero y SIEMPRE sobre la cabecera, el mismo orden que usa
// cerrar_orden_trabajo(). Nunca se bloquea el detalle antes que su cabecera.
const editandoLaOrden = async (
  req,
  trabajo,
  { cortocircuito, exigir = exigirOrdenAbierta } = {}
) => {
  const {
    programaId,
    programacionId
  } = await idsDe(req);

  const otId = normalizarId(
    'otId',
    req.params.otId
  );

  const usuarioId = req.user?.id ?? null;

  if (!usuarioId) {
    throw new ValidationError(
      'No se pudo determinar el usuario que edita la orden de trabajo',
      401
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orden = await obtenerOrdenParaEscritura(
      programaId,
      programacionId,
      otId,
      client
    );

    if (!orden) {
      throw noEncontrado(NO_ENCONTRADA_ORDEN);
    }

    // La anulacion repetida sale por aqui: se responde con la orden tal como esta, sin
    // tocar la base. Es el unico caso en que el estado no ABIERTA no es un conflicto.
    if (cortocircuito) {
      const atajo = await cortocircuito({ orden, otId, client });

      if (atajo) {
        const detallesAtajo = (
          await obtenerDetallesDeOrdenes([otId], client)
        ).get(otId);

        await client.query('COMMIT');

        return {
          cuerpo: {
            ...presentarOrden(orden, detallesAtajo),
            ...atajo
          },
          escribio: false
        };
      }
    }

    exigir(orden);

    const resultado = await trabajo({
      client,
      orden,
      otId,
      programaId,
      programacionId
    });

    const actualizada = await obtenerOrdenPorId(
      programaId,
      programacionId,
      otId,
      client
    );

    const detalles = (
      await obtenerDetallesDeOrdenes([otId], client)
    ).get(otId);

    // Sin escritura real no hay nada que auditar: una peticion idempotente no deja rastro.
    if (resultado.escribio) {
      await logAction(
        usuarioId,
        resultado.accion,
        resultado.tabla,
        req,
        resultado.antes,
        resultado.despues ?? actualizada,
        { client }
      );
    }

    await client.query('COMMIT');

    return {
      cuerpo: {
        ...presentarOrden(actualizada, detalles),
        ...(resultado.extra ?? {})
      },
      escribio: resultado.escribio
    };
  } catch (error) {
    await client.query('ROLLBACK');

    throw error;
  } finally {
    client.release();
  }
};

// ------------------------------------------------------------------------------------
// PATCH · cabecera
// ------------------------------------------------------------------------------------
// Idempotente: si todos los valores enviados ya son los almacenados no se emite ningun
// UPDATE, updated_at no se mueve y no se escribe auditoria. Es el mismo criterio que usan
// programar y cancelar en la etapa 3.1.
//
// evidencias se compara en PostgreSQL con el operador de jsonb, no con JSON.stringify: el
// orden de las claves no debe contar como un cambio.
export const editarOrden = manejar(
  async (req, res) => {
    const {
      campos,
      data
    } = prepararActualizacionCabecera(req.body);

    const { cuerpo } = await editandoLaOrden(req, async ({
      client,
      orden,
      otId,
      programaId,
      programacionId
    }) => {
      const igualEnLaBase = async campo => {

        return orden[campo] === data[campo];
      };

      const distintos = [];

      for (const campo of campos) {
        if (!await igualEnLaBase(campo)) {
          distintos.push(campo);
        }
      }

      if (distintos.length === 0) {
        return { escribio: false };
      }

      const filas = await actualizarOrden(
        otId,
        distintos,
        data,
        client
      );

      if (filas !== 1) {
        // La guarda del WHERE no dejo pasar la fila. Se RELEE el estado actual para decir
        // por que: informar con el estado leido al tomar el cerrojo daria el mensaje
        // absurdo de que una OT ABIERTA es inmutable.
        throw new ValidationError(
          MENSAJES.noAbierta(
            (await obtenerOrdenPorId(
              programaId,
              programacionId,
              otId,
              client
            ))?.estado ?? orden.estado
          ),
          409
        );
      }

      return {
        escribio: true,
        tabla: 'ordenes_trabajo',
        antes: orden,
        accion: `Edito la orden de trabajo ${otId} de ${orden.placa}: `
          + distintos.join(', ')
      };
    });

    return res.json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al editar la orden de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// PATCH · resultado de un equipo
// ------------------------------------------------------------------------------------
// La coherencia se valida sobre el resultado FUSIONADO con lo almacenado, no sobre las
// claves presentes: lo resuelve resolverResultado en el service, que es la unica
// definicion de esas reglas.
export const editarDetalle = manejar(
  async (req, res) => {
    const {
      campos,
      data
    } = prepararActualizacionDetalle(req.body);

    const detalleId = normalizarId(
      'detalleId',
      req.params.detalleId
    );

    const { cuerpo } = await editandoLaOrden(req, async ({
      client,
      orden,
      otId,
      programaId,
      programacionId
    }) => {
      const detalle = await obtenerDetalleDeOrden(
        otId,
        detalleId,
        client
      );

      if (!detalle) {
        throw noEncontrado(MENSAJES.detalleNoEncontrado);
      }

      validarEnlaceVideoDelEquipo(detalle, campos);

      // Primero la coherencia: si la combinacion final es invalida no se escribe nada, y
      // en particular un PARCIAL sobre GPS o ADAS no llega nunca a los ciclos.
      const resultado = resolverResultado(
        detalle,
        campos,
        data
      );

      const porEscribir = {
        ...data,
        estado: resultado.estado,
        nivel_completado: resultado.nivel_completado
      };

      const igualEnLaBase = async campo => {

        return detalle[campo] === porEscribir[campo];
      };

      const distintos = [];

      for (const campo of campos) {
        if (!await igualEnLaBase(campo)) {
          distintos.push(campo);
        }
      }

      if (distintos.length === 0) {
        return { escribio: false };
      }

      const filas = await actualizarDetalle(
        detalleId,
        distintos,
        porEscribir,
        client
      );

      if (filas !== 1) {
        // La guarda del WHERE no dejo pasar la fila. Se RELEE el estado actual para decir
        // por que: informar con el estado leido al tomar el cerrojo daria el mensaje
        // absurdo de que una OT ABIERTA es inmutable.
        throw new ValidationError(
          MENSAJES.noAbierta(
            (await obtenerOrdenPorId(
              programaId,
              programacionId,
              otId,
              client
            ))?.estado ?? orden.estado
          ),
          409
        );
      }

      const despues = await obtenerDetalleDeOrden(
        otId,
        detalleId,
        client
      );

      return {
        escribio: true,
        tabla: 'ordenes_trabajo_detalle',
        antes: detalle,
        despues,
        accion: `Registro el resultado de ${detalle.tipo_equipo} (previsto `
          + `${detalle.nivel_programado}) en la orden de trabajo ${otId}: `
          + resultado.estado
          + (resultado.nivel_completado
            ? ' ' + resultado.nivel_completado
            : '')
      };
    });

    return res.json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al editar el resultado del equipo'
  }
);

// ------------------------------------------------------------------------------------
// POST · cerrar
// ------------------------------------------------------------------------------------
// El cierre LO HACE LA BASE. cerrar_orden_trabajo() fija la fecha fisica en la visita,
// propaga los ciclos con la jerarquia acumulativa, deriva el resultado y cierra la OT, todo
// en una sentencia. Aqui solo se la invoca con el MISMO client de la transaccion y se
// traducen sus excepciones.
//
// No se adivina el resultado antes de llamarla, ni se decide aqui si fecha_ejecucion es
// obligatoria: eso depende del resultado derivado, que solo se conoce dentro. La API valida
// el FORMATO de la fecha -eso si es del payload, 400- y deja el resto a la funcion.
//
// Tampoco se escribe un solo ciclo desde JavaScript, ni se toca el estado de la visita.
export const cerrarOrdenTrabajo = manejar(
  async (req, res) => {
    const {
      fecha_ejecucion,
      minutos,
      observaciones,
      tecnico_id
    } = prepararCierre(req.body);

    const { cuerpo } = await editandoLaOrden(req, async ({
      client,
      orden,
      otId,
      programacionId
    }) => {
      const visitaAntes = await obtenerResultadoDeVisita(
        programacionId,
        client
      );

      // ------------------------------------------------------------------ F5.2
      // EL SUSTENTO DEL CIERRE. Se valida ANTES de resolver el tecnico y antes de invocar
      // cerrar_orden_trabajo(), dentro de la misma transaccion y con la cabecera ya
      // bloqueada: si falta algo, el ROLLBACK deja la orden exactamente como estaba.
      //
      // LA FUENTE DE VERDAD ES LA BASE, no el cliente: el recuento de evidencias ACTIVAS y
      // las observaciones se leen de ordenes_trabajo_evidencias y ordenes_trabajo_detalle.
      // Por eso esto NO se puede saltar llamando al endpoint de cierre directamente.
      //
      // Se informan TODOS los incumplimientos juntos. Decir solo el primero obligaria al
      // tecnico a un viaje por apartado para un unico problema.
      const detallesParaValidar = await obtenerDetallesParaValidarCierre(
        otId,
        client
      );

      const incumplimientos = validarEvidenciasParaCierre(
        detallesParaValidar
      );

      if (incumplimientos.length > 0) {
        throw errorDeEvidenciasIncompletas(incumplimientos);
      }

      await validarChecklistAlCerrar(otId, client);

      // ------------------------------------------------------------------ F5.1
      // EL TECNICO SE RESUELVE AQUI Y SOLO AQUI, con la cabecera ya bloqueada por
      // editandoLaOrden y dentro de la misma transaccion que el cierre. Si algo falla,
      // el ROLLBACK se lleva la asignacion y el cierre juntos.
      //
      // La decision es del BACKEND: resolverTecnicoDelCierre() es pura y aplica los tres
      // casos; la elegibilidad real se comprueba contra la base, porque lo que mande el
      // cliente no es prueba de nada.
      const resuelto = resolverTecnicoDelCierre({
        orden,
        usuario: req.user,
        tecnicoSolicitado: tecnico_id
      });

      if (resuelto.validar) {
        const elegible = await esTecnicoTiElegible(
          resuelto.tecnico_id,
          client
        );

        if (!elegible) {
          // Dos motivos distintos para el mismo hecho, y el mensaje tiene que distinguirlos:
          // si el tecnico sale del propio usuario TI, el problema es su vinculo; si lo
          // selecciono un usuario no-TI, el problema es su seleccion.
          throw resuelto.origen === ORIGEN_TECNICO.AUTOMATICO_TI
            ? new ValidationError(
              MENSAJES.tiSinPersona,
              409,
              CODIGOS_TECNICO.TI_SIN_PERSONA
            )
            : new ValidationError(
              MENSAJES.tecnicoNoElegible(resuelto.tecnico_id),
              409,
              CODIGOS_TECNICO.NO_ELEGIBLE
            );
        }
      }

      if (resuelto.escribir) {
        const asignado = await asignarTecnicoAlCerrar(
          otId,
          resuelto.tecnico_id,
          client
        );

        if (!asignado) {
          throw new ValidationError(
            'No se pudo asignar el técnico a la orden: su estado cambió durante el '
            + 'cierre. No se cerró nada.',
            409
          );
        }
      }

      const cierre = await cerrarOrden(
        otId,
        req.user.id,
        fecha_ejecucion,
        minutos,
        observaciones,
        client
      );

      const visitaDespues = await obtenerResultadoDeVisita(
        programacionId,
        client
      );

      return {
        escribio: true,
        tabla: 'ordenes_trabajo',
        antes: { orden, visita: visitaAntes },
        despues: { visita: visitaDespues, cierre },
        accion: `Cerro la orden de trabajo ${otId} de ${orden.placa}: la visita queda `
          + `${cierre.estado_programacion} en la quincena ${orden.quincena_efectiva}, `
          + `dia fisico ${visitaDespues.fecha_ejecucion ?? 'sin fecha'}, `
          + `${cierre.ciclos_afectados} ciclo(s) afectado(s). `
          + `Tecnico ${resuelto.tecnico_id} (${resuelto.origen})`,
        extra: {
          estado_programacion: cierre.estado_programacion,
          ciclos_afectados: cierre.ciclos_afectados,
          visita_resultado: visitaDespues,

          // F5.1 · de donde salio el tecnico, para que el cliente pueda explicarlo y para
          // que quede en la auditoria. `solicitud_ignorada` marca el caso en que el cliente
          // mando un tecnico que la regla descarto.
          tecnico: {
            id: resuelto.tecnico_id,
            origen: resuelto.origen,
            solicitud_ignorada: resuelto.solicitud_ignorada
          }
        }
      };
    });

    return res.json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al cerrar la orden de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// PATCH · anular
// ------------------------------------------------------------------------------------
// Anular no borra nada: la fila permanece con su motivo, su tecnico, sus observaciones, sus
// evidencias y todos sus detalles. No mueve ciclos y no escribe resultado en la visita, y
// eso es justo lo que vuelve a habilitar reprogramar y cancelar, porque
// congelar_visita_con_ot cuenta solo las OT NO anuladas.
//
// Repetir la anulacion es idempotente: se responde 200 con la orden tal como esta, sin
// UPDATE, sin mover updated_at y sin auditoria. Es el mismo criterio que cancelar en la
// etapa 3.1, y encaja con el modelo: impedir_modificar_ot_cerrada prohibiria el UPDATE de
// una OT ya ANULADA, asi que cortocircuitar no es una comodidad, es la unica via correcta.
export const anularOrdenTrabajo = manejar(
  async (req, res) => {
    const { motivo_anulacion } = prepararAnulacion(req.body);

    const { cuerpo } = await editandoLaOrden(
      req,
      async ({ client, orden, otId, programaId, programacionId }) => {
        const filas = await anularOrden(
          otId,
          motivo_anulacion,
          req.user.id,
          client
        );

        if (filas !== 1) {
          throw new ValidationError(
            MENSAJES.anularNoAbierta(
              (await obtenerOrdenPorId(
                programaId,
                programacionId,
                otId,
                client
              ))?.estado ?? orden.estado
            ),
            409
          );
        }

        return {
          escribio: true,
          tabla: 'ordenes_trabajo',
          antes: orden,
          accion: `Anulo la orden de trabajo ${otId} de ${orden.placa}: `
            + motivo_anulacion
        };
      },
      {
        exigir: exigirAnulable,
        cortocircuito: ({ orden }) => (
          yaEstaAnulada(orden)
            ? { ya_estaba_anulada: true }
            : null
        )
      }
    );

    return res.json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al anular la orden de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// GET · listado
// ------------------------------------------------------------------------------------
// Histórico completo: las anuladas y la activa, si existe. Sin transacción: son lecturas,
// y el patrón del módulo no las envuelve.
//
// Número de consultas CONSTANTE: una para la visita, una para las cabeceras y una para los
// detalles de todas ellas. No crece con el número de OT.
export const listarOrdenes = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const ordenes = await obtenerOrdenes(
      programaId,
      programacionId
    );

    // Con cero OT hay que distinguir la visita que no existe de la que no tiene ninguna:
    // la primera es 404 y la segunda un listado vacío. Solo se consulta en ese caso, así
    // que el número de consultas sigue siendo el mismo en las dos ramas.
    if (ordenes.length === 0) {
      const existe = await existeVisitaEnPrograma(
        programaId,
        programacionId
      );

      if (!existe) {
        throw noEncontrado(NO_ENCONTRADA_VISITA);
      }
    }

    const detalles = await obtenerDetallesDeOrdenes(
      ordenes.map(o => o.id)
    );

    return res.json({
      programa_id: programaId,
      programacion_id: programacionId,
      total: ordenes.length,
      activas: ordenes.filter(
        o => o.estado !== 'ANULADA'
      ).length,
      estados: ESTADOS,
      estados_detalle: ESTADOS_DETALLE,
      ordenes_trabajo: ordenes.map(
        orden => presentarOrden(
          orden,
          detalles.get(orden.id)
        )
      )
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar las órdenes de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// GET · detalle
// ------------------------------------------------------------------------------------
export const obtenerOrden = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const otId = normalizarId(
      'otId',
      req.params.otId
    );

    const orden = await obtenerOrdenPorId(
      programaId,
      programacionId,
      otId
    );

    if (!orden) {
      throw noEncontrado(NO_ENCONTRADA_ORDEN);
    }

    const detalles = (
      await obtenerDetallesDeOrdenes([orden.id])
    ).get(orden.id);

    return res.json(
      presentarOrden(orden, detalles)
    );
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al obtener la orden de trabajo'
  }
);

// =====================================================================================
// EVIDENCIA FOTOGRAFICA · F5.2
// =====================================================================================
// Cuatro endpoints, todos colgando de la orden porque la evidencia pertenece a su apartado.
// La transaccion, el cerrojo de la cabecera y la auditoria los presta editandoLaOrden, que
// ya existe: no hay una segunda arquitectura.
//
// LO QUE NUNCA SALE DE AQUI: el cloudinary_public_id, la URL firmada y el API_SECRET. El
// cliente recibe una ruta INTERNA del ERP -/evidencias/:id/imagen- y la imagen la sirve
// este backend.

// La ruta interna que el cliente usara para pedir cada imagen. Se construye desde los ids
// de la propia peticion para que no haya que repetir el prefijo en el cliente.
const rutaDeEvidencias = (
  programaId,
  programacionId,
  otId
) => `/api/programas-mantenimiento/${programaId}/programacion/${programacionId}`
  + `/ordenes-trabajo/${otId}/evidencias`;

// Los anchos de miniatura ADMITIDOS. Es una lista blanca a proposito: aceptar cualquier
// ancho convertiria este endpoint en un proxy de transformaciones de Cloudinary, donde
// cualquiera podria generar derivados a voluntad y consumir la cuota de la cuenta.
const ANCHOS_MINIATURA = [160, 240, 480, 960];

const MIME_POR_FORMATO = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

// ------------------------------------------------------------------------------------
// POST · subir una evidencia a un apartado
// ------------------------------------------------------------------------------------
// TRES FASES, Y LA FRONTERA ENTRE ELLAS ES LA REGLA:
//
//   FASE 1 · PREVALIDACION, SIN NINGUNA TRANSACCION ABIERTA
//     1. rol TI y orden ABIERTA         (lectura suelta de la cabecera)
//     2. el detalle es de ESA orden     -si no, 404-
//     3. la familia admite fotografia   (GPS y ADAS no)
//     4. el apartado tiene hueco        (menos de 4 ACTIVAS)
//     5. el archivo es una imagen       por MAGIC BYTES, no por mimetype
//
//   FASE 2 · SUBIDA A CLOUDINARY, todavia sin transaccion ni cerrojos
//
//   FASE 3 · TRANSACCION CORTA, solo base de datos
//     BEGIN
//     6. bloquear la CABECERA           FOR UPDATE OF o
//     7. revalidar que sigue ABIERTA
//     8. bloquear el DETALLE            FOR UPDATE OF d
//     9. revalidar pertenencia, familia y el tope de 4 ACTIVAS
//    10. INSERT
//     COMMIT
//
// La fase 1 no decide nada: es un filtro para no gastar una subida en una peticion que ya
// se sabe mala. Lo que DECIDE es la fase 3, con las filas bloqueadas. Las reglas se
// comprueban dos veces a proposito; la segunda es la que vale.
//
// Ninguna transaccion esta abierta durante la llamada de red. Antes si lo estaba, y el
// cerrojo de la cabecera se mantenia mientras Cloudinary respondia.
//
// EL CERROJO DE LA CABECERA VA PRIMERO, como en cerrar_orden_trabajo(): una carga y un
// cierre concurrentes se serializan en vez de bloquearse mutuamente. Nunca se bloquea el
// detalle antes que su cabecera.
//
// EL PRECIO DE NO TENER LA TRANSACCION ABIERTA es que el asset puede existir cuando la
// escritura ya no es posible -la orden se cerro, el apartado se lleno, el INSERT o el
// COMMIT fallaron-. Ese precio se paga con la COMPENSACION que envuelve la fase 3 entera.
export const subirEvidencia = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const otId = normalizarId(
      'otId',
      req.params.otId
    );

    const detalleId = normalizarId(
      'detalleId',
      req.params.detalleId
    );

    // ----------------------------------------------------------------- FASE 1
    const ordenPrevia = await obtenerOrdenPorId(
      programaId,
      programacionId,
      otId
    );

    if (!ordenPrevia) {
      throw noEncontrado(NO_ENCONTRADA_ORDEN);
    }

    // Rol TI y orden ABIERTA. Se vuelve a exigir en la fase 3 con la fila bloqueada.
    exigirPuedeSubirEvidencia(ordenPrevia, req.user);

    const detallePrevio = await obtenerDetalleParaEvidencia(
      otId,
      detalleId
    );

    // No existe, o es de otra orden. Las dos cosas son el mismo 404 a proposito:
    // distinguirlas confirmaria la existencia de un detalle de otra OT.
    if (!detallePrevio) {
      throw noEncontrado(
        'Apartado no encontrado en esta orden de trabajo'
      );
    }

    // La familia la decide el modelo, no el cliente. No puede cambiar: R2 de 016 congela el
    // equipo previsto, asi que esta comprobacion es definitiva ya en la fase 1.
    exigirFamiliaConEvidencia(detallePrevio);

    // Este recuento SI puede quedar obsoleto, y por eso se repite bajo cerrojo.
    exigirHuecoParaEvidencia(
      await contarEvidenciasActivas(detalleId),
      detallePrevio
    );

    // El contenido REAL del archivo. multer ya filtro por mimetype declarado y por tamano,
    // pero eso es falsificable: esto mira los primeros bytes.
    const { formato, bytes } = validarArchivoEvidencia(
      req.file,
      LIMITE_EVIDENCIA_TI_BYTES
    );

    // ----------------------------------------------------------------- FASE 2
    const subida = await subirEvidenciaAutenticada(
      req.file.buffer
    );

    // ----------------------------------------------------------------- FASE 3
    // A partir de aqui el asset YA existe en Cloudinary, que no comparte transaccion con
    // PostgreSQL. CUALQUIER fallo de aqui al COMMIT -incluido el COMMIT- obliga a
    // destruirlo: dejarlo seria un huerfano pagando almacenamiento y sin ninguna fila que
    // lo explique.
    //
    // Si el destroy tambien falla, se registra el public_id con un codigo propio y se
    // vuelve a lanzar el error ORIGINAL, que es el que de verdad hay que contar. No se
    // oculta el fallo parcial ni se sustituye por el del destroy.
    let cuerpo;

    try {
      ({ cuerpo } = await editandoLaOrden(req, async ({
        client,
        orden,
        otId: otIdBloqueada
      }) => {
        const detalle = await bloquearDetalleParaEvidencia(
          otIdBloqueada,
          detalleId,
          client
        );

        if (!detalle) {
          throw noEncontrado(
            'Apartado no encontrado en esta orden de trabajo'
          );
        }

        exigirFamiliaConEvidencia(detalle);

        // EL RECUENTO QUE DECIDE. Con la fila del detalle bloqueada, dos cargas simultaneas
        // se serializan: la primera inserta la cuarta y la segunda lee 4 y se rechaza, con
        // su asset ya subido y por tanto compensado.
        const activas = await contarEvidenciasActivas(
          detalleId,
          client
        );

        exigirHuecoParaEvidencia(activas, detalle);

        const evidenciaId = await insertarEvidencia(
          {
            ordenTrabajoId: otIdBloqueada,
            detalleId,
            publicId: subida.public_id,
            formato: subida.formato,
            bytes: subida.bytes,
            ancho: subida.ancho,
            alto: subida.alto,
            subidaPorId: req.user.id
          },
          client
        );

        return {
          escribio: true,
          tabla: 'ordenes_trabajo_evidencias',
          antes: {
            detalle_id: detalleId,
            tipo_equipo: detalle.tipo_equipo,
            evidencias_activas: activas
          },
          despues: {
            evidencia_id: evidenciaId,
            detalle_id: detalleId,
            tipo_equipo: detalle.tipo_equipo,
            evidencias_activas: activas + 1,
            formato: subida.formato,
            bytes: subida.bytes
          },
          accion: `Cargo evidencia fotografica ${evidenciaId} en el apartado `
            + `${detalle.tipo_equipo} de la orden de trabajo ${otIdBloqueada} `
            + `(${orden.placa}): ${subida.formato} ${subida.bytes} bytes `
            + `${subida.ancho}x${subida.alto}, `
            + `${activas + 1} de ${MAXIMO_EVIDENCIAS_ACTIVAS} activas`,
          extra: {
            evidencia: {
              id: evidenciaId,
              detalle_id: detalleId,
              tipo_equipo: detalle.tipo_equipo,
              formato: subida.formato,
              bytes: subida.bytes,
              ancho: subida.ancho,
              alto: subida.alto,
              imagen: `${rutaDeEvidencias(programaId, programacionId, otIdBloqueada)}`
                + `/${evidenciaId}/imagen`
            },
            evidencias_activas_del_apartado: activas + 1,
            maximo_por_apartado: MAXIMO_EVIDENCIAS_ACTIVAS,
            // formato y bytes medidos del buffer, para que el cliente pueda comprobar que
            // lo que subio es lo que se guardo.
            archivo_recibido: { formato, bytes }
          }
        };
      },
        {
          // LA REVALIDACION BAJO CERROJO del par rol + estado. Sustituye a exigirOrdenAbierta
          // -la guarda generica de editandoLaOrden- por la propia de la evidencia, que
          // responde lo mismo con un codigo que el cliente puede distinguir:
          // 403 SOLO_TI_SUBE_EVIDENCIA y 409 ORDEN_NO_ABIERTA. Es el mismo mecanismo que usa
          // el retiro, no uno nuevo.
          //
          // Aqui es donde se detecta que otra peticion cerro la orden mientras subiamos.
          exigir: orden => exigirPuedeSubirEvidencia(orden, req.user)
        }));
    } catch (error) {
      // editandoLaOrden ya hizo ROLLBACK -su propio catch- antes de relanzar. Aqui solo
      // queda lo que PostgreSQL no puede deshacer: el asset.
      const destruido = await destruirEvidenciaAutenticada(
        subida.public_id
      );

      if (!destruido) {
        console.error(
          '[TI_PR_01_EVIDENCIA_HUERFANA] el asset quedo en Cloudinary y su fila NO se '
          + `escribio. public_id=${subida.public_id} ot=${otId} detalle=${detalleId} `
          + `usuario=${req.user?.id ?? 'sin identificar'}. Hay que borrarlo a mano.`
        );
      }

      throw error;
    }

    return res.status(201).json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al cargar la evidencia fotográfica'
  }
);

// ------------------------------------------------------------------------------------
// GET · las evidencias ACTIVAS de una orden
// ------------------------------------------------------------------------------------
// Lo puede consultar cualquiera que pueda ver la orden: el modulo de permiso
// `mantenimiento` ya acota quien llega hasta aqui. Poder verlas no da ningun permiso de
// escritura, que se comprueba aparte en cada endpoint que escribe.
//
// Solo ACTIVAS. Una retirada no aparece en la galeria -es lo que el negocio pide- y su
// traza sigue en la fila para quien consulte la base o Power BI.
//
// Se devuelven AGRUPADAS por apartado y tambien en plano: la UI pinta por apartado y el
// listado plano sirve para contar sin recorrer el arbol.
export const listarEvidencias = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const otId = normalizarId('otId', req.params.otId);

    const orden = await obtenerOrdenPorId(
      programaId,
      programacionId,
      otId
    );

    if (!orden) {
      throw noEncontrado(NO_ENCONTRADA_ORDEN);
    }

    const base = rutaDeEvidencias(
      programaId,
      programacionId,
      otId
    );

    const filas = await obtenerEvidenciasActivasDeOrden(otId);

    const items = filas.map(
      fila => presentarEvidencia(fila, base)
    );

    // Un grupo por apartado de la orden, incluidos los que no tienen ninguna: el cliente
    // necesita saber que CAMARAS tiene 0 de 4, no que CAMARAS no esta.
    const detalles = await obtenerDetallesParaValidarCierre(otId);

    const porApartado = detalles.map(detalle => {
      const suyas = items.filter(
        i => i.detalle_id === detalle.id
      );

      const conFoto = exigeEvidenciaFotografica(detalle.tipo_equipo);

      return {
        detalle_id: detalle.id,
        tipo_equipo: detalle.tipo_equipo,
        estado: detalle.estado,
        nivel_programado: detalle.nivel_programado,
        minimo: minimoEvidenciasParaDetalle(detalle),
        admite_evidencia: conFoto,
        exige_evidencia:
          conFoto &&
          ESTADOS_QUE_EXIGEN_FOTO.includes(detalle.estado),
        exige_observaciones:
          ESTADOS_QUE_EXIGEN_OBSERVACIONES.includes(detalle.estado),
        activas: suyas.length,
        maximo: conFoto
          ? MAXIMO_EVIDENCIAS_ACTIVAS
          : 0,
        evidencias: suyas
      };
    });

    return res.json({
      orden_trabajo_id: otId,
      estado_orden: orden.estado,
      descripcion:
        'Solo evidencias ACTIVAS. Una evidencia retirada no aparece aquí y conserva su '
        + 'traza en la base. GPS y ADAS no admiten evidencia fotográfica en ningún caso: '
        + 'su apartado llega con admite_evidencia en false y máximo 0.',
      total: items.length,
      maximo_por_apartado: MAXIMO_EVIDENCIAS_ACTIVAS,
      apartados: porApartado,
      evidencias: items
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar las evidencias de la orden de trabajo'
  }
);

// ------------------------------------------------------------------------------------
// GET · la imagen, servida POR EL ERP
// ------------------------------------------------------------------------------------
// El frontend NO conoce Cloudinary. Pide esta ruta, el backend comprueba el acceso, firma
// la URL internamente, trae la imagen y la devuelve.
//
// POR QUE NO SE ENTREGA LA URL FIRMADA. Se midio contra la cuenta real: el add-on de URLs
// con caducidad no esta habilitado, asi que una firma no expira. Una URL firmada entregada
// al navegador seria reutilizable indefinidamente por cualquiera que la copiara. Pasando
// por aqui, el acceso se vuelve a comprobar en cada peticion.
//
// No hay endpoint de descarga ni se ofrece uno. Y conviene no prometer mas de lo que esto
// hace: una imagen visible en un navegador siempre se puede capturar o guardar; lo que se
// consigue es que el acceso quede dentro del ERP y no haya un enlace suelto reutilizable.
export const obtenerImagenEvidencia = manejar(
  async (req, res) => {
    const {
      programaId,
      programacionId
    } = await idsDe(req);

    const otId = normalizarId('otId', req.params.otId);

    const evidenciaId = normalizarId(
      'evidenciaId',
      req.params.evidenciaId
    );

    // La pertenencia a la orden, y la orden al programa y a la visita: las tres se
    // comprueban antes de tocar Cloudinary.
    const orden = await obtenerOrdenPorId(
      programaId,
      programacionId,
      otId
    );

    if (!orden) {
      throw noEncontrado(NO_ENCONTRADA_ORDEN);
    }

    const evidencia = await obtenerEvidenciaDeOrden(
      otId,
      evidenciaId
    );

    // Pedir la evidencia de otra orden da 404, no 403: confirmar que existe en otra parte
    // seria filtrar informacion.
    if (!evidencia) {
      throw noEncontrado(
        'Evidencia no encontrada en esta orden de trabajo'
      );
    }

    // La galeria normal solo muestra activas, y esta ruta la sirve. Una retirada conserva
    // su traza en la base pero deja de ser visible.
    if (evidencia.estado !== 'ACTIVA') {
      throw new ValidationError(
        'Esa evidencia está RETIRADA: conserva su traza en la base pero ya no se muestra.',
        409,
        CODIGOS_EVIDENCIA.YA_RETIRADA
      );
    }

    const anchoPedido = Number.parseInt(req.query.ancho, 10);

    const ancho = ANCHOS_MINIATURA.includes(anchoPedido)
      ? anchoPedido
      : null;

    const url = urlFirmadaEvidencia(
      evidencia.cloudinary_public_id,
      ancho
    );

    const respuesta = await fetch(url);

    if (!respuesta.ok) {
      // Un 404 aqui significa que la fila existe y el asset no: es una inconsistencia real
      // entre PostgreSQL y Cloudinary, y hay que decirlo, no devolver una imagen vacia.
      console.error(
        `[TI_PR_01_EVIDENCIA_SIN_ASSET] evidencia ${evidenciaId} de la OT ${otId} apunta a `
        + `${evidencia.cloudinary_public_id} y Cloudinary respondio ${respuesta.status}`
      );

      throw new ValidationError(
        'La imagen de esa evidencia no se pudo recuperar del almacenamiento.',
        502,
        'EVIDENCIA_SIN_ASSET'
      );
    }

    const contenido = Buffer.from(
      await respuesta.arrayBuffer()
    );

    // inline y no attachment: se muestra, no se descarga. Y sin cache compartida: la
    // imagen es de una orden concreta y su acceso se comprueba en cada peticion, asi que
    // no debe quedar en ningun proxy intermedio.
    res.setHeader(
      'Content-Type',
      respuesta.headers.get('content-type')
      ?? MIME_POR_FORMATO[evidencia.formato]
      ?? 'application/octet-stream'
    );
    res.setHeader('Content-Length', contenido.length);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.end(contenido);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al obtener la imagen de la evidencia'
  }
);

// ------------------------------------------------------------------------------------
// PATCH · retirar una evidencia
// ------------------------------------------------------------------------------------
// RETIRO LOGICO: estado RETIRADA con autor, fecha y motivo. Nunca DELETE, y NUNCA se
// destruye el asset de Cloudinary: la trazabilidad manda sobre el almacenamiento, y una
// evidencia retirada tiene que poder demostrar que existio.
//
// `exigir` se neutraliza a proposito: editandoLaOrden exige por defecto que la orden este
// ABIERTA, y aqui NO puede ser ese el criterio, porque retirar es justamente lo que sigue
// permitido con la orden CERRADA o ANULADA. El permiso real depende de los tres factores
// juntos -estado de la orden, rol de quien lo pide y cuantas activas quedan- y lo decide
// exigirPuedeRetirarEvidencia dentro de la transaccion, con las filas ya bloqueadas.
export const retirarEvidenciaDeOrden = manejar(
  async (req, res) => {
    const evidenciaId = normalizarId(
      'evidenciaId',
      req.params.evidenciaId
    );

    const { motivo } = prepararRetiroEvidencia(req.body);

    const { cuerpo } = await editandoLaOrden(
      req,
      async ({ client, orden, otId }) => {
        const evidencia = await obtenerEvidenciaParaRetiro(
          otId,
          evidenciaId,
          client
        );

        if (!evidencia) {
          throw noEncontrado(
            'Evidencia no encontrada en esta orden de trabajo'
          );
        }

        if (evidencia.estado !== 'ACTIVA') {
          throw new ValidationError(
            'Esa evidencia ya está RETIRADA: conserva el motivo y el autor del primer '
            + 'retiro, que no se reescriben.',
            409,
            CODIGOS_EVIDENCIA.YA_RETIRADA
          );
        }

        // El detalle se bloquea TAMBIEN, y despues de la cabecera: el recuento de activas
        // decide si esta es la ultima obligatoria, y sin ese cerrojo dos retiros
        // simultaneos podrian dejar el apartado a cero.
        const detalle = await bloquearDetalleParaEvidencia(
          otId,
          evidencia.detalle_id,
          client
        );

        if (!detalle) {
          throw noEncontrado(
            'Apartado no encontrado en esta orden de trabajo'
          );
        }

        const activas = await contarEvidenciasActivas(
          evidencia.detalle_id,
          client
        );

        const permiso = exigirPuedeRetirarEvidencia({
          orden,
          detalle,
          usuario: req.user,
          activas
        });

        const retirada = await retirarEvidencia(
          evidenciaId,
          motivo,
          req.user.id,
          client
        );

        if (!retirada) {
          throw new ValidationError(
            'La evidencia dejó de estar activa durante la operación: no se retiró nada.',
            409,
            CODIGOS_EVIDENCIA.YA_RETIRADA
          );
        }

        return {
          escribio: true,
          tabla: 'ordenes_trabajo_evidencias',
          antes: {
            evidencia_id: evidenciaId,
            detalle_id: evidencia.detalle_id,
            tipo_equipo: detalle.tipo_equipo,
            estado: 'ACTIVA',
            evidencias_activas: activas
          },
          despues: {
            evidencia_id: evidenciaId,
            detalle_id: evidencia.detalle_id,
            tipo_equipo: detalle.tipo_equipo,
            estado: 'RETIRADA',
            evidencias_activas: activas - 1,
            motivo_retiro: motivo
          },
          accion: `Retiro la evidencia ${evidenciaId} del apartado ${detalle.tipo_equipo} `
            + `de la orden de trabajo ${otId} (${orden.placa}), que estaba `
            + `${orden.estado}, por la regla ${permiso.regla}. Quedan ${activas - 1} `
            + `activa(s). Motivo: ${motivo}`,
          extra: {
            evidencia_retirada: {
              id: evidenciaId,
              detalle_id: evidencia.detalle_id,
              tipo_equipo: detalle.tipo_equipo,
              motivo_retiro: motivo,
              regla_aplicada: permiso.regla
            },
            evidencias_activas_del_apartado: activas - 1,
            descripcion:
              'La imagen NO se borra de Cloudinary ni la fila de la base: queda como '
              + 'RETIRADA, con quién la retiró, cuándo y por qué, y deja de contar como '
              + 'activa.'
          }
        };
      },
      {
        // Ver el comentario de arriba: el permiso depende del estado y se decide dentro.
        exigir: () => { }
      }
    );

    return res.json(cuerpo);
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al retirar la evidencia'
  }
);
