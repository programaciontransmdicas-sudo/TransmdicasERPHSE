// ==========================================
// PROGRAMACION DE MANTENIMIENTO (TI-PR-01)
// Reglas de negocio y normalización. No conoce HTTP ni SQL.
// ==========================================
//
// TODO LO QUE HAY AQUI SE MIDIO CONTRA EL MODELO, no se dedujo de memoria. Las
// transiciones se probaron una por una con fixtures en BEGIN ... ROLLBACK antes de escribir
// este archivo, y lo que la base acepta o rechaza está anotado en cada regla.
//
// -------------------------------------------------------------------------------------
// REPROGRAMAR
// -------------------------------------------------------------------------------------
// Cambia UNA sola columna: quincena_reprogramada. quincena_programada es la identidad
// histórica de la obligación y la congela la regla R3 de 20260928_016 -medido: el UPDATE
// se rechaza con "no admite cambiar su identidad original"-.
//
// quincena_efectiva es GENERATED ALWAYS AS COALESCE(quincena_reprogramada,
// quincena_programada) STORED, así que se mueve sola y no se escribe nunca.
//
// Lo que la base ya protege, y por tanto NO se duplica aquí:
//   · día 1 o 16            chk_programacion_quincena_reprogramada (23514)
//   · OT no anulada         regla de 013, viva en 016 (P0001)
//   · colisión de slot      uq_programacion_unidad_quincena_efectiva (23505)
// Se valida el día aquí ADEMAS, solo para contestar un 400 legible en vez de un 23514.
//
// EL ESTADO. La base NO lo fuerza: medido, se puede escribir quincena_reprogramada
// dejando el estado en PROGRAMADO. Pero el modelo sí dice cuál es el estado de una visita
// reprogramada: 20260928_016 enumera las transiciones administrativas que existen como
// "PROYECTADO -> PROGRAMADO, PROGRAMADO <-> REPROGRAMADO, y la cancelacion", y tanto 015
// como 016 dicen que REPROGRAMADO "se alcanza modificando una programacion que ya existe".
// GENERADOR.md lo remata: la obligación espera "hasta que se ejecute o se reprograme
// formalmente (quincena_reprogramada, conservando quincena_programada)". Por eso esta capa
// escribe estado = 'REPROGRAMADO' junto con la quincena.
//
// -------------------------------------------------------------------------------------
// PROMOVER · PROYECTADO -> PROGRAMADO
// -------------------------------------------------------------------------------------
// Confirma una visita que el generador solo habia proyectado. NO crea nada: el id, el
// programa, la unidad, las tres quincenas y los equipos previstos son los mismos. Cambia
// el estado y nada mas.
//
// Es la transicion que 20260928_016 enumera primero -"PROYECTADO -> PROGRAMADO,
// PROGRAMADO <-> REPROGRAMADO, y la cancelacion"- y la que 014 exige para poder abrir una
// OT: "PROYECTADO es unicamente la proyeccion automatica del programa y no representa una
// intervencion autorizada; la promocion a PROGRAMADO es el acto humano que la habilita".
//
// PROGRAMADO -> PROGRAMADO se atiende sin tocar la base, igual que CANCELADO -> CANCELADO:
// medido, set_updated_at usa CURRENT_TIMESTAMP, asi que un UPDATE redundante SI avanzaria
// updated_at fuera de una transaccion. Cortocircuitar es la unica forma de que la
// operacion idempotente no deje rastro.
//
// Desde REPROGRAMADO se rechaza: este endpoint no deshace una reprogramacion. Desde
// CANCELADO y desde los cuatro resultados tambien, porque son historicos.
//
// -------------------------------------------------------------------------------------
// CANCELAR
// -------------------------------------------------------------------------------------
// Cambia solo el estado a CANCELADO. No borra la fila ni sus equipos previstos: son la
// evidencia de qué quedó materializado. Medido: los 4 detalles siguen ahí tras cancelar.
//
// El índice parcial uq_programacion_unidad_quincena_efectiva excluye CANCELADO, así que
// cancelar libera el slot de la quincena y habilita una sustituta. Medido.
//
// Lo que la base protege: CANCELADO es terminal -no vuelve a ningún estado activo- y no se
// puede cancelar con una OT no anulada, ni ABIERTA ni CERRADA. Medido las tres.

import {
  ValidationError,
  normalizarId,
  normalizarTextoObligatorio
} from '../comun.js';

// chk_programacion_mantenimiento_estado, en el orden del dominio.
export const ESTADOS = [
  'PROYECTADO',
  'PROGRAMADO',
  'EJECUTADO',
  'EJECUTADO_PARCIAL',
  'NO_EJECUTADO',
  'NO_APLICA',
  'REPROGRAMADO',
  'CANCELADO'
];

// Los cuatro RESULTADOS: solo los escribe cerrar_orden_trabajo(). Ninguna operación de
// esta capa puede producirlos.
export const RESULTADOS = [
  'EJECUTADO',
  'EJECUTADO_PARCIAL',
  'NO_EJECUTADO',
  'NO_APLICA'
];

// Las dos únicas puntas de la transición administrativa que 016 enumera para reprogramar:
// PROGRAMADO <-> REPROGRAMADO.
export const ESTADOS_REPROGRAMABLES = [
  'PROGRAMADO',
  'REPROGRAMADO'
];

// Medido: la base acepta cancelar desde PROYECTADO, PROGRAMADO y REPROGRAMADO, y rechaza
// desde CANCELADO -terminal- y desde cualquier resultado, porque un resultado implica una
// OT cerrada y la regla A congela el estado.
export const ESTADOS_CANCELABLES = [
  'PROYECTADO',
  'PROGRAMADO',
  'REPROGRAMADO'
];

// La promocion solo parte de PROYECTADO. PROGRAMADO no entra en la lista a proposito: ese
// caso se atiende antes de llegar a la base, para no mover updated_at sin necesidad.
export const ESTADOS_PROGRAMABLES = [
  'PROYECTADO'
];

export const ESTADO_CANCELADO = 'CANCELADO';
export const ESTADO_REPROGRAMADO = 'REPROGRAMADO';
export const ESTADO_PROGRAMADO = 'PROGRAMADO';
export const ESTADO_PROYECTADO = 'PROYECTADO';

const esQuincena = texto =>
  /^\d{4}-\d{2}-\d{2}$/.test(texto);

// Espejo de chk_programacion_quincena_reprogramada: el día tiene que ser 1 o 16. Se valida
// aquí para dar un 400 con el motivo en vez de dejar que la base conteste con un 23514
// ilegible. La base sigue siendo la autoridad.
export const normalizarQuincena = (
  campo,
  valor
) => {
  if (typeof valor !== 'string') {
    throw new ValidationError(
      `${campo} es obligatoria y debe ser una fecha AAAA-MM-DD`
    );
  }

  const texto = valor.trim();

  if (!esQuincena(texto)) {
    throw new ValidationError(
      `${campo} debe tener el formato AAAA-MM-DD`
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
      `${campo} ${texto} no es una fecha válida`
    );
  }

  if (dia !== 1 && dia !== 16) {
    throw new ValidationError(
      `${campo} debe caer el día 1 o el día 16: es una quincena administrativa, `
      + 'no una fecha libre'
    );
  }

  return texto;
};

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

const normalizarQuincenaOpcional = (
  campo,
  valor
) => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  return normalizarQuincena(campo, valor);
};

// Los cuatro filtros que el modelo soporta limpiamente: estado -dominio del CHECK-, placa
// -la lleva la unidad-, y quincena efectiva exacta o por rango, que es la columna generada
// sobre la que ya existe el índice parcial.
//
// desplazamiento y limite no son filtros: son paginación defensiva. Una corrida del
// generador materializa cientos de visitas, y devolverlas todas sin tope sería un defecto.
export const normalizarFiltros = (
  query = {}
) => {
  const desde = normalizarQuincenaOpcional(
    'desde',
    query.desde
  );

  const hasta = normalizarQuincenaOpcional(
    'hasta',
    query.hasta
  );

  if (desde && hasta && hasta < desde) {
    throw new ValidationError(
      'hasta no puede ser anterior a desde'
    );
  }

  const quincena = normalizarQuincenaOpcional(
    'quincena_efectiva',
    query.quincena_efectiva
  );

  if (quincena && (desde || hasta)) {
    throw new ValidationError(
      'quincena_efectiva y el rango desde/hasta son excluyentes: usa uno de los dos'
    );
  }

  const entero = (campo, valor, def, max) => {
    if (
      valor === null ||
      valor === undefined ||
      valor === ''
    ) {
      return def;
    }

    const n = Number.parseInt(valor, 10);

    if (
      !Number.isInteger(n) ||
      n < 0 ||
      String(valor).trim() !== String(n)
    ) {
      throw new ValidationError(
        `${campo} debe ser un entero no negativo`
      );
    }

    if (max !== undefined && n > max) {
      throw new ValidationError(
        `${campo} no puede superar ${max}`
      );
    }

    return n;
  };

  return {
    estado: normalizarDeDominio(
      'estado',
      query.estado,
      ESTADOS
    ),
    placa: query.placa
      ? String(query.placa).trim().toUpperCase()
      : null,
    quincena_efectiva: quincena,
    desde,
    hasta,
    limite: entero('limite', query.limite, 500, 1000),
    desplazamiento: entero(
      'desplazamiento',
      query.desplazamiento,
      0
    )
  };
};

// =====================================================================================
// EL MOTIVO ADMINISTRATIVO · F4.3
// =====================================================================================
// Cancelar y reprogramar son las DOS operaciones que alteran formalmente la planificacion
// de una visita, asi que las dos exigen motivo. Decision de negocio del 2026-10-09.
//
// UNA SOLA FUENTE OPERATIVA, y hay que ser preciso porque en este dominio ya existe otro
// campo que se llama parecido:
//
//   ordenes_trabajo.motivo_anulacion   es de la ORDEN DE TRABAJO. Columna propia, con su
//                                      CHECK chk_ot_anulacion, obligatoria al anular una OT.
//                                      NO se toca y NO se mezcla con esto.
//   programacion_mantenimiento.observaciones  es de la VISITA. Aqui se anota la accion
//                                      administrativa sobre la visita: cancelarla o moverla.
//
// Son dos hechos distintos sobre dos entidades distintas -desistir de una orden frente a
// alterar la planificacion de la obligacion-, y cada uno vive en su tabla.
//
// POR QUE observaciones Y NO UNA COLUMNA NUEVA: la columna ya existe, es `text` y es
// nullable; el unico escritor hasta ahora era el generador, con su nota de proyeccion, que
// NO se pierde porque la anotacion se APILA. Una columna `motivo_cancelacion` solo serviria
// para la cancelacion y dejaria la reprogramacion sin sitio, o exigiria dos columnas mas y
// una migracion. Y el antes/despues completo sigue yendo a audit_logs por el mecanismo que
// ya existe, que es la traza inmutable; observaciones es la traza OPERATIVA, la que el
// operador lee en la propia visita.
export const TIPO_NOTA = {
  CANCELACION: 'CANCELACION',
  REPROGRAMACION: 'REPROGRAMACION'
};

const MOTIVO_OBLIGATORIO =
  'motivo es obligatorio: cancelar y reprogramar alteran formalmente la planificación '
  + 'de la visita y tienen que quedar trazables en ella';

// Mismo criterio que motivo_anulacion en las ordenes: la columna destino es `text` sin
// longitud maxima, asi que no se inventa un tope. Se reutiliza el normalizador del modulo
// -exige string y rechaza el vacio tras recortar- en vez de duplicar esa comprobacion.
const normalizarMotivo = valor => {
  if (typeof valor !== 'string') {
    throw new ValidationError(
      MOTIVO_OBLIGATORIO
    );
  }

  return normalizarTextoObligatorio(
    'motivo',
    valor,
    Number.POSITIVE_INFINITY
  );
};

export const prepararReprogramacion = datos => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      'Datos de la reprogramación no válidos'
    );
  }

  const admitidos = [
    'quincena_reprogramada',
    'motivo'
  ];

  const rechazados = Object.keys(datos)
    .filter(
      campo => !admitidos.includes(campo)
    );

  if (rechazados.length > 0) {
    throw new ValidationError(
      `Estos campos no se aceptan al reprogramar: ${rechazados.join(', ')}. `
      + `Admitidos: ${admitidos.join(', ')}. `
      + 'quincena_programada es la identidad histórica de la obligación y es inmutable; '
      + 'quincena_efectiva se calcula sola; el resultado y el día físico solo los escribe '
      + 'el cierre de la orden de trabajo.'
    );
  }

  return {
    quincena_reprogramada: normalizarQuincena(
      'quincena_reprogramada',
      datos.quincena_reprogramada
    ),
    motivo: normalizarMotivo(datos.motivo)
  };
};

// Cancelar no admitia cuerpo: ahora exige EXACTAMENTE uno, { motivo }. Cancelar es la unica
// operacion que devuelve la obligacion al generador -cargarMaterializadas excluye CANCELADO,
// asi que la obligacion vuelve a estar descubierta y puede nacer una sustituta-, de modo que
// dejarla sin constancia era el hueco mas grave de los dos.
export const prepararCancelacion = datos => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      'Datos de la cancelación no válidos'
    );
  }

  const admitidos = ['motivo'];

  const rechazados = Object.keys(datos)
    .filter(
      campo => !admitidos.includes(campo)
    );

  if (rechazados.length > 0) {
    throw new ValidationError(
      `Estos campos no se aceptan al cancelar: ${rechazados.join(', ')}. `
      + `Admitidos: ${admitidos.join(', ')}. `
      + 'Cancelar cambia únicamente el estado de la visita: no borra la fila, no toca sus '
      + 'equipos previstos, no mueve ciclos ni anclas y no altera ninguna quincena.'
    );
  }

  return {
    motivo: normalizarMotivo(datos.motivo)
  };
};

// Los bloqueos se calculan UNA vez y se usan en dos sitios: el GET de detalle los expone y
// los dos PATCH los aplican. Una sola implementación de la regla.
export const bloqueos = visita => {
  const motivos = {
    programar: null,
    reprogramar: null,
    cancelar: null
  };

  if (visita.estado === ESTADO_CANCELADO) {
    motivos.programar =
      'La visita está CANCELADA: es histórica y no vuelve a un estado activo';
    motivos.reprogramar =
      'La visita está CANCELADA: es histórica y no vuelve a un estado activo';
    motivos.cancelar = null;
  } else if (RESULTADOS.includes(visita.estado)) {
    motivos.programar =
      `La visita tiene un resultado histórico (${visita.estado}) y no se programa`;
    motivos.reprogramar =
      `La visita tiene un resultado histórico (${visita.estado}) y no se reprograma`;
    motivos.cancelar =
      `La visita tiene un resultado histórico (${visita.estado}) y no se cancela`;
  } else if (visita.estado === ESTADO_REPROGRAMADO) {
    motivos.programar =
      'La visita está REPROGRAMADA: este endpoint no deshace una reprogramación';
  } else if (visita.estado === ESTADO_PROGRAMADO) {
    motivos.programar = 'La visita ya está PROGRAMADA';
  }

  if (
    !ESTADOS_REPROGRAMABLES.includes(visita.estado) &&
    motivos.reprogramar === null
  ) {
    motivos.reprogramar =
      `Una visita en ${visita.estado} todavía no es una obligación confirmada: `
      + 'promuévela a PROGRAMADO antes de reprogramarla';
  }

  if (visita.ot_no_anuladas > 0) {
    const detalle =
      `tiene ${visita.ot_no_anuladas} orden(es) de trabajo no anulada(s)`;

    motivos.programar = motivos.programar
      ?? `La visita ${detalle}: anula la OT antes de confirmarla`;

    motivos.reprogramar = motivos.reprogramar
      ?? `La visita ${detalle}: anula la OT antes de reprogramar`;

    motivos.cancelar = motivos.cancelar
      ?? `La visita ${detalle}: anula la OT antes de cancelar`;
  }

  return {
    puede_programar: motivos.programar === null,
    motivo_programar: motivos.programar,
    puede_reprogramar: motivos.reprogramar === null,
    motivo_reprogramar: motivos.reprogramar,
    puede_cancelar:
      motivos.cancelar === null &&
      visita.estado !== ESTADO_CANCELADO,
    motivo_cancelar:
      visita.estado === ESTADO_CANCELADO
        ? 'La visita ya está CANCELADA'
        : motivos.cancelar
  };
};

// =====================================================================================
// DESTINOS DE REPROGRAMACION · F4.2
// =====================================================================================
// EL PROBLEMA QUE RESUELVE. La cadencia regular es quincenal, asi que una unidad con
// CAMARAS/COPILOTO/RADIO_BASE ocupa TODAS las quincenas materializadas. Medido en
// db-refactor: 145 de 161 unidades ocupan las 6 de 6, y 870 de las 886 visitas no tienen
// ningun destino libre. El indice uq_programacion_unidad_quincena_efectiva -una visita
// activa por unidad y quincena, excluyendo CANCELADO- rechazaba esos movimientos con un
// 23505, pero la UI los seguia ofreciendo.
//
// LA REGLA ADOPTADA. Una visita solo se reprograma a una quincena que cumpla las cuatro:
//
//   1. pertenece al PERIODO de la version aplicable del programa    <- el limite, no un K fijo
//   2. no ha CERRADO todavia respecto a la fecha de negocio
//   3. no la ocupa otra visita ACTIVA de la misma unidad
//   4. no es la quincena efectiva actual de la propia visita
//
// LO QUE ESTA REGLA NO HACE, a proposito: no cancela la ocupante, no intercambia dos
// visitas, no fusiona alcances y no ofrece nada fuera del periodo.
//
// EL INDICE SIGUE SIENDO LA ULTIMA DEFENSA. Esto valida ANTES del UPDATE para dar un motivo
// legible, no para sustituir al indice: entre la lectura y la escritura cabe una carrera, y
// quien la cierra es el 23505, que se traduce igual que antes.
//
// POR QUE EL CIERRE Y NO EL ANCLA. Una quincena es un INTERVALO: anclada en dia 1 cierra el
// 15, anclada en 16 cierra el ultimo dia del mes. Comparar el ancla con hoy daria por pasada
// la quincena que esta corriendo -hoy 2026-10-09 descartaria 2026-10-01-, que es justo la
// que mas se reprograma. Es la misma derivacion que ya hace quincenaDe().fin en el cliente;
// aqui se publica calculada para que el cliente no tenga que reconstruirla.
export const cierreDeQuincena = quincena => {
  const [
    anio,
    mes,
    dia
  ] = quincena
    .split('-')
    .map(Number);

  if (dia === 1) {
    return `${quincena.slice(0, 8)}15`;
  }

  // Dia 0 del mes siguiente es el ultimo del mes en curso. Con Date.UTC, nunca local.
  const ultimo = new Date(
    Date.UTC(anio, mes, 0)
  ).getUTCDate();

  return `${quincena.slice(0, 8)}${ultimo}`;
};

const DOS_DIGITOS = numero =>
  String(numero).padStart(2, '0');

// Las quincenas ancladas a dia 1 y 16 que caen dentro de [inicio, fin], ambos INCLUSIVE.
// Comparacion de texto ISO, que para AAAA-MM-DD es la misma que la cronologica y no pasa
// por Date: una fecha ISO convertida a Date se desplaza con la zona horaria.
//
// SIN K CONFIGURABLE. El limite es el periodo de la version y nada mas. El tope de
// iteraciones es solo una guarda: un periodo corrupto no debe colgar el proceso.
const MAXIMO_MESES = 240;

export const quincenasDelPeriodo = (
  inicio,
  fin
) => {
  const esFecha = valor =>
    typeof valor === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(valor);

  if (
    !esFecha(inicio) ||
    !esFecha(fin) ||
    fin < inicio
  ) {
    return [];
  }

  const quincenas = [];

  let [
    anio,
    mes
  ] = inicio
    .split('-')
    .map(Number);

  for (
    let i = 0;
    i < MAXIMO_MESES &&
    `${anio}-${DOS_DIGITOS(mes)}-01` <= fin;
    i += 1
  ) {
    for (const dia of ['01', '16']) {
      const quincena =
        `${anio}-${DOS_DIGITOS(mes)}-${dia}`;

      if (
        quincena >= inicio &&
        quincena <= fin
      ) {
        quincenas.push(quincena);
      }
    }

    mes += 1;

    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }

  return quincenas;
};

// El texto EXACTO que la UI tiene que mostrar cuando no queda ningun destino. Vive aqui, no
// en el cliente, porque es parte de la respuesta del backend.
export const MENSAJE_SIN_DESTINOS =
  'No hay quincenas disponibles para reprogramar dentro de la versión vigente.';

export const CODIGOS_DESTINO = {
  ACTUAL: 'DESTINO_ES_LA_QUINCENA_ACTUAL',
  PASADO: 'DESTINO_PASADO',
  OCUPADO: 'DESTINO_OCUPADO',
  FUERA_DE_PERIODO: 'DESTINO_FUERA_DE_PERIODO'
};

export const DESCRIPCION_REGLA =
  'Una visita solo se reprograma a una quincena libre de su propia unidad, dentro del '
  + 'periodo de la versión aplicable del programa, que no haya cerrado ya y que no sea su '
  + 'quincena efectiva actual. La quincena ocupada no se libera cancelando automáticamente '
  + 'a quien la ocupa, y no existe intercambio entre dos visitas.';

// EL CATALOGO. Una sola funcion pura construye la lista, y de ella salen LAS DOS cosas: lo
// que publica el GET y lo que valida el PATCH. No hay dos implementaciones de la regla.
//
// `ocupadas` son las visitas ACTIVAS de la MISMA unidad distintas de esta, tal como las lee
// el repositorio. La propia visita no entra, asi que su quincena no aparece como ocupada
// por otra: la descarta la regla 4, que es mas informativa.
export const catalogoDeDestinos = ({
  visita,
  version,
  fechaNegocio,
  ocupadas = []
}) => {
  const actual =
    visita.quincena_efectiva ??
    visita.quincena_programada;

  const periodoInicio = version
    ? version.periodo_inicio
    : null;

  const periodoFin = version
    ? version.periodo_fin
    : null;

  // Los dos casos en los que no hay periodo que recorrer. No se inventa un rango: se dice
  // que no lo hay. periodo_inicio/periodo_fin son NULLABLE en el DDL.
  const detalle = !version
    ? 'El programa no tiene ninguna versión aplicable en la fecha de negocio, así que no '
      + 'hay periodo que delimite los destinos.'
    : (!periodoInicio || !periodoFin)
        ? `La versión ${version.version} no tiene periodo_inicio/periodo_fin definidos, así `
          + 'que no hay periodo que delimite los destinos.'
        : null;

  const quincenas = detalle === null
    ? quincenasDelPeriodo(periodoInicio, periodoFin)
    : [];

  const porQuincena = new Map(
    ocupadas.map(
      o => [o.quincena_efectiva, o]
    )
  );

  const destinos = quincenas.map(quincena => {
    const cierre = cierreDeQuincena(quincena);

    const base = {
      quincena,
      cierre,
      disponible: false,
      motivo: null,
      code: null,
      ocupada_por: null
    };

    if (quincena === actual) {
      return {
        ...base,
        motivo:
          `${quincena} es la quincena efectiva actual de la visita: reprogramar exige `
          + 'una quincena distinta',
        code: CODIGOS_DESTINO.ACTUAL
      };
    }

    if (cierre < fechaNegocio) {
      return {
        ...base,
        motivo:
          `La quincena ${quincena} cerró el ${cierre} y la fecha de negocio es `
          + `${fechaNegocio}: no se reprograma al pasado`,
        code: CODIGOS_DESTINO.PASADO
      };
    }

    const ocupante = porQuincena.get(quincena);

    if (ocupante) {
      return {
        ...base,
        motivo:
          `La visita #${ocupante.id} de ${ocupante.placa} (${ocupante.estado}) ya ocupa `
          + `${quincena} para esta unidad. No se cancela automáticamente: si de verdad esa `
          + 'visita no se va a ejecutar, cancélala tú y la quincena queda libre',
        code: CODIGOS_DESTINO.OCUPADO,
        ocupada_por: {
          id: ocupante.id,
          placa: ocupante.placa,
          estado: ocupante.estado
        }
      };
    }

    return {
      ...base,
      disponible: true
    };
  });

  const disponibles = destinos.filter(
    d => d.disponible
  ).length;

  return {
    quincena_actual: actual,
    fecha_negocio: fechaNegocio,
    version: version
      ? {
        id: version.id,
        version: version.version,
        estado: version.estado,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin
      }
      : null,
    regla: DESCRIPCION_REGLA,
    total: destinos.length,
    disponibles,
    mensaje: disponibles === 0
      ? MENSAJE_SIN_DESTINOS
      : null,
    detalle: disponibles === 0
      ? detalle ?? 'Todas las quincenas del periodo están ocupadas por otras visitas '
        + 'activas de esta unidad, ya cerraron, o son la quincena actual de la visita.'
      : null,
    destinos
  };
};

// LA PUERTA DEL PATCH. Consulta el MISMO catalogo que publica el GET, asi que la UI no puede
// ofrecer un destino que esta funcion rechace, ni al contrario.
//
// 409 y no 400 en los cuatro casos: la peticion esta bien formada -el formato y el dia 1/16
// ya los valido normalizarQuincena- y lo que falla es el estado del mundo, igual que el 409
// que ya daba el indice. Cada rechazo lleva su `code` para que el cliente lo distinga sin
// interpretar el texto.
export const validarDestino = (
  quincena,
  catalogo
) => {
  const destino = catalogo.destinos.find(
    d => d.quincena === quincena
  );

  if (!destino) {
    const periodo = catalogo.version
      ? `${catalogo.version.periodo_inicio} .. ${catalogo.version.periodo_fin}`
      : 'sin versión aplicable';

    throw new ValidationError(
      `La quincena ${quincena} no pertenece al periodo de la versión aplicable del `
      + `programa (${periodo}). ${catalogo.detalle ?? ''}`.trim(),
      409,
      CODIGOS_DESTINO.FUERA_DE_PERIODO
    );
  }

  if (!destino.disponible) {
    throw new ValidationError(
      destino.motivo,
      409,
      destino.code
    );
  }

  return destino;
};

// =====================================================================================
// ORIENTACION CUANDO NO HAY NINGUN DESTINO · F4.3
// =====================================================================================
// POR QUE EXISTE ESTO. La cadencia del M1 regular es de UNA quincena -medido en
// programa_mantenimiento_frecuencias: CAMARAS/COPILOTO/RADIO_BASE M1 = 1, M2 = 6, M3 = 12,
// GPS/ADAS M3 = 24-, asi que una unidad con cualquier familia regular instalada tiene una
// obligacion en TODAS las quincenas, de todo periodo. El conjunto "quincenas libres de esa
// unidad" es vacio POR CONSTRUCCION de la cadencia, no por el tamano del horizonte.
//
// Medido sobre las 886 visitas reales: 870 no tienen ningun destino libre y 16 -las de
// unidades solo-anualidad, cuya cadencia si deja huecos- tienen 5.
//
// Es decir: para una obligacion regular, "mover la visita a otra quincena" NO es la
// operacion que el operador necesita, porque la quincena de destino ya debe su propio M1.
// Lo que necesita es una de estas dos, y las DOS ya existen completas en el modelo:
//
//   el trabajo se hara tarde  -> mantener la visita y cerrar la OT con la fecha fisica real.
//                                cerrar_orden_trabajo NO exige que la fecha caiga dentro de
//                                quincena_efectiva: el ciclo avanza con la quincena
//                                ADMINISTRATIVA y fecha_ejecucion guarda el dia fisico.
//   el trabajo no se hizo     -> cerrar la OT con el resultado que corresponda. Los ciclos
//                                no avanzan y la obligacion sigue debida.
//
// LO QUE ESTA FUNCION NO HACE: no ofrece cancelar a la visita OCUPANTE, no propone
// intercambio, no sugiere ampliar el periodo y no inventa ninguna regla. Solo redacta, a
// partir del catalogo que F4.2 ya calculo y de bloqueos(), que caminos quedan abiertos.
//
// `estadosQueAdmitenOt` llega COMO PARAMETRO y no se importa: su dueno es el modulo de
// ordenes -ESTADOS_QUE_ADMITEN_OT, la traduccion de validar_apertura_ot-, y traerlo aqui
// acoplaria este service a su hermano para copiar dos cadenas. El controller, que ya
// orquesta las dos capas, lo pasa.
export const SITUACION = {
  SIN_PERIODO: 'SIN_PERIODO_APLICABLE',
  UNIDAD_SATURADA: 'UNIDAD_CON_OBLIGACION_EN_TODAS_LAS_QUINCENAS',
  SIN_QUINCENAS_VIGENTES: 'SIN_QUINCENAS_VIGENTES_EN_EL_PERIODO'
};

export const VIA = {
  EJECUTAR_TARDE: 'EJECUTAR_TARDE',
  REGISTRAR_RESULTADO: 'REGISTRAR_RESULTADO',
  CANCELAR: 'CANCELAR'
};

export const orientacionSinDestinos = ({
  visita,
  catalogo,
  permiso,
  estadosQueAdmitenOt = []
}) => {
  const ocupadas = catalogo.destinos.filter(
    d => d.code === CODIGOS_DESTINO.OCUPADO
  ).length;

  const pasadas = catalogo.destinos.filter(
    d => d.code === CODIGOS_DESTINO.PASADO
  ).length;

  const situacion = catalogo.total === 0
    ? SITUACION.SIN_PERIODO
    : ocupadas > 0
      ? SITUACION.UNIDAD_SATURADA
      : SITUACION.SIN_QUINCENAS_VIGENTES;

  // Las dos vias de ejecucion dependen de lo mismo: que exista una OT con la que registrar
  // el hecho. O ya hay una abierta, o la visita esta en un estado que admite abrirla.
  const tieneOtAbierta = visita.ot_abiertas > 0;

  const puedeAbrirOt =
    estadosQueAdmitenOt.includes(visita.estado) &&
    visita.ot_no_anuladas === 0;

  const viaDeEjecucion = tieneOtAbierta || puedeAbrirOt;

  const requisitoEjecucion = viaDeEjecucion
    ? null
    : estadosQueAdmitenOt.includes(visita.estado)
      ? 'La visita ya tiene una orden de trabajo no anulada que no está abierta: su '
        + 'resultado es histórico.'
      : `Una visita en ${visita.estado} no admite abrir una orden de trabajo: solo `
        + `${estadosQueAdmitenOt.join(' o ')}.`;

  const resumen = {
    [SITUACION.UNIDAD_SATURADA]:
      `Esta unidad tiene obligación de mantenimiento en todas las quincenas disponibles `
      + `del periodo: ${ocupadas} de las ${catalogo.total} ya están ocupadas por otras `
      + `visitas activas suyas`
      + (pasadas > 0
        ? ` y ${pasadas} ya cerraron.`
        : '.'),
    [SITUACION.SIN_QUINCENAS_VIGENTES]:
      `Ninguna quincena del periodo sigue vigente: de las ${catalogo.total} del periodo, `
      + `${pasadas} ya cerraron respecto a la fecha de negocio ${catalogo.fecha_negocio}.`,
    [SITUACION.SIN_PERIODO]:
      'No hay periodo aplicable del que tomar quincenas de destino.'
  }[situacion];

  const porQue = situacion === SITUACION.UNIDAD_SATURADA
    ? 'No corresponde mover una obligación regular a una quincena ocupada: esa quincena '
      + 'ya debe su propio mantenimiento, y juntarlas sería fusionar dos obligaciones '
      + 'distintas en una sola visita.'
    : 'Reprogramar solo mueve la quincena efectiva dentro del periodo de la versión '
      + 'aplicable, y no quedan quincenas válidas donde moverla.';

  return {
    situacion,
    resumen,
    por_que: porQue,
    quincenas_ocupadas: ocupadas,
    quincenas_cerradas: pasadas,
    vias: [
      {
        clave: VIA.EJECUTAR_TARDE,
        titulo: 'El trabajo se hará tarde: mantener la visita y registrar la ejecución real',
        detalle:
          'No hace falta mover nada. Se abre la orden de trabajo sobre esta misma visita y '
          + 'se cierra con la fecha física real del día en que se ejecutó. La quincena '
          + 'administrativa no se mueve: quincena_programada y quincena_efectiva siguen '
          + 'siendo las de la obligación original, fecha_ejecucion guarda el día real, y el '
          + 'ciclo avanza con la quincena administrativa.',
        disponible: viaDeEjecucion,
        requisito: requisitoEjecucion,
        accion: tieneOtAbierta
          ? 'CERRAR_OT_ABIERTA'
          : puedeAbrirOt
            ? 'ABRIR_OT'
            : null
      },
      {
        clave: VIA.REGISTRAR_RESULTADO,
        titulo: 'No se hizo: registrar el resultado que corresponda en la orden de trabajo',
        detalle:
          'Si el mantenimiento correspondía y no se ejecutó, se cierra la orden con los '
          + 'equipos sin avance y el resultado queda NO_EJECUTADO: los ciclos no avanzan y '
          + 'la obligación sigue debida. NO_APLICA es distinto y se reserva para cuando el '
          + 'mantenimiento realmente no correspondía; no es un equivalente de «no se hizo».',
        disponible: viaDeEjecucion,
        requisito: requisitoEjecucion,
        accion: tieneOtAbierta
          ? 'CERRAR_OT_ABIERTA'
          : puedeAbrirOt
            ? 'ABRIR_OT'
            : null
      },
      {
        clave: VIA.CANCELAR,
        titulo: 'Cancelar la visita, solo como acción explícita e independiente',
        detalle:
          'Cancelar no se ofrece desde aquí y no se hace automáticamente: es una acción '
          + 'aparte, desde el detalle de la visita que se vaya a cancelar, y exige motivo. '
          + 'Cancelar no elimina la obligación, solo la visita: la obligación vuelve a '
          + 'quedar descubierta para el generador, que podrá materializar una sustituta en '
          + 'la misma quincena. CANCELADO es terminal.',
        disponible: permiso.puede_cancelar,
        requisito: permiso.motivo_cancelar,
        accion: null
      }
    ]
  };
};

// =====================================================================================
// PROGRAMACION POR LOTE · F4.1
// =====================================================================================
// La regla de negocio NO es nueva y no se reimplementa: la decision por visita sigue
// saliendo de bloqueos(), exactamente igual que en el PATCH individual. Lo que se anade
// aqui es la aritmetica del lote -validar la lista de ids y clasificar las visitas-, que es
// lo unico que el caso individual no necesitaba.
//
// El lote es ATOMICO por decision de negocio: confirmar media seleccion dejaria al operador
// sin saber que quedo confirmado, y confirmar no se puede deshacer -no existe
// PROGRAMADO -> PROYECTADO, y el unico camino de vuelta es cancelar, que es terminal-.

// Tope del lote. El mayor lote natural es una quincena completa, hoy 152 visitas, y el
// programa entero son 886. Se fija en 1000 por el mismo criterio que el `limite` del
// listado: holgado para cualquier caso real y un freno frente a una peticion absurda.
export const MAXIMO_LOTE = 1000;

// `ids` debe ser un array no vacio de enteros positivos. Los duplicados NO se rechazan: se
// colapsan, porque pedir dos veces la misma visita en una seleccion no es un error del
// operador -una celda puede quedar marcada dos veces- y la intencion es inequivoca.
// Se devuelven ORDENADOS: ese mismo orden se usa para tomar los cerrojos, y un orden
// estable entre transacciones concurrentes es lo que evita un abrazo mortal.
export const prepararLote = datos => {
  if (
    !datos ||
    typeof datos !== 'object' ||
    Array.isArray(datos)
  ) {
    throw new ValidationError(
      'El cuerpo debe ser un objeto con la lista de visitas: { "ids": [1, 2, 3] }'
    );
  }

  const sobrantes = Object.keys(datos).filter(
    campo => campo !== 'ids'
  );

  if (sobrantes.length > 0) {
    throw new ValidationError(
      `Estos campos no se admiten al programar un lote: ${sobrantes.join(', ')}. `
      + 'Admitidos: ids. Programar no cambia la quincena ni ningún otro campo: '
      + 'solo confirma el estado de las visitas indicadas.'
    );
  }

  if (!Array.isArray(datos.ids)) {
    throw new ValidationError(
      'ids debe ser un array de identificadores de visita'
    );
  }

  if (datos.ids.length === 0) {
    throw new ValidationError(
      'ids no puede estar vacío: hay que indicar al menos una visita'
    );
  }

  if (datos.ids.length > MAXIMO_LOTE) {
    throw new ValidationError(
      `ids no puede superar ${MAXIMO_LOTE} visitas en un solo lote. `
      + 'Divide la selección por quincena.'
    );
  }

  // normalizarId ya exige entero positivo y rechaza decimales, texto y notacion rara. Se
  // reutiliza en vez de duplicar ese dominio, y el indice informa de QUE posicion falla.
  const normalizados = datos.ids.map(
    (valor, i) => normalizarId(`ids[${i}]`, valor)
  );

  const unicos = [...new Set(normalizados)].sort(
    (a, b) => a - b
  );

  return {
    ids: unicos,
    solicitados: normalizados.length,
    duplicados: normalizados.length - unicos.length
  };
};

// Repartir las visitas del lote en los tres destinos posibles. La condicion de cada una es
// la MISMA que usa el PATCH individual:
//
//   ya PROGRAMADO            -> idempotente: ni UPDATE ni auditoria, igual que el individual
//   bloqueos().puede_programar -> programable
//   el resto                 -> bloqueada, con el motivo que publica el propio backend
//
// `faltantes` recoge los ids que no aparecieron. No se distingue "no existe" de "es de otro
// programa" a proposito: es el mismo 404 que da el individual, y afinarlo filtraria la
// existencia de visitas de otros programas.
export const clasificarLote = (ids, visitas) => {
  const porId = new Map(
    visitas.map(v => [v.id, v])
  );

  const faltantes = ids.filter(
    id => !porId.has(id)
  );

  const yaProgramadas = [];
  const programables = [];
  const bloqueadas = [];

  for (const id of ids) {
    const visita = porId.get(id);

    if (!visita) continue;

    if (visita.estado === ESTADO_PROGRAMADO) {
      yaProgramadas.push(visita);
      continue;
    }

    const permiso = bloqueos(visita);

    if (permiso.puede_programar) {
      programables.push(visita);
    } else {
      bloqueadas.push({
        id: visita.id,
        placa: visita.placa,
        estado: visita.estado,
        quincena_efectiva: visita.quincena_efectiva,
        motivo: permiso.motivo_programar
      });
    }
  }

  return { faltantes, yaProgramadas, programables, bloqueadas };
};
