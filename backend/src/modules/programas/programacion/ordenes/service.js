import {
  ValidationError,
  normalizarId,
  normalizarTextoObligatorio,
  normalizarTextoOpcional,
  separarCamposEditables,
  esUsuarioTi,
  esUsuarioAdmin
} from '../../comun.js';

// UNA SOLA FUENTE DE VERDAD, igual que en frecuencias e inventario: las familias anuales y
// el orden de los niveles los define el nucleo del generador. Aqui se importan; no se
// vuelven a declarar.
//
// REGULARES no se importa a proposito: "familia regular" es, por definicion del dominio,
// "no anual" -chk_ciclo_tipo_equipo solo admite esas seis familias-, asi que la regla se
// expresa con ANUALES y no hace falta una segunda lista que mantener en paralelo.
import {
  ANUALES,
  ORDEN
} from '../../../../../scripts/ti-pr-01/generador-nucleo.mjs';

// ==========================================
// ORDENES DE TRABAJO (TI-PR-01)
// Reglas de negocio y normalización. No conoce HTTP ni SQL.
// ==========================================
//
// TODO LO QUE HAY AQUI SE MIDIO CONTRA EL MODELO en la etapa 4.0, no se dedujo de memoria.
//
// -------------------------------------------------------------------------------------
// ABRIR
// -------------------------------------------------------------------------------------
// Una OT es el acto de autorizar la ejecución de una visita ya confirmada. Nace ABIERTA
// -lo exige validar_apertura_ot- y con su alcance ya cerrado: la regla R2 de 20260928_016
// congela los equipos previstos desde que existe CUALQUIER OT, así que el conjunto que la
// OT tendrá que resolver no puede cambiar después. Medido: intentar insertar un equipo
// previsto con la OT ya abierta se rechaza con «el alcance de la visita esta congelado».
//
// Por eso los detalles se materializan en la misma transacción que la apertura: el universo
// está determinado en ese instante y no volverá a moverse.
//
// Lo que la base ya protege, y por tanto NO se duplica aquí:
//   · estado de la visita     validar_apertura_ot (P0001), con mensaje propio para
//                             PROYECTADO y para CANCELADO
//   · una sola OT activa      uq_ot_programacion_activa (23505)
//   · la OT nace ABIERTA      validar_apertura_ot
//   · coherencia del detalle  chk_otd_presencia
// Se comprueban además aquí el estado y la OT activa para contestar un 409 legible en vez
// de un código de PostgreSQL, igual que hace el módulo de programación. La base sigue
// siendo la autoridad.
//
// -------------------------------------------------------------------------------------
// EDITAR · cabecera y resultado por equipo (etapa 4.2)
// -------------------------------------------------------------------------------------
// Solo una OT ABIERTA admite cambios. Lo impone impedir_modificar_ot_cerrada, y aquí se
// comprueba antes para contestar un 409 operativo en vez de un P0001; la base sigue siendo
// la última defensa.
//
// LA COHERENCIA SE VALIDA SOBRE EL RESULTADO FUSIONADO, no sobre las claves presentes. Un
// PATCH parcial puede llegar con solo `estado` o solo `nivel_completado`, y lo que tiene
// que ser válido es la combinación final contra el equipo previsto.
//
// GPS y ADAS no admiten PARCIAL: su mantenimiento anual solo contempla M3 y no hay nivel
// inferior donde aterrizar el avance. Medido en la etapa 4.0: la base acepta el detalle y
// el fallo aparece después, al cerrar, como un 23514 de chk_ciclo_anual_solo_m3. Por eso se
// rechaza aquí, antes de cualquier escritura.
//
// -------------------------------------------------------------------------------------
// CERRAR (etapa 4.3)
// -------------------------------------------------------------------------------------
// El cierre NO se implementa aqui. Lo hace cerrar_orden_trabajo() en la base, que en una
// sola sentencia fija la fecha fisica en la visita, propaga los ciclos con la jerarquia
// acumulativa, deriva el resultado de la visita y cierra la OT. Este modulo la invoca como
// contrato transaccional y traduce sus siete excepciones; no reimplementa nada de eso.
//
// En particular NO se deriva aqui el resultado de la visita ni se decide si fecha_ejecucion
// es obligatoria: eso depende del resultado, que solo se conoce DENTRO de la funcion. La
// API valida el formato de la fecha -eso si es un problema del payload- y deja que la
// funcion imponga el resto.
//
// La fase administrativa es quincena_efectiva, nunca la fecha fisica. Lo garantiza la
// propia funcion y lo verifica trg_validar_coherencia_ciclo_ot fila a fila.
//
// -------------------------------------------------------------------------------------
// ANULAR (etapa 4.3)
// -------------------------------------------------------------------------------------
// Anular NO es borrar. La fila permanece con su motivo, su tecnico, sus observaciones, sus
// evidencias y todos sus detalles: es la constancia de que la orden existio y se desistio.
// 016 R1 prohibe borrar una OT en cualquier estado, asi que esta es la unica salida.
//
// No mueve ciclos y no escribe resultado en la visita: para la programacion es como si la
// orden no hubiera llegado a ejecutarse, y eso es justamente lo que vuelve a habilitar
// reprogramar y cancelar -lo gobierna congelar_visita_con_ot, que cuenta solo las OT NO
// anuladas-.
//
// chk_ot_cierre exige fecha_cierre y cerrada_por_id para CUALQUIER estado distinto de
// ABIERTA, asi que al anular hay que escribir los cuatro campos juntos aunque el nombre de
// dos de ellos hable de cierre.
//
// -------------------------------------------------------------------------------------
// LO QUE ESTA ETAPA NO HACE
// -------------------------------------------------------------------------------------
// No reabre, no borra, no escribe ciclos ni anclas desde JavaScript, y no toca el estado
// de la programacion por su cuenta.

// chk_ot_estado, en el orden del ciclo de vida.
export const ESTADOS = [
  'ABIERTA',
  'CERRADA',
  'ANULADA'
];

// chk_otd_estado.
export const ESTADOS_DETALLE = [
  'COMPLETADO',
  'PARCIAL',
  'PENDIENTE',
  'NO_APLICA'
];

// Los dos únicos estados de visita que admiten abrir una OT, según validar_apertura_ot:
// «solo PROGRAMADO o REPROGRAMADO admiten abrir una OT».
export const ESTADOS_QUE_ADMITEN_OT = [
  'PROGRAMADO',
  'REPROGRAMADO'
];

export const ESTADO_ABIERTA = 'ABIERTA';
export const ESTADO_ANULADA = 'ANULADA';
export const ESTADO_INICIAL_DETALLE = 'PENDIENTE';

// Los niveles y su jerarquía salen de ORDEN del núcleo: M1 < M2 < M3. No se reescribe.
export const NIVELES = Object.keys(ORDEN);

// Los campos editables de la cabecera mientras la OT está ABIERTA. El resto lo fija el
// servidor, la base o el cierre.
//
// F5.1 · tecnico_id SALIO de esta lista. El técnico ya no se edita a mano en ningún momento:
// se resuelve EXCLUSIVAMENTE al cerrar, con resolverTecnicoDelCierre(). Dejarlo editable
// permitía adjudicar una OT a cualquier fila de personal sin ninguna comprobación de que
// fuera TI, que es justo lo que la regla de negocio prohíbe.
export const CAMPOS_EDITABLES_CABECERA = [
  'minutos',
  'observaciones'
];

// Lo que un técnico declara de un equipo. tipo_equipo y nivel_programado NO están aquí: son
// del equipo previsto y se leen por JOIN.
export const CAMPOS_EDITABLES_DETALLE = [
  'estado',
  'nivel_completado',
  'observaciones'
];

// Los campos opcionales del cierre. El usuario y el estado los decide el servidor, y el
// resultado de la visita lo deriva la funcion.
//
// F5.1 · tecnico_id ENTRA aqui, y es el UNICO sitio del contrato donde se admite. Es
// opcional y solo tiene efecto en el flujo excepcional: cuando la OT no tiene tecnico y
// quien cierra NO es TI. Si quien cierra es TI, se IGNORA -su identidad manda-, y si la OT
// ya tiene tecnico, se IGNORA -se conserva el que tiene-.
export const CAMPOS_ADMITIDOS_CIERRE = [
  'fecha_ejecucion',
  'minutos',
  'observaciones',
  'tecnico_id'
];

// Lo unico que admite la anulacion. Texto libre, sin catalogo.
export const CAMPOS_ADMITIDOS_ANULACION = [
  'motivo_anulacion'
];

const AYUDA_CIERRE =
  'El resultado de la visita y los ciclos los deriva el cierre; el usuario sale de la '
  + 'sesion. fecha_ejecucion es el dia FISICO del trabajo, no la quincena.';

const AYUDA_ANULACION =
  'Anular conserva la orden y todos sus detalles: no es un borrado. El estado, la fecha y '
  + 'el usuario los fija el servidor.';

const AYUDA_CABECERA =
  'El estado, las fechas y el usuario los fija el servidor; el resultado por equipo se '
  + 'edita en cada detalle.';

const AYUDA_DETALLE =
  'tipo_equipo y nivel_programado pertenecen al equipo previsto de la visita y son '
  + 'inmutables desde que la orden existe.';

// F5.1 · ABRIR UNA OT NO ADMITE NINGUN CAMPO. Antes admitia tecnico_id opcional; ya no.
// Una OT nace SIEMPRE con tecnico_id NULL y eso es un estado valido hasta el cierre.
export const CAMPOS_ADMITIDOS_APERTURA = [];

const AYUDA_APERTURA =
  'abierta_por_id sale del usuario autenticado, el estado y la fecha los fija la base, '
  + 'y los detalles se derivan de los equipos previstos de la visita.';

// El cuerpo tiene que estar VACIO. Se comprueba aqui en vez de con separarCamposEditables
// porque esa funcion, con una lista blanca vacia, redactaria un rechazo con "Admitidos: "
// y nada detras. Se rechaza por nombre igual que el resto del modulo: nunca en silencio.
export const prepararApertura = datos => {
  const cuerpo =
    datos === null || datos === undefined
      ? {}
      : datos;

  if (
    typeof cuerpo !== 'object' ||
    Array.isArray(cuerpo)
  ) {
    throw new ValidationError(
      'Datos al abrir una orden de trabajo no válidos'
    );
  }

  const enviados = Object.keys(cuerpo);

  if (enviados.length > 0) {
    throw new ValidationError(
      `Abrir una orden de trabajo no admite ningún campo: llegaron `
      + `${enviados.join(', ')}. ${AYUDA_APERTURA} El técnico ejecutor NO se asigna al `
      + 'abrir: se resuelve únicamente al cerrar la orden, a partir del usuario que la '
      + 'cierra o de una selección explícita si ese usuario no es de TI.'
    );
  }

  // Se conserva la forma del retorno para no cambiar el contrato interno con el repositorio,
  // que sigue insertando la columna explicitamente con NULL.
  return { tecnico_id: null };
};

// =====================================================================================
// EL TECNICO DEL CIERRE · F5.1
// =====================================================================================
// LAS DOS COLUMNAS SON COSAS DISTINTAS, y la FK lo dice:
//
//   ordenes_trabajo.tecnico_id     -> personal(id)   QUIEN EJECUTO el mantenimiento
//   ordenes_trabajo.cerrada_por_id -> usuarios(id)   QUIEN CERRO formalmente la orden
//
// Pueden ser la misma persona o no. cerrada_por_id SIEMPRE es el usuario autenticado y no
// se decide aqui: lo fija cerrar_orden_trabajo() con el id que le pasa el controller.
//
// LOS TRES CASOS, en este orden de precedencia:
//
//   3. la OT YA tiene tecnico      -> se CONSERVA, cierre quien cierre. No se reescribe.
//   1. quien cierra ES de TI       -> tecnico = su persona. Automatico, sin preguntar.
//   2. quien cierra NO es de TI    -> tiene que SELECCIONAR un tecnico TI elegible.
//
// Se evalua el caso 3 primero a proposito: que la OT tenga tecnico gana sobre todo lo demas.
//
// POR QUE EL CASO 1 IGNORA lo que manda el cliente: si un TI pudiera enviar un tecnico_id
// distinto del suyo, podria adjudicar su trabajo a otro tecnico. La regla no lo rechaza con
// un error -seria ruido para un cliente que simplemente mande el campo-: lo ignora y lo
// informa en la respuesta, de modo que el hecho queda visible.
//
// Esta funcion es PURA: no consulta la base. La elegibilidad real la comprueba el controller
// con esTecnicoTiElegible() dentro de la transaccion, porque el backend no puede fiarse de
// lo que diga el selector del cliente.
//
// El rol de TI se importa de comun.js: es el MISMO que usa el catalogo de tecnicos, y tener
// dos definiciones de "quien es TI" seria poder ofrecer en el selector a alguien que el
// cierre trata de otra forma.
export const ORIGEN_TECNICO = {
  CONSERVADO: 'CONSERVADO',
  AUTOMATICO_TI: 'AUTOMATICO_TI',
  SELECCIONADO: 'SELECCIONADO'
};

export const CODIGOS_TECNICO = {
  TI_SIN_PERSONA: 'USUARIO_TI_SIN_PERSONA',
  NO_SELECCIONADO: 'TECNICO_NO_SELECCIONADO',
  NO_ELEGIBLE: 'TECNICO_NO_ELEGIBLE'
};

export const resolverTecnicoDelCierre = ({
  orden,
  usuario,
  tecnicoSolicitado = null
}) => {
  // ---------------------------------------------------------------- CASO 3
  if (
    orden.tecnico_id !== null &&
    orden.tecnico_id !== undefined
  ) {
    return {
      tecnico_id: orden.tecnico_id,
      origen: ORIGEN_TECNICO.CONSERVADO,
      escribir: false,
      validar: false,
      solicitud_ignorada:
        tecnicoSolicitado !== null &&
        tecnicoSolicitado !== orden.tecnico_id
    };
  }

  // ---------------------------------------------------------------- CASO 1
  if (esUsuarioTi(usuario)) {
    const persona = Number.isInteger(usuario?.persona_id)
      ? usuario.persona_id
      : null;

    if (persona === null) {
      throw new ValidationError(
        MENSAJES.tiSinPersona,
        409,
        CODIGOS_TECNICO.TI_SIN_PERSONA
      );
    }

    return {
      tecnico_id: persona,
      origen: ORIGEN_TECNICO.AUTOMATICO_TI,
      escribir: true,
      validar: true,
      solicitud_ignorada:
        tecnicoSolicitado !== null &&
        tecnicoSolicitado !== persona
    };
  }

  // ---------------------------------------------------------------- CASO 2
  if (tecnicoSolicitado === null) {
    throw new ValidationError(
      MENSAJES.tecnicoNoSeleccionado,
      409,
      CODIGOS_TECNICO.NO_SELECCIONADO
    );
  }

  return {
    tecnico_id: tecnicoSolicitado,
    origen: ORIGEN_TECNICO.SELECCIONADO,
    escribir: true,
    validar: true,
    solicitud_ignorada: false
  };
};

// Los textos de cada rechazo, en UN solo sitio. Los usan las dos rutas por las que puede
// llegar el mismo rechazo: la comprobación de este service -el camino normal- y la
// traducción del P0001 que levantaría validar_apertura_ot si la base lo rechazara primero.
// Tener dos redacciones para una misma regla seria dar dos respuestas distintas al cliente.
export const MENSAJES = {
  // F5.1 · los tres rechazos del tecnico del cierre.
  tiSinPersona:
    'Tu usuario TI no está vinculado a un registro de personal activo, así que no se '
    + 'puede determinar qué técnico ejecutó el mantenimiento. Pide que se complete el '
    + 'vínculo de tu cuenta antes de cerrar.',
  tecnicoNoSeleccionado:
    'Debe seleccionar el técnico TI que realizó el mantenimiento. La orden no tiene '
    + 'técnico asignado y tu usuario no es de TI, así que el sistema no puede deducirlo.',
  tecnicoNoElegible: id =>
    `La persona ${id} no es un técnico TI elegible: solo lo son las personas con una `
    + 'cuenta de TI activa y con su registro de personal en estado Activo.',
  proyectada:
    'La visita está PROYECTADA: es solo la proyección automática del programa. '
    + 'Confírmala como PROGRAMADA antes de abrir la orden de trabajo.',
  cancelada:
    'La visita está CANCELADA: no admite abrir una orden de trabajo. '
    + 'La sustitución exige crear una visita nueva.',
  estadoNoAdmite:
    'Solo una visita PROGRAMADA o REPROGRAMADA admite abrir una orden de trabajo. '
    + 'Una visita ya resuelta no se reabre: exige una visita nueva.',
  activa:
    'La visita ya tiene una orden de trabajo activa. Anúlala antes de abrir otra: '
    + 'solo puede haber una no anulada por visita.',
  sinPrevistos:
    'La visita no prevé ningún equipo: una orden de trabajo sin alcance no podría '
    + 'cerrarse nunca.',
  alcanceCongelado:
    'El alcance de la visita está congelado porque ya tuvo una orden de trabajo',
  nace:
    'Una orden de trabajo nace ABIERTA',
  tecnicoInexistente:
    'El técnico indicado no existe en el personal registrado',
  noAbierta: estado =>
    `La orden de trabajo está ${estado} y es inmutable: solo una orden ABIERTA admite `
    + 'cambios.',
  detalleNoEncontrado:
    'Detalle no encontrado en esta orden de trabajo',
  completado: nivel =>
    `COMPLETADO exige declarar el nivel previsto (${nivel}): es lo que significa haber `
    + 'completado el mantenimiento de ese equipo.',
  parcialSinNivel:
    'PARCIAL exige declarar el nivel_completado realmente alcanzado',
  parcialNoMenor: (nivel, previsto) =>
    `PARCIAL exige un nivel_completado MENOR que el previsto: ${nivel} no es menor que `
    + `${previsto}.`,
  parcialImposible:
    'PARCIAL es imposible con un previsto M1: no existe un nivel inferior. Declara '
    + 'COMPLETADO si se hizo, o PENDIENTE si no.',
  parcialAnual: familia =>
    `El equipo ${familia} no admite resultado PARCIAL; su mantenimiento anual solo `
    + 'contempla M3. Declara COMPLETADO, PENDIENTE o NO_APLICA.',
  // Las siete excepciones de cerrar_orden_trabajo(), traducidas una por una. Todas llegan
  // como P0001 -la funcion no usa ERRCODE-, asi que se distinguen por su texto, que quedo
  // inventariado antes de escribir esto.
  cierreOtInexistente:
    'Orden de trabajo no encontrada en esta programación',
  cierreYaCerrada:
    'La orden de trabajo ya no está ABIERTA: no se puede cerrar de nuevo.',
  cierreSinQuincena:
    'La visita no tiene quincena efectiva: sin fase administrativa no se puede cerrar.',
  cierreFechaFutura:
    'fecha_ejecucion es futura respecto a la fecha de negocio de Perú: no se puede '
    + 'registrar como ejecutado un trabajo que todavía no ha ocurrido.',
  cierreVisitaVacia:
    'La visita no prevé ningún equipo: una orden sin alcance no es ejecutable y no puede '
    + 'cerrarse.',
  cierreVisitaIncompleta:
    'Falta registrar el resultado de algún equipo previsto: no se puede cerrar una visita '
    + 'incompleta.',
  cierreExigeFecha:
    'El resultado de la visita afirma que se ejecutó mantenimiento, así que '
    + 'fecha_ejecucion es obligatoria: es el día físico del trabajo y los ciclos la citan. '
    + 'NO_EJECUTADO y NO_APLICA sí admiten fecha nula.',
  motivoObligatorio:
    'motivo_anulacion es obligatorio: deja constancia de por qué se desiste de la orden',
  anularNoAbierta: estado =>
    `La orden de trabajo está ${estado} y es inmutable: solo una orden ABIERTA se puede `
    + 'anular.',
  fechaFormato: campo =>
    `${campo} debe tener el formato AAAA-MM-DD`,
  fechaInvalida: (campo, texto) =>
    `${campo} ${texto} no es una fecha válida`,
  sinNivel: estado =>
    `${estado} exige nivel_completado nulo: no se completó ningún nivel. Envía `
    + '"nivel_completado": null de forma explícita.'
};

// Por qué una visita admite o no admite una OT nueva. Una sola definición: la usan el POST
// -para decidir- y los GET -para informar-.
export const bloqueosDeApertura = (
  visita,
  {
    activas,
    previstos
  }
) => {
  let motivo = null;

  if (visita.estado === 'PROYECTADO') {
    motivo = MENSAJES.proyectada;
  } else if (visita.estado === 'CANCELADO') {
    motivo = MENSAJES.cancelada;
  } else if (
    !ESTADOS_QUE_ADMITEN_OT.includes(visita.estado)
  ) {
    // El estado real va delante para que el operador sepa en qué punto está la visita.
    motivo = `La visita está en ${visita.estado}. ${MENSAJES.estadoNoAdmite}`;
  } else if (activas > 0) {
    motivo = MENSAJES.activa;
  } else if (previstos === 0) {
    motivo = MENSAJES.sinPrevistos;
  }

  return {
    puede_abrir: motivo === null,
    motivo_abrir: motivo
  };
};

// Qué admite una OT según SU estado. Las tres capacidades dependen del mismo hecho:
// impedir_modificar_ot_cerrada solo deja pasar un UPDATE cuando la fila está ABIERTA. No hay
// ninguna regla nueva aquí.
//
// Cada puede_X se publica cuando existe su endpoint, igual que hizo la etapa 3.1 con
// puede_programar y la 4.2 con puede_editar. En 4.3 existen POST /cerrar y PATCH /anular,
// así que los dos flags que faltaban entran ahora, con su ruta ya real detrás.
export const accionesDeOrden = orden => {
  const abierta = orden.estado === ESTADO_ABIERTA;

  return {
    puede_editar: abierta,
    puede_cerrar: abierta,
    puede_anular: abierta,
    motivo: abierta
      ? null
      : MENSAJES.noAbierta(orden.estado)
  };
};

// activa = estado <> 'ANULADA', que es exactamente el predicado del índice parcial
// uq_ot_programacion_activa: la OT que ocupa el hueco de la visita.
export const estaActiva = orden =>
  orden.estado !== ESTADO_ANULADA;

// Reparte la fila en la forma que publica la API. La unidad y la quincena viajan aparte
// porque pertenecen a la visita, no a la OT.
export const presentarOrden = (
  orden,
  detalles
) => {
  const {
    programa_unidad_id,
    placa,
    quincena_efectiva,
    tecnico_nombre,
    cerrada_por_username,
    cerrada_por_nombre,
    ...resto
  } = orden;

  return {
    ...resto,
    activa: estaActiva(orden),
    unidad: {
      id: programa_unidad_id,
      placa
    },

    // F5.1 · las dos identidades del cierre, resueltas por relacion maestra. Los id planos
    // -tecnico_id, cerrada_por_id- siguen en `resto` y no se quitan: habia clientes que ya
    // los leian. Esto se ANADE.
    //
    // null cuando la columna es null: una OT abierta no tiene tecnico ni cerrada_por, y
    // decirlo con null es mas honesto que con un objeto de campos vacios.
    //
    // En cerrada_por el `nombre` puede ser null aunque el usuario exista: solo 1 de los 5
    // usuarios tiene persona ligada. En ese caso el username es la identidad disponible y
    // NO se inventa un nombre.
    tecnico: orden.tecnico_id === null ||
      orden.tecnico_id === undefined
      ? null
      : {
        id: orden.tecnico_id,
        nombre: tecnico_nombre ?? null
      },
    cerrada_por: orden.cerrada_por_id === null ||
      orden.cerrada_por_id === undefined
      ? null
      : {
        id: orden.cerrada_por_id,
        username: cerrada_por_username ?? null,
        nombre: cerrada_por_nombre ?? null
      },
    visita: {
      id: orden.programacion_id,
      quincena_efectiva
    },
    acciones: accionesDeOrden(orden),
    detalles: {
      descripcion:
        'Un detalle por cada equipo previsto de la visita, materializado al abrir la '
        + 'orden. tipo_equipo y nivel_programado se leen de programacion_mantenimiento_'
        + 'equipos, que es la única fuente de verdad de lo previsto.',
      total: detalles.length,
      items: detalles
    }
  };
};

// ------------------------------------------------------------------------------------
// NORMALIZADORES DE 4.2
// ------------------------------------------------------------------------------------

// F5.2 · aqui vivia normalizarEvidencias, que validaba el jsonb `evidencias` de la cabecera
// y del detalle. Se RETIRA, no se deja muerta: desde 20261010_018 la evidencia fotografica
// vive en ordenes_trabajo_evidencias, que es su unica fuente operativa, y los dos campos
// jsonb salieron de CAMPOS_EDITABLES_CABECERA y CAMPOS_EDITABLES_DETALLE. Con el campo
// fuera de la lista blanca esta funcion era inalcanzable, y dejarla escrita invitaria a
// reactivar una segunda fuente de verdad volviendo a meter el campo en la lista.
//
// Las dos columnas jsonb SIGUEN existiendo en la base -su DROP es trabajo de un cleanup
// propio-, pero ni se escriben ni se leen.

// chk_ot_minutos: NULL o mayor que cero. normalizarId ya exige entero positivo y rechaza
// decimales y texto, que es exactamente el dominio; se reutiliza en vez de duplicarlo.
export const normalizarMinutos = valor => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  return normalizarId('minutos', valor);
};

const normalizarDeDominio = (
  campo,
  valor,
  dominio
) => {
  const texto = String(valor ?? '')
    .trim()
    .toUpperCase();

  if (!dominio.includes(texto)) {
    throw new ValidationError(
      `${campo} debe ser ${dominio.join(', ')}`
    );
  }

  return texto;
};

// nivel_completado admite null de forma EXPLICITA: es lo que declara que no se completo
// ningun nivel.
export const normalizarNivel = valor => {
  if (valor === null) {
    return null;
  }

  return normalizarDeDominio(
    'nivel_completado',
    valor,
    NIVELES
  );
};

// ------------------------------------------------------------------------------------
// PREPARAR LOS DOS PATCH
// ------------------------------------------------------------------------------------
// Sin permitirVacio: un PATCH con el cuerpo vacio es un error, y ese es el comportamiento
// que el modulo ya tenia. permitirVacio era exclusivo de la apertura.
export const prepararActualizacionCabecera = datos => {
  const campos = separarCamposEditables(
    datos,
    CAMPOS_EDITABLES_CABECERA,
    {
      sujeto: 'en la orden de trabajo',
      ayuda: AYUDA_CABECERA
    }
  );

  // F5.1 · aqui habia una rama para tecnico_id. Se retira, no se deja muerta: con
  // tecnico_id fuera de CAMPOS_EDITABLES_CABECERA, `campos` nunca puede contenerlo -el
  // rechazo por nombre ocurre antes-, asi que esa rama era inalcanzable. Dejarla escrita
  // invitaria a reactivar el campo volviendo a meterlo en la lista blanca, que es
  // exactamente lo que la regla prohibe.
  return {
    campos,
    data: {
      minutos: campos.includes('minutos')
        ? normalizarMinutos(datos.minutos)
        : undefined,
      observaciones: campos.includes('observaciones')
        ? normalizarTextoOpcional('observaciones', datos.observaciones)
        : undefined,
    }
  };
};

export const prepararActualizacionDetalle = datos => {
  const campos = separarCamposEditables(
    datos,
    CAMPOS_EDITABLES_DETALLE,
    {
      sujeto: 'en el detalle de la orden de trabajo',
      ayuda: AYUDA_DETALLE
    }
  );

  return {
    campos,
    data: {
      estado: campos.includes('estado')
        ? normalizarDeDominio('estado', datos.estado, ESTADOS_DETALLE)
        : undefined,
      nivel_completado: campos.includes('nivel_completado')
        ? normalizarNivel(datos.nivel_completado)
        : undefined,
      observaciones: campos.includes('observaciones')
        ? normalizarTextoOpcional('observaciones', datos.observaciones)
        : undefined,
    }
  };
};

// ------------------------------------------------------------------------------------
// COHERENCIA DEL RESULTADO, SOBRE LA COMBINACION FINAL
// ------------------------------------------------------------------------------------
// El PATCH es parcial, asi que primero se FUSIONA con lo almacenado y despues se valida.
// Validar solo las claves presentes dejaria pasar un {estado:'COMPLETADO'} sobre un detalle
// con nivel NULL.
//
// NO se autocompleta nada. Si alguien manda COMPLETADO sin nivel, se rechaza: el nivel
// ejecutado lo declara quien hizo el trabajo, no se infiere del previsto. Y al pasar a
// PENDIENTE o NO_APLICA hay que enviar "nivel_completado": null de forma explicita, porque
// en este proyecto no existe ningun precedente de inferir un campo ausente -reprogramar
// exige su quincena, y los PATCH de unidades y programas solo normalizan lo que reciben-.
export const resolverResultado = (
  detalle,
  campos,
  data
) => {
  const estado = campos.includes('estado')
    ? data.estado
    : detalle.estado;

  const nivel = campos.includes('nivel_completado')
    ? data.nivel_completado
    : detalle.nivel_completado;

  const previsto = detalle.nivel_programado;

  if (
    estado === 'PENDIENTE' ||
    estado === 'NO_APLICA'
  ) {
    if (nivel !== null) {
      throw new ValidationError(
        MENSAJES.sinNivel(estado),
        409
      );
    }

    return { estado, nivel_completado: null };
  }

  if (estado === 'COMPLETADO') {
    if (nivel !== previsto) {
      throw new ValidationError(
        MENSAJES.completado(previsto),
        409
      );
    }

    return { estado, nivel_completado: nivel };
  }

  // PARCIAL. Las familias anuales quedan fuera: solo tienen M3.
  if (ANUALES.includes(detalle.tipo_equipo)) {
    throw new ValidationError(
      MENSAJES.parcialAnual(detalle.tipo_equipo),
      409
    );
  }

  if (previsto === 'M1') {
    throw new ValidationError(
      MENSAJES.parcialImposible,
      409
    );
  }

  if (nivel === null) {
    throw new ValidationError(
      MENSAJES.parcialSinNivel,
      409
    );
  }

  if (ORDEN[nivel] >= ORDEN[previsto]) {
    throw new ValidationError(
      MENSAJES.parcialNoMenor(nivel, previsto),
      409
    );
  }

  return { estado, nivel_completado: nivel };
};

// ------------------------------------------------------------------------------------
// NORMALIZADORES DE 4.3
// ------------------------------------------------------------------------------------

// El dominio es DATE, no timestamp: la fecha fisica de un trabajo es un dia, sin hora.
// Se valida el formato y que el dia exista de verdad -31 de febrero no-, y nada mas: que
// no sea futura respecto a America/Lima lo impone la funcion de cierre, porque su
// referencia se mueve y la base es la autoridad sobre la fecha de negocio.
//
// No se reutiliza normalizarQuincena de la programacion: esa exige dia 1 o 16, que es la
// regla de la FASE administrativa. La fecha fisica puede ser cualquier dia del mes.
export const normalizarFecha = (
  campo,
  valor
) => {
  if (typeof valor !== 'string') {
    throw new ValidationError(
      MENSAJES.fechaFormato(campo)
    );
  }

  const texto = valor.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new ValidationError(
      MENSAJES.fechaFormato(campo)
    );
  }

  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new ValidationError(
      MENSAJES.fechaInvalida(campo, texto)
    );
  }

  return texto;
};

// Los tres campos del cierre son opcionales: una visita que no se ejecuto se cierra sin
// cuerpo. De ahi permitirVacio, igual que en la apertura.
export const prepararCierre = datos => {
  const cuerpo =
    datos === null || datos === undefined
      ? {}
      : datos;

  separarCamposEditables(
    cuerpo,
    CAMPOS_ADMITIDOS_CIERRE,
    {
      sujeto: 'al cerrar una orden de trabajo',
      ayuda: AYUDA_CIERRE,
      verbo: 'admiten',
      permitirVacio: true
    }
  );

  return {
    fecha_ejecucion:
      cuerpo.fecha_ejecucion === null ||
      cuerpo.fecha_ejecucion === undefined ||
      cuerpo.fecha_ejecucion === ''
        ? null
        : normalizarFecha('fecha_ejecucion', cuerpo.fecha_ejecucion),
    minutos: normalizarMinutos(cuerpo.minutos),
    observaciones: normalizarTextoOpcional(
      'observaciones',
      cuerpo.observaciones
    ),

    // F5.1 · el tecnico SOLICITADO, no el tecnico final. Aqui solo se valida el FORMATO:
    // quien decide si se usa, se ignora o se rechaza es resolverTecnicoDelCierre(), y si
    // de verdad es un tecnico TI elegible lo comprueba el controller contra la base.
    tecnico_id:
      cuerpo.tecnico_id === null ||
      cuerpo.tecnico_id === undefined ||
      cuerpo.tecnico_id === ''
        ? null
        : normalizarId('tecnico_id', cuerpo.tecnico_id)
  };
};

// motivo_anulacion es text en la base, sin longitud maxima, asi que no se inventa una: se
// reutiliza el normalizador obligatorio del modulo -que exige string y rechaza el vacio
// tras recortar- con un tope infinito en vez de duplicar esa comprobacion aqui.
export const prepararAnulacion = datos => {
  separarCamposEditables(
    datos,
    CAMPOS_ADMITIDOS_ANULACION,
    {
      sujeto: 'al anular una orden de trabajo',
      ayuda: AYUDA_ANULACION,
      verbo: 'admiten'
    }
  );

  if (typeof datos.motivo_anulacion !== 'string') {
    throw new ValidationError(
      MENSAJES.motivoObligatorio
    );
  }

  return {
    motivo_anulacion: normalizarTextoObligatorio(
      'motivo_anulacion',
      datos.motivo_anulacion,
      Number.POSITIVE_INFINITY
    )
  };
};

// Solo una OT ABIERTA se anula. Mensaje propio: el de la edicion habla de cambios, y aqui
// lo que se rechaza es el desistimiento.
export const exigirAnulable = orden => {
  if (orden.estado !== ESTADO_ABIERTA) {
    throw new ValidationError(
      MENSAJES.anularNoAbierta(orden.estado),
      409
    );
  }

  return orden;
};

export const yaEstaAnulada = orden =>
  orden.estado === ESTADO_ANULADA;

// Solo una OT ABIERTA admite cambios. Se comprueba antes de intentar el UPDATE para dar un
// mensaje operativo; impedir_modificar_ot_cerrada lo volveria a rechazar de todos modos.
export const exigirOrdenAbierta = orden => {
  if (orden.estado !== ESTADO_ABIERTA) {
    throw new ValidationError(
      MENSAJES.noAbierta(orden.estado),
      409
    );
  }

  return orden;
};

// Se exige que la visita exista y pertenezca al programa antes de cualquier otra cosa: una
// OT de otro programa no se filtra, no existe para esta ruta.
export const exigirVisita = visita => {
  if (!visita) {
    throw new ValidationError(
      'Programación no encontrada en este programa',
      404
    );
  }

  return visita;
};

// =====================================================================================
// EVIDENCIA FOTOGRAFICA · F5.2
// =====================================================================================
// Reglas de negocio aprobadas el 2026-10-09/10. Todo lo de esta seccion es PURO: no conoce
// HTTP, ni SQL, ni Cloudinary. Quien orquesta es el controller.
//
// QUE FAMILIAS LLEVAN FOTOGRAFIA
// ------------------------------
//   CAMARAS · COPILOTO · RADIO_BASE   -> si
//   GPS · ADAS                        -> NO, en ningun caso y con ningun resultado
//
// Y se expresa con ANUALES, no con una lista propia de regulares, por la misma razon que ya
// esta escrita arriba en este archivo: "familia regular" es por definicion del dominio "no
// anual" -chk_ciclo_tipo_equipo solo admite esas seis familias-, asi que una segunda lista
// seria una segunda verdad que mantener en paralelo.
//
// QUE EXIGE CADA RESULTADO AL CERRAR
// ----------------------------------
//                       | CAMARAS/COPILOTO/RADIO_BASE |  GPS/ADAS
//   COMPLETADO          | >=1 foto                    |  nada
//   PARCIAL             | >=1 foto                    |  nada
//   PENDIENTE           | >=1 foto + observaciones    |  observaciones
//   NO_APLICA           | observaciones               |  observaciones
//
// PENDIENTE al cerrar significa operativamente "no ejecutado": por eso exige constancia.
// NO_APLICA no exige foto porque no hubo intervencion que fotografiar, pero si exige decir
// por que no aplicaba.

// Las familias anuales ya vienen importadas del nucleo del generador.
export const exigeEvidenciaFotografica = tipoEquipo =>
  !ANUALES.includes(
    String(tipoEquipo ?? '').trim().toUpperCase()
  );

// Los resultados en los que, para una familia con fotografia, la foto es OBLIGATORIA.
// NO_APLICA queda fuera a proposito.
export const ESTADOS_QUE_EXIGEN_FOTO = [
  'COMPLETADO',
  'PARCIAL',
  'PENDIENTE'
];

// Los resultados que exigen decir POR QUE, en cualquier familia.
export const ESTADOS_QUE_EXIGEN_OBSERVACIONES = [
  'PENDIENTE',
  'NO_APLICA'
];

export const MAXIMO_EVIDENCIAS_ACTIVAS = 4;

export const CODIGOS_EVIDENCIA = {
  FAMILIA_SIN_EVIDENCIA: 'FAMILIA_SIN_EVIDENCIA',
  MAXIMO_ALCANZADO: 'MAXIMO_EVIDENCIAS_ALCANZADO',
  ARCHIVO_NO_IMAGEN: 'ARCHIVO_NO_IMAGEN',
  ARCHIVO_DEMASIADO_GRANDE: 'ARCHIVO_DEMASIADO_GRANDE',
  SIN_ARCHIVO: 'SIN_ARCHIVO',
  SOLO_TI_SUBE: 'SOLO_TI_SUBE_EVIDENCIA',
  SOLO_TI_RETIRA: 'SOLO_TI_RETIRA_EVIDENCIA',
  SOLO_ADMIN_RETIRA: 'SOLO_ADMIN_RETIRA_EVIDENCIA',
  ULTIMA_OBLIGATORIA: 'ULTIMA_EVIDENCIA_OBLIGATORIA',
  YA_RETIRADA: 'EVIDENCIA_YA_RETIRADA',
  EVIDENCIAS_INCOMPLETAS: 'EVIDENCIAS_INCOMPLETAS',
  ORDEN_NO_ABIERTA: 'ORDEN_NO_ABIERTA'
};

// -------------------------------------------------------------------------------------
// EL FORMATO REAL DEL ARCHIVO · MAGIC BYTES
// -------------------------------------------------------------------------------------
// file.mimetype lo declara el CLIENTE y es falsificable: basta renombrar un PDF y poner
// Content-Type: image/jpeg. La unica forma de saber que lo que llego es una imagen es mirar
// sus primeros bytes, que es lo que hace esta funcion.
//
// Las firmas, de la especificacion de cada formato:
//   JPEG  FF D8 FF                                   los tres primeros bytes
//   PNG   89 50 4E 47 0D 0A 1A 0A                    los ocho de la firma PNG
//   WEBP  52 49 46 46 ?? ?? ?? ?? 57 45 42 50        'RIFF' .... 'WEBP'
//
// Devuelve el formato en los MISMOS valores que admite chk_ote_formato de 018 -'jpg', 'png',
// 'webp'- o null si no reconoce nada. Para JPEG devuelve 'jpg', que es lo que Cloudinary
// pone en `format`, no 'jpeg'.
//
// No se usa ninguna dependencia: son tres comparaciones de bytes.
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_RIFF = Buffer.from('RIFF', 'ascii');
const FIRMA_WEBP = Buffer.from('WEBP', 'ascii');

export const detectarFormatoImagen = buffer => {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12
  ) {
    return null;
  }

  if (buffer.subarray(0, 3).equals(FIRMA_JPEG)) {
    return 'jpg';
  }

  if (buffer.subarray(0, 8).equals(FIRMA_PNG)) {
    return 'png';
  }

  // WEBP lleva el tamano del fichero en los bytes 4..7, que se ignoran: lo que identifica
  // el formato es el par RIFF ... WEBP.
  if (
    buffer.subarray(0, 4).equals(FIRMA_RIFF) &&
    buffer.subarray(8, 12).equals(FIRMA_WEBP)
  ) {
    return 'webp';
  }

  return null;
};

// -------------------------------------------------------------------------------------
// VALIDAR EL ARCHIVO QUE LLEGA
// -------------------------------------------------------------------------------------
// multer ya rechazo por mimetype y por tamano antes de llenar el buffer, pero eso es una
// primera barrera, no la regla: aqui se vuelve a comprobar el tamano sobre el buffer real y
// se decide el formato por su contenido.
export const validarArchivoEvidencia = (
  archivo,
  limiteBytes
) => {
  if (
    !archivo ||
    !Buffer.isBuffer(archivo.buffer) ||
    archivo.buffer.length === 0
  ) {
    throw new ValidationError(
      'No se recibió ninguna imagen. El archivo viaja en el campo `imagen` de un '
      + 'multipart/form-data.',
      400,
      CODIGOS_EVIDENCIA.SIN_ARCHIVO
    );
  }

  if (archivo.buffer.length > limiteBytes) {
    throw new ValidationError(
      `La imagen pesa ${archivo.buffer.length} bytes y el máximo es ${limiteBytes} `
      + `(${Math.round(limiteBytes / (1024 * 1024))} MB).`,
      400,
      CODIGOS_EVIDENCIA.ARCHIVO_DEMASIADO_GRANDE
    );
  }

  const formato = detectarFormatoImagen(archivo.buffer);

  if (formato === null) {
    throw new ValidationError(
      'El archivo no es una fotografía JPEG, PNG ni WEBP. Se comprueba su contenido real, '
      + `no su extensión ni el tipo que declara el navegador (declaró `
      + `${archivo.mimetype ?? 'nada'}).`,
      400,
      CODIGOS_EVIDENCIA.ARCHIVO_NO_IMAGEN
    );
  }

  return { formato, bytes: archivo.buffer.length };
};

// -------------------------------------------------------------------------------------
// QUIEN PUEDE SUBIR
// -------------------------------------------------------------------------------------
// TI y administradores, y solo con la OT ABIERTA. Lo segundo lo garantiza ademas el trigger
// validar_evidencia_ot_abierta de 018, pero aqui se rechaza antes de subir nada a
// Cloudinary: dejar que falle en el INSERT significaria haber subido el asset para nada.
export const exigirPuedeSubirEvidencia = (
  orden,
  usuario
) => {
  if (!esUsuarioTi(usuario) && !esUsuarioAdmin(usuario)) {
    throw new ValidationError(
      'Solo TI o un administrador pueden cargar evidencia fotográfica.',
      403,
      CODIGOS_EVIDENCIA.SOLO_TI_SUBE
    );
  }

  if (orden.estado !== ESTADO_ABIERTA) {
    throw new ValidationError(
      `La orden de trabajo está ${orden.estado}: no admite evidencia nueva. Solo una orden `
      + 'ABIERTA recibe fotografías.',
      409,
      CODIGOS_EVIDENCIA.ORDEN_NO_ABIERTA
    );
  }
};

// La familia del apartado decide si admite fotografia, y no el cliente.
export const exigirFamiliaConEvidencia = detalle => {
  if (!exigeEvidenciaFotografica(detalle.tipo_equipo)) {
    throw new ValidationError(
      `${detalle.tipo_equipo} no lleva evidencia fotográfica: es una anualidad y su `
      + 'sustento no es una foto. Solo CAMARAS, COPILOTO y RADIO_BASE admiten carga de '
      + 'imágenes.',
      409,
      CODIGOS_EVIDENCIA.FAMILIA_SIN_EVIDENCIA
    );
  }
};

// El tope. La CUENTA la hace el repositorio con la fila del detalle ya bloqueada; aqui solo
// se decide. Separarlo es lo que permite probar la regla sin base de datos.
export const exigirHuecoParaEvidencia = (
  activas,
  detalle
) => {
  if (activas >= MAXIMO_EVIDENCIAS_ACTIVAS) {
    throw new ValidationError(
      `El apartado ${detalle.tipo_equipo} ya tiene ${activas} evidencias activas, que es el `
      + `máximo (${MAXIMO_EVIDENCIAS_ACTIVAS}). Retira una antes de cargar otra.`,
      409,
      CODIGOS_EVIDENCIA.MAXIMO_ALCANZADO
    );
  }
};

// -------------------------------------------------------------------------------------
// QUIEN PUEDE RETIRAR, Y CUANDO
// -------------------------------------------------------------------------------------
//   ABIERTA   -> TI o ADMIN. Es trabajo en curso: puede quitar una foto subida por error.
//   CERRADA   -> ADMIN y solo ADMIN, con motivo. Y NO puede dejar sin evidencia un apartado
//                que la exige por su resultado: esa es la regla de la ultima evidencia.
//   ANULADA   -> ADMIN y solo ADMIN, con motivo, y SI puede retirar la ultima: la orden ya
//                no sustenta nada, asi que no hay evidencia obligatoria que proteger.
//
// `activas` es el recuento del apartado ANTES de retirar, con el detalle ya bloqueado.
export const exigirPuedeRetirarEvidencia = ({
  orden,
  detalle,
  usuario,
  activas
}) => {
  if (orden.estado === ESTADO_ABIERTA) {
    if (!esUsuarioTi(usuario) && !esUsuarioAdmin(usuario)) {
      throw new ValidationError(
        'Solo TI o un administrador pueden retirar evidencia de una orden abierta.',
        403,
        CODIGOS_EVIDENCIA.SOLO_TI_RETIRA
      );
    }

    return { regla: esUsuarioAdmin(usuario) ? 'ABIERTA_ADMIN' : 'ABIERTA_TI' };
  }

  // CERRADA y ANULADA comparten que solo ADMIN puede tocarlas.
  if (!esUsuarioAdmin(usuario)) {
    throw new ValidationError(
      `La orden de trabajo está ${orden.estado}: solo un administrador puede retirar una `
      + 'evidencia, y únicamente para corregir una fotografía errónea.',
      403,
      CODIGOS_EVIDENCIA.SOLO_ADMIN_RETIRA
    );
  }

  if (orden.estado === ESTADO_ANULADA) {
    return { regla: 'ANULADA_ADMIN' };
  }

  // CERRADA. Aqui si protege la ultima evidencia obligatoria.
  const obligatoria =
    exigeEvidenciaFotografica(detalle.tipo_equipo) &&
    ESTADOS_QUE_EXIGEN_FOTO.includes(detalle.estado);

  if (obligatoria && activas <= 1) {
    throw new ValidationError(
      'No se puede retirar la última evidencia obligatoria de este apartado. '
      + `${detalle.tipo_equipo} quedó ${detalle.estado} y su sustento exige al menos una `
      + 'fotografía.',
      409,
      CODIGOS_EVIDENCIA.ULTIMA_OBLIGATORIA
    );
  }

  return { regla: 'CERRADA_ADMIN' };
};

// El motivo del retiro. chk_ote_retiro de 018 ya lo exige no vacio en la base, con la MISMA
// clase de blanco que se midio en F5.1; aqui se rechaza antes para dar un 400 legible en vez
// de un 23514, y se recorta con esa misma semantica.
const SOLO_BLANCO = /^[\s﻿]*$/;

export const prepararRetiroEvidencia = datos => {
  separarCamposEditables(
    datos,
    ['motivo'],
    {
      sujeto: 'al retirar una evidencia',
      ayuda:
        'El autor y la fecha del retiro los fija el servidor. La imagen NO se borra de '
        + 'Cloudinary ni la fila de la base: queda como RETIRADA, con su traza.',
      verbo: 'admiten'
    }
  );

  if (typeof datos.motivo !== 'string') {
    throw new ValidationError(
      'motivo es obligatorio: retirar una evidencia deja un hueco en el sustento del '
      + 'mantenimiento y tiene que quedar explicado.'
    );
  }

  if (SOLO_BLANCO.test(datos.motivo)) {
    throw new ValidationError(
      'motivo no puede estar vacío ni contener solo espacios.'
    );
  }

  return {
    motivo: normalizarTextoObligatorio(
      'motivo',
      datos.motivo,
      Number.POSITIVE_INFINITY
    )
  };
};

// -------------------------------------------------------------------------------------
// LA VALIDACION DEL CIERRE
// -------------------------------------------------------------------------------------
// PURA y sobre los datos que el repositorio ya leyo de la base: la fuente de verdad es
// ordenes_trabajo_evidencias, no lo que diga el cliente.
//
// Devuelve TODOS los incumplimientos juntos, no el primero: un tecnico al que se le dice
// "falta la foto de CAMARAS", la sube, y entonces se le dice "y las observaciones de
// RADIO_BASE", ha hecho dos viajes para un solo problema.
//
// Cada detalle puede incumplir las DOS cosas a la vez -PENDIENTE sin foto y sin
// observaciones-, y las dos se informan.
export const validarEvidenciasParaCierre = detalles => {
  const incumplimientos = [];

  for (const detalle of detalles) {
    const conFoto = exigeEvidenciaFotografica(detalle.tipo_equipo);

    const faltaFoto =
      conFoto &&
      ESTADOS_QUE_EXIGEN_FOTO.includes(detalle.estado) &&
      detalle.evidencias_activas === 0;

    if (faltaFoto) {
      incumplimientos.push({
        detalle_id: detalle.id,
        tipo_equipo: detalle.tipo_equipo,
        estado: detalle.estado,
        falta: 'EVIDENCIA',
        motivo:
          `${detalle.tipo_equipo} quedó ${detalle.estado} y no tiene ninguna evidencia `
          + 'fotográfica activa. Se exige al menos una.'
      });
    }

    const faltaObservacion =
      ESTADOS_QUE_EXIGEN_OBSERVACIONES.includes(detalle.estado) &&
      (
        typeof detalle.observaciones !== 'string' ||
        SOLO_BLANCO.test(detalle.observaciones)
      );

    if (faltaObservacion) {
      incumplimientos.push({
        detalle_id: detalle.id,
        tipo_equipo: detalle.tipo_equipo,
        estado: detalle.estado,
        falta: 'OBSERVACIONES',
        motivo: detalle.estado === 'PENDIENTE'
          ? `${detalle.tipo_equipo} quedó PENDIENTE, que al cerrar significa que no se `
            + 'ejecutó: hay que explicar por qué en sus observaciones.'
          : `${detalle.tipo_equipo} quedó NO_APLICA: hay que explicar por qué no `
            + 'correspondía en sus observaciones.'
      });
    }
  }

  return incumplimientos;
};

// El 409 estructurado del cierre. Lleva la lista completa para que el cliente pinte una
// por apartado en vez de un parrafo.
export const errorDeEvidenciasIncompletas = incumplimientos => {
  const resumen = incumplimientos
    .map(i => `${i.tipo_equipo} (${i.falta === 'EVIDENCIA'
      ? 'falta evidencia'
      : 'faltan observaciones'})`)
    .join(' · ');

  const error = new ValidationError(
    `No se puede cerrar la orden: ${incumplimientos.length} apartado(s) sin su sustento `
    + `completo. ${resumen}`,
    409,
    CODIGOS_EVIDENCIA.EVIDENCIAS_INCOMPLETAS
  );

  error.incumplimientos = incumplimientos;

  return error;
};

// Lo que publica el GET de evidencias. El public_id NO sale nunca: el cliente recibe la
// ruta INTERNA del ERP con la que pedir la imagen, y nada mas.
export const presentarEvidencia = (
  evidencia,
  rutaBase
) => ({
  id: evidencia.id,
  detalle_id: evidencia.detalle_id,
  tipo_equipo: evidencia.tipo_equipo,
  formato: evidencia.formato,
  bytes: evidencia.bytes,
  ancho: evidencia.ancho,
  alto: evidencia.alto,
  created_at: evidencia.created_at,
  subida_por: evidencia.subida_por_id === null
    ? null
    : {
      id: evidencia.subida_por_id,
      username: evidencia.subida_por_username ?? null,
      nombre: evidencia.subida_por_nombre ?? null
    },
  imagen: `${rutaBase}/${evidencia.id}/imagen`
});
