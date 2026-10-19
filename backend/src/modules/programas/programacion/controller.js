import { aplicarAjuste, destinosConDesplazamiento } from './ajustes/service.js';
import {
  obtenerProgramacion,
  contarProgramacion,
  obtenerVisitaPorId,
  obtenerEquiposDeVisitas,
  programarVisita,
  cancelarVisita,
  obtenerVisitasParaLote,
  programarVisitasEnLote
} from './repository.js';

import {
  normalizarFiltros,
  prepararReprogramacion,
  prepararCancelacion,
  prepararLote,
  clasificarLote,
  bloqueos,
  ESTADOS,
  ESTADO_CANCELADO,
  ESTADO_PROGRAMADO
} from './service.js';

import { pool } from '../../../config/database.js';

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

// La base es la autoridad. Aquí solo se traduce su rechazo, y nunca se devuelve el mensaje
// del driver. Los patrones de reglasDeNegocio corresponden a los RAISE EXCEPTION de
// 20260925_013, 20260925_015 y 20260928_016, cuyos textos se midieron uno por uno.
const ERRORES = {
  mensajes: {
    uq_programacion_unidad_quincena_efectiva: {
      status: 409,
      error:
        'La programación cambió mientras se guardaba. Actualice la pantalla y vuelva a intentarlo.'
    },
    chk_programacion_quincena_reprogramada: {
      status: 400,
      error:
        'quincena_reprogramada debe caer el día 1 o el día 16'
    }
  },
  reglasDeNegocio: [
    {
      patron: /no admite cambiar su identidad original/,
      status: 409,
      code: 'IDENTIDAD_INMUTABLE',
      error:
        'La identidad original de la visita -unidad, programa y quincena programada- '
        + 'es inmutable'
    },
    {
      patron: /OT no anulada\(s\)/,
      status: 409,
      code: 'OT_NO_ANULADA',
      error:
        'La visita tiene una orden de trabajo no anulada: anúlala antes de reprogramar '
        + 'o cancelar'
    },
    {
      patron: /esta CANCELADA: es historica/,
      status: 409,
      code: 'CANCELADO_TERMINAL',
      error:
        'La visita está CANCELADA: es histórica y no vuelve a un estado activo'
    },
    {
      patron: /tiene una OT ABIERTA/,
      status: 409,
      code: 'OT_ABIERTA',
      error:
        'La visita tiene una orden de trabajo ABIERTA y no admite cambios'
    },
    {
      patron: /tiene una OT CERRADA/,
      status: 409,
      code: 'OT_CERRADA',
      error:
        'La visita tiene una orden de trabajo CERRADA: su resultado es histórico'
    }
  ]
};

const NO_ENCONTRADA =
  'Programación no encontrada en este programa';

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

const visitaDe = async (
  programaId,
  req
) => {
  const id = normalizarId(
    'id',
    req.params.id
  );

  const visita = await obtenerVisitaPorId(
    programaId,
    id
  );

  if (!visita) {
    throw noEncontrado(NO_ENCONTRADA);
  }

  return visita;
};

// EL AUTOR DE LA ANOTACION · F4.3. El username es lo que un operador reconoce al leer la
// observacion; el id numerico ya viaja a audit_logs por su propia columna, asi que repetirlo
// en el texto no anadiria nada legible. Si no hay usuario -una llamada sin token no llega
// aqui, pero la funcion no depende de eso- se devuelve null y la base escribe
// 'sin identificar'.
const autorDe = req =>
  req?.user?.username ?? null;

// Reparte la fila en la forma que publica la API: la visita, su unidad y, aparte, la
// existencia de OT. No se mezcla el contenido de la OT: eso es otra etapa.
const presentar = (
  visita,
  equipos
) => {
  const {
    placa,
    operacion,
    ot_total,
    ot_abiertas,
    ot_cerradas,
    ot_anuladas,
    ot_no_anuladas,
    ...resto
  } = visita;

  return {
    ...resto,
    unidad: {
      id: visita.programa_unidad_id,
      placa,
      operacion: operacion || null
    },
    ordenes_trabajo: {
      total: ot_total,
      abiertas: ot_abiertas,
      cerradas: ot_cerradas,
      anuladas: ot_anuladas,
      no_anuladas: ot_no_anuladas
    },
    acciones: {
      ...bloqueos(visita),
      puede_reprogramar: ['PROYECTADO','PROGRAMADO','REPROGRAMADO'].includes(visita.estado) && Number(ot_total) === 0,
      motivo_reprogramar: Number(ot_total) > 0 ? 'La visita tiene historial de órdenes.' : ['PROYECTADO','PROGRAMADO','REPROGRAMADO'].includes(visita.estado) ? null : 'La visita tiene un resultado histórico o está cancelada.',
      puede_elevar_nivel: ['PROYECTADO','PROGRAMADO','REPROGRAMADO'].includes(visita.estado) && Number(ot_total) === 0
    },
    equipos: {
      descripcion:
        'Evidencia de qué quedó materializado al crear la visita. No se recalcula con '
        + 'la frecuencia vigente: un cambio de frecuencia solo afecta proyecciones '
        + 'futuras todavía no materializadas.',
      total: equipos.length,
      items: equipos
    }
  };
};

export const listarProgramacion = manejar(
  async (req, res) => {
    const programaId = await programaDe(req);

    const filtros = normalizarFiltros(
      req.query
    );

    const visitas = await obtenerProgramacion(
      programaId,
      filtros
    );

    // Una consulta para los equipos de TODAS las visitas del listado.
    const equipos =
      await obtenerEquiposDeVisitas(
        visitas.map(v => v.id)
      );

    const total = await contarProgramacion(
      programaId,
      filtros
    );

    return res.json({
      programa_id: programaId,
      total,
      devueltas: visitas.length,
      estados: ESTADOS,
      filtros,
      programacion: visitas.map(
        visita => presentar(
          visita,
          equipos.get(visita.id)
        )
      )
    });
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al listar la programación del programa'
  }
);

export const obtenerVisita = manejar(
  async (req, res) => {
    const programaId = await programaDe(req);

    const visita = await visitaDe(
      programaId,
      req
    );

    const equipos = (
      await obtenerEquiposDeVisitas([visita.id])
    ).get(visita.id);

    return res.json(
      presentar(visita, equipos)
    );
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al obtener la programación'
  }
);

// Promocion de una visita proyectada. No crea nada: la misma fila, el mismo id, la misma
// unidad, las mismas quincenas y los mismos equipos previstos. Solo cambia el estado.
export const programar = manejar(
  async (req, res) => {
    const programaId = await programaDe(req);

    const antes = await visitaDe(
      programaId,
      req
    );

    const equipos = (
      await obtenerEquiposDeVisitas([antes.id])
    ).get(antes.id);

    // Idempotente Y SIN TOCAR LA BASE. Medido: set_updated_at usa CURRENT_TIMESTAMP, que
    // dentro de una transacción no avanza, pero FUERA de ella sí -y la API escribe en
    // autocommit-. Un UPDATE redundante movería updated_at sin que hubiera pasado nada. Se
    // corta antes, igual que CANCELADO -> CANCELADO, para que la repetición no deje rastro.
    if (antes.estado === ESTADO_PROGRAMADO) {
      return res.json({
        ...presentar(antes, equipos),
        ya_estaba_programada: true
      });
    }

    const permiso = bloqueos(antes);

    if (!permiso.puede_programar) {
      throw new ValidationError(
        permiso.motivo_programar,
        409
      );
    }

    const programada = await programarVisita(
      programaId,
      antes.id
    );

    if (!programada) {
      const ahora = await obtenerVisitaPorId(
        programaId,
        antes.id
      );

      throw new ValidationError(
        bloqueos(ahora).motivo_programar
        ?? 'La visita no admite confirmación en su estado actual',
        409
      );
    }

    const despues = await obtenerVisitaPorId(
      programaId,
      antes.id
    );

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Confirmó la visita ${antes.id} de ${antes.placa} en la quincena `
      + `${antes.quincena_efectiva}: PROYECTADO -> PROGRAMADO`,
      'programacion_mantenimiento',
      req,
      antes,
      despues
    );

    return res.json(
      presentar(
        despues,
        (await obtenerEquiposDeVisitas([antes.id]))
          .get(antes.id)
      )
    );
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al programar la visita'
  }
);

// ------------------------------------------------------------------------------------
// GET · destinos de reprogramacion de UNA visita · F4.2
// ------------------------------------------------------------------------------------
// LA AUTORIDAD DE LA REGLA ESTA AQUI, no en el selector del cliente. Publica las quincenas
// del periodo de la version aplicable con su estado real y, cuando no sirve, el motivo y el
// `code`. El cliente pinta lo que esto diga; no reconstruye la regla.
//
// Es un GET y no forma parte de presentar(): el catalogo cuesta dos consultas por visita, y
// meterlo en el listado de 886 visitas serian 1772 viajes para una pantalla que solo
// necesita el catalogo de la visita que el operador abrio.
//
// `reprogramable` viaja al lado a proposito: que existan destinos libres y que ESTA visita
// admita reprogramarse son dos preguntas distintas -una visita en PROYECTADO no se
// reprograma aunque le sobren quincenas-, y las dos salen del backend.
export const destinosReprogramacion = manejar(async (req, res) => {
  const programaId = await programaDe(req);
  return res.json(await destinosConDesplazamiento(programaId, normalizarId('id', req.params.id)));
}, {
  ...ERRORES,
  mensajeGenerico: 'Error al consultar las quincenas de destino'
});
export const reprogramar = manejar(async (req, res) => {
  const programaId = await programaDe(req);
  const {
    quincena_reprogramada,
    motivo
  } = prepararReprogramacion(req.body);
  return res.json(await aplicarAjuste({
    programaId,
    visitaId: normalizarId('id', req.params.id),
    destino: quincena_reprogramada,
    motivo,
    req
  }));
}, {
  ...ERRORES,
  mensajeGenerico: 'No se pudo reprogramar la visita'
});
export const elevarNivel = manejar(async (req, res) => {
  const programaId = await programaDe(req);
  if (!req.body || Object.keys(req.body).some(k => k !== 'nivel') || !['M1', 'M2', 'M3'].includes(req.body.nivel)) {
    throw new ValidationError('Seleccione M1, M2 o M3.');
  }
  return res.json(await aplicarAjuste({
    programaId,
    visitaId: normalizarId('id', req.params.id),
    nuevoNivel: req.body.nivel,
    req
  }));
}, {
  ...ERRORES,
  mensajeGenerico: 'No se pudo actualizar el nivel de mantenimiento'
});

export const cancelar = manejar(
  async (req, res) => {
    const programaId = await programaDe(req);

    const antes = await visitaDe(
      programaId,
      req
    );

    const equipos = (
      await obtenerEquiposDeVisitas([antes.id])
    ).get(antes.id);

    // F4.3 · el cuerpo se valida ANTES del cortocircuito idempotente, igual que en
    // reprogramar: una petición sin motivo está mal formada sea cual sea el estado de la
    // visita, así que contesta 400 también sobre una ya cancelada.
    const { motivo } = prepararCancelacion(req.body);

    // Idempotente: la base acepta CANCELADO -> CANCELADO -medido-, así que repetir la
    // cancelación no es un error, es la misma situación final. No anota: no toca la base.
    if (antes.estado === ESTADO_CANCELADO) {
      return res.json({
        ...presentar(antes, equipos),
        ya_estaba_cancelada: true
      });
    }

    const permiso = bloqueos(antes);

    if (!permiso.puede_cancelar) {
      throw new ValidationError(
        permiso.motivo_cancelar,
        409
      );
    }

    const cancelada = await cancelarVisita(
      programaId,
      antes.id,
      motivo,
      autorDe(req)
    );

    if (!cancelada) {
      const ahora = await obtenerVisitaPorId(
        programaId,
        antes.id
      );

      throw new ValidationError(
        bloqueos(ahora).motivo_cancelar
        ?? 'La visita no admite cancelación en su estado actual',
        409
      );
    }

    const despues = await obtenerVisitaPorId(
      programaId,
      antes.id
    );

    await logAction(
      req.user
        ? req.user.id
        : null,
      `Canceló la visita ${antes.id} de ${antes.placa} en la quincena `
      + `${antes.quincena_efectiva}. Motivo: ${motivo}`,
      'programacion_mantenimiento',
      req,
      antes,
      despues
    );

    return res.json(
      presentar(
        despues,
        (await obtenerEquiposDeVisitas([antes.id]))
          .get(antes.id)
      )
    );
  },
  {
    ...ERRORES,
    mensajeGenerico:
      'Error al cancelar la visita'
  }
);

// ------------------------------------------------------------------------------------
// PATCH · programar un LOTE de visitas
// ------------------------------------------------------------------------------------
// ATOMICO por decision de negocio: o se confirman todas las visitas seleccionadas o
// ninguna. Confirmar no se puede deshacer -no existe PROGRAMADO -> PROYECTADO, y el unico
// camino de vuelta es cancelar, que es terminal-, asi que dejar media seleccion confirmada
// dejaria al operador sin saber que quedo hecho.
//
//   BEGIN
//   1. el programa existe
//   2. leer y BLOQUEAR las visitas pedidas       FOR UPDATE OF p, ORDER BY id
//   3. clasificar con las MISMAS reglas que el individual    bloqueos()
//   4. 404 si falta alguna · 409 si alguna esta bloqueada    -> ROLLBACK
//   5. UPDATE de las programables en UNA sentencia
//   6. comprobar que la base escribio exactamente las que se decidieron
//   7. logAction POR VISITA, con el MISMO client
//   COMMIT        · ROLLBACK ante cualquier error
//
// El cerrojo del paso 2 se toma ANTES de decidir, no despues: es lo que impide que una
// visita se cancele o reciba una OT entre la decision y la escritura.
//
// NO crea ordenes de trabajo. NO toca quincenas, equipos, ciclos ni anclas.
export const programarLote = manejar(
  async (req, res) => {
    const programaId = normalizarId(
      'programaId',
      req.params.programaId
    );

    const {
      ids,
      solicitados,
      duplicados
    } = prepararLote(req.body);

    if (
      !await existePrograma(programaId)
    ) {
      throw noEncontrado(
        'Programa de mantenimiento no encontrado'
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const visitas = await obtenerVisitasParaLote(
        programaId,
        ids,
        client
      );

      const {
        faltantes,
        yaProgramadas,
        programables,
        bloqueadas
      } = clasificarLote(ids, visitas);

      // 404 primero: un id que no pertenece a este programa es un error de la peticion,
      // no una regla de negocio. No se distingue "no existe" de "es de otro programa",
      // igual que en el PATCH individual.
      if (faltantes.length > 0) {
        throw new ValidationError(
          `Estas visitas no existen en este programa: ${faltantes.join(', ')}. `
          + 'No se confirmó ninguna.',
          404
        );
      }

      // 409 si cualquiera esta bloqueada: el lote es atomico.
      if (bloqueadas.length > 0) {
        const detalle = bloqueadas
          .slice(0, 5)
          .map(b => `#${b.id} (${b.placa}, ${b.estado}): ${b.motivo}`)
          .join(' · ');

        throw new ValidationError(
          `${bloqueadas.length} de ${ids.length} visita(s) no se pueden confirmar, así que `
          + `no se confirmó ninguna. ${detalle}`
          + (bloqueadas.length > 5
            ? ` · y ${bloqueadas.length - 5} más`
            : ''),
          409
        );
      }

      const escritos = programables.length > 0
        ? await programarVisitasEnLote(
          programaId,
          programables.map(v => v.id),
          client
        )
        : [];

      // La base tenia la ultima palabra. Con el cerrojo tomado esto no deberia ocurrir,
      // pero si ocurre es que el estado cambio bajo los pies y hay que revertir en vez de
      // informar de un exito que no fue completo.
      if (escritos.length !== programables.length) {
        throw new ValidationError(
          `Se esperaba confirmar ${programables.length} visita(s) y la base aceptó `
          + `${escritos.length}: el estado de alguna cambió durante la operación. `
          + 'No se confirmó ninguna.',
          409
        );
      }

      // Una entrada de auditoria POR VISITA que de verdad cambio. Las que ya estaban
      // PROGRAMADAS no generan ninguna: no paso nada con ellas.
      for (const antes of programables) {
        await logAction(
          req.user
            ? req.user.id
            : null,
          `Confirmó la visita ${antes.id} de ${antes.placa} en la quincena `
          + `${antes.quincena_efectiva}: PROYECTADO -> PROGRAMADO `
          + `(lote de ${programables.length})`,
          'programacion_mantenimiento',
          req,
          antes,
          { ...antes, estado: ESTADO_PROGRAMADO },
          { client }
        );
      }

      const frescas = await obtenerVisitasParaLote(
        programaId,
        ids,
        client
      );

      const equipos = await obtenerEquiposDeVisitas(
        ids,
        client
      );

      await client.query('COMMIT');

      const quincenas = [
        ...new Set(frescas.map(v => v.quincena_efectiva))
      ].sort();

      return res.json({
        programa_id: programaId,
        solicitadas: solicitados,
        ids_unicos: ids.length,
        duplicados_colapsados: duplicados,
        confirmadas: escritos.length,
        ya_estaban_programadas: yaProgramadas.length,
        ids_confirmados: escritos.sort((a, b) => a - b),
        ids_ya_programados: yaProgramadas.map(v => v.id),
        quincenas,
        descripcion:
          'Programar confirma únicamente el estado de la visita. No cambia su quincena, '
          + 'sus equipos previstos, sus ciclos ni sus anclas, y no crea órdenes de trabajo.',
        programacion: frescas.map(
          visita => presentar(
            visita,
            equipos.get(visita.id)
          )
        )
      });
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
      'Error al programar el lote de visitas'
  }
);
