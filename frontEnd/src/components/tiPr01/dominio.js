// TI-PR-01 · DOMINIO
// ============================================================================
// Las constantes y derivaciones que la UI necesita. Nada de reglas nuevas: todo lo que
// está aquí sale del backend real o se deriva de lo que el backend devuelve.
//
// LAS DOS ESTRUCTURAS QUE NO SE MEZCLAN, igual que en generador-nucleo.mjs:
//   REGULARES  comparten UN nivel común por visita (M1 / M2 / M3)
//   ANUALES    GPS y ADAS, M3 cada 24 quincenas, independientes y ADICIONALES
//
// GPS y ADAS nunca elevan el nivel regular: una visita puede ser "M2 + GPS M3".

// 017 · DVR SALIO de las regulares programables. Decision de negocio del 2026-10-07: el
// DVR forma parte del sistema de CAMARAS y su mantenimiento queda contenido en esa familia.
// La migracion 20261007_017 retiro su frecuencia, sus ciclos y sus anclas, asi que el
// backend ya no puede publicar un detalle DVR en una visita nueva.
export const REGULARES = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
export const ANUALES = ['GPS', 'ADAS'];
export const ORDEN = { M1: 1, M2: 2, M3: 3 };
// Los tres niveles en orden. Mismo origen que ORDEN en el backend: Object.keys(ORDEN).
export const NIVELES = Object.keys(ORDEN);

export const ETIQUETA_EQUIPO = {
  // DVR se conserva SOLO para lectura: una OT historica puede traer un detalle DVR.
  // El inventario tiene un solo DVR por unidad. No cuenta como regular
  // nueva porque no esta en REGULARES, asi que esRegular('DVR') es false y alcanceDe() no
  // lo mete en el nivel comun.
  DVR: 'DVR',
  COPILOTO: 'Copiloto',
  RADIO_BASE: 'Radio base',
  CAMARAS: 'Cámaras',
  GPS: 'GPS',
  ADAS: 'ADAS'
};

export const esAnual = tipo => ANUALES.includes(tipo);
export const esRegular = tipo => REGULARES.includes(tipo);

// Como clasificar una familia que llega del backend. 'HISTORICA' existe por 017: una visita
// u orden anterior a esa migracion puede traer un detalle DVR, que ya no es regular ni
// anual. Llamarlo REGULAR seria afirmar que todavia se programa.
export const claseFamilia = tipo => {
  if (esAnual(tipo)) return 'ANUAL';
  if (esRegular(tipo)) return 'REGULAR';

  return 'HISTORICA';
};

// Los 8 estados del CHECK de programacion_mantenimiento.
export const ESTADOS_VISITA = [
  'PROYECTADO', 'PROGRAMADO', 'EJECUTADO', 'EJECUTADO_PARCIAL',
  'NO_EJECUTADO', 'NO_APLICA', 'REPROGRAMADO', 'CANCELADO'
];

// Los cuatro RESULTADOS: solo los escribe cerrar_orden_trabajo().
export const RESULTADOS = ['EJECUTADO', 'EJECUTADO_PARCIAL', 'NO_EJECUTADO', 'NO_APLICA'];

// ---------------------------------------------------------------------------
// ÓRDENES DE TRABAJO
// ---------------------------------------------------------------------------
// Los dos catálogos de la OT, en el orden del ciclo de vida. El backend los publica en
// cada listado (`estados` y `estados_detalle`), así que estas listas son solo el respaldo
// para cuando todavía no ha llegado ninguna respuesta: no son una fuente paralela.
export const ESTADOS_ORDEN = ['ABIERTA', 'CERRADA', 'ANULADA'];
export const ESTADOS_DETALLE_ORDEN = ['COMPLETADO', 'PARCIAL', 'PENDIENTE', 'NO_APLICA'];

// Los dos estados de visita que admiten abrir una OT, según validar_apertura_ot:
// «solo PROGRAMADO o REPROGRAMADO admiten abrir una OT».
export const ESTADOS_QUE_ADMITEN_OT = ['PROGRAMADO', 'REPROGRAMADO'];

// ---------------------------------------------------------------------------
// QUINCENAS
// ---------------------------------------------------------------------------
// NO hay lista fija: se construyen desde las quincenas efectivas que el backend devuelve.
// El ancla es día 1 o 16, que es la regla del modelo.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// '2026-10-16' -> { id, label '2Q Oct', inicio, fin }. Sin Date: una fecha ISO partida en
// tres evita que la zona horaria desplace el día.
export const quincenaDe = iso => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const [anio, mes, dia] = iso.split('-').map(Number);
  const primera = dia <= 15;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  return {
    id: iso,
    label: `${primera ? '1Q' : '2Q'} ${MESES[mes - 1].replace(/^./, c => c.toUpperCase())}`,
    labelLargo: `${primera ? '1ra' : '2da'} quincena de ${MESES[mes - 1]} ${anio}`,
    inicio: `${iso.slice(0, 8)}${primera ? '01' : '16'}`,
    fin: primera
      ? `${iso.slice(0, 8)}15`
      : `${iso.slice(0, 8)}${ultimoDia}`
  };
};

// Columnas de la matriz: las quincenas efectivas presentes en los datos, ordenadas.
// Si el backend no devuelve ninguna, no se inventa ninguna columna.
export const quincenasDe = visitas => {
  const vistas = new Set();

  for (const v of visitas) {
    const efectiva = v.quincena_efectiva ?? v.quincena_programada;
    if (efectiva) vistas.add(efectiva);
    if (v.quincena_programada && v.quincena_programada !== efectiva) vistas.add(v.quincena_programada);
    for (const ajuste of v.ajustes ?? []) {
      if (ajuste.tipo === 'REPROGRAMACION') {
        if (ajuste.origen) vistas.add(ajuste.origen);
        if (ajuste.destino) vistas.add(ajuste.destino);
      }
    }
  }

  return [...vistas]
    .sort()
    .map(quincenaDe)
    .filter(Boolean);
};

// ---------------------------------------------------------------------------
// ESTADO VISUAL DE UNA CELDA
// ---------------------------------------------------------------------------
// VENCIDA y EN_PROCESO no son estados del backend: se DERIVAN, igual que en el prototipo.
//   VENCIDA    la quincena efectiva ya cerró y la visita sigue sin resultado
//   EN_PROCESO la visita tiene una OT abierta
// La fecha de referencia es fecha_negocio del backend (America/Lima), nunca el reloj del
// navegador: el día de negocio de Perú puede no ser el del equipo del usuario.
export const estadoVisual = (visita, fechaNegocio) => {
  const estado = visita?.estado;

  if (estado === 'CANCELADO' || RESULTADOS.includes(estado)) return estado;

  const efectiva = visita.quincena_efectiva ?? visita.quincena_programada;
  const q = quincenaDe(efectiva);
  const cerrada = Boolean(q && fechaNegocio && q.fin < fechaNegocio);

  if (cerrada && estado !== 'REPROGRAMADO') return 'VENCIDA';
  if ((visita.ordenes_trabajo?.abiertas ?? 0) > 0) return 'EN_PROCESO';

  return estado;
};

// Clase de la celda según el estado visual. Los nombres vienen del prototipo.
export const CLASE_CELDA = {
  EJECUTADO: 'done',
  EJECUTADO_PARCIAL: 'partial',
  NO_EJECUTADO: 'cancel',
  NO_APLICA: 'cancel',
  CANCELADO: 'cancel',
  VENCIDA: 'late',
  EN_PROCESO: '',
  PROGRAMADO: '',
  PROYECTADO: ''
};

// Color del chip por estado, del prototipo.
export const CLASE_CHIP = {
  PROYECTADO: 'grey',
  PROGRAMADO: 'amber',
  EN_PROCESO: 'blue',
  EJECUTADO: 'green',
  EJECUTADO_PARCIAL: 'amber',
  NO_EJECUTADO: 'red',
  NO_APLICA: 'grey',
  REPROGRAMADO: 'blue',
  CANCELADO: 'grey',
  VENCIDA: 'red',
  ABIERTA: 'blue',
  CERRADA: 'green',
  ANULADA: 'grey',
  // Los cuatro estados de ordenes_trabajo_detalle, con los colores que les da el
  // prototipo en su mapa CLS.
  COMPLETADO: 'green',
  PARCIAL: 'amber',
  PENDIENTE: 'amber'
};

export const etiquetaEstado = estado =>
  String(estado ?? '—').replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// ALCANCE DE UNA VISITA
// ---------------------------------------------------------------------------
// Separa lo regular de lo anual leyendo equipos.items, que es la EVIDENCIA de lo que quedó
// materializado al crear la visita. No se recalcula con la frecuencia vigente.
//
// nivelRegular toma el nivel de las familias regulares. Si hubiera más de uno -que el
// generador no produce y 886 visitas proyectadas confirman- se devuelve `mezcla` para que
// la UI lo muestre como anomalía en vez de ocultarla eligiendo uno.
// El reparto es el mismo para la visita y para la OT; lo único que cambia es la columna
// que trae el nivel previsto. Se escribe una vez para que las dos pantallas no puedan
// divergir en la lectura del alcance.
const repartir = (items, nivelDe) => {
  const regulares = items.filter(e => esRegular(e.tipo_equipo));
  const anuales = items.filter(e => esAnual(e.tipo_equipo));
  const niveles = [...new Set(regulares.map(nivelDe))];

  return {
    regulares,
    anuales,
    nivelRegular: niveles.length === 1 ? niveles[0] : null,
    mezcla: niveles.length > 1 ? niveles.sort() : null,
    total: items.length
  };
};

export const alcanceDe = visita =>
  repartir(visita?.equipos?.items ?? [], e => e.nivel_mantenimiento);

// Alcance de una OT, leído de detalles.items. El nivel previsto viaja como
// `nivel_programado`, y el backend lo obtiene por JOIN contra
// programacion_mantenimiento_equipos.nivel_mantenimiento, que es la única fuente de verdad
// de lo previsto: ordenes_trabajo_detalle no lo duplica. No se recalcula nada aquí, es el
// alcance que la base congeló al abrir la orden.
export const alcanceDeOrden = orden =>
  repartir(orden?.detalles?.items ?? [], d => d.nivel_programado);

// Texto de la celda: el nivel regular, 'AN' si la quincena solo trae anualidad, '·' si no
// hay alcance. Mismo criterio que cellHtml() del prototipo.
export const textoCelda = alcance => {
  if (alcance.mezcla) return alcance.mezcla.join('/');
  if (alcance.nivelRegular) return alcance.nivelRegular;
  if (alcance.anuales.length) return 'AN';

  return '·';
};

// ---------------------------------------------------------------------------
// ¿ESTA VISITA ADMITE ABRIR UNA OT?
// ---------------------------------------------------------------------------
// `acciones` de una visita publica puede_programar, puede_reprogramar y puede_cancelar,
// pero NO un puede_abrir_ot: ese veredicto solo existe dentro de POST .../ordenes-trabajo,
// en bloqueosDeApertura() del backend.
//
// Esto NO inventa una regla nueva ni decide un permiso en el cliente: reproduce esa misma
// función con los TRES datos que la visita ya publica -estado, ordenes_trabajo.no_anuladas
// y equipos.total-, que son exactamente sus tres entradas, y repite sus mensajes para que
// el usuario lea lo mismo antes y después de pulsar. Sirve para no ofrecer un botón que el
// servidor va a rechazar; la autoridad final sigue siendo su 409, que se muestra tal cual.
//
// Si el backend añade algún día `puede_abrir_ot` a `acciones`, esto se borra y se consume
// el flag.
const MOTIVOS_APERTURA = {
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
    + 'cerrarse nunca.'
};

// ---------------------------------------------------------------------------
// HISTORIAL · F3
// ---------------------------------------------------------------------------
// Qué cuenta como HISTORIA y qué no. Esto no es una regla nueva: se apoya en que los cuatro
// RESULTADOS los escribe ÚNICAMENTE cerrar_orden_trabajo(), y en que una visita CANCELADA es
// histórica por definición del modelo -es terminal y no vuelve a un estado activo-.
//
// Lo que NO es historia: una visita PROYECTADO, PROGRAMADO o REPROGRAMADO sin orden. Esas
// son obligaciones futuras o pendientes, y meterlas aquí las presentaría como mantenimiento
// realizado, que es justo la mentira que esta pantalla debe evitar.
export const TIPOS_HISTORIAL = {
  EJECUTADA: 'EJECUTADA',
  EN_CURSO: 'EN_CURSO',
  ANULADA: 'ANULADA',
  CANCELADA: 'CANCELADA'
};

export const ETIQUETA_HISTORIAL = {
  EJECUTADA: 'Cerrada',
  EN_CURSO: 'En ejecución',
  ANULADA: 'Orden anulada',
  CANCELADA: 'Visita cancelada'
};

// Convierte una visita y sus órdenes en los HECHOS históricos que representan. Una visita
// puede dar más de una fila: una orden anulada y, después, la que la sustituyó.
//
// La fecha de cada hecho sale del dato que de verdad lo sitúa en el tiempo:
//   cerrada  -> visita.fecha_ejecucion, el día FÍSICO que escribió el cierre; si falta,
//               ot.fecha_cierre, que es cuando se registró
//   abierta  -> ot.fecha_apertura
//   anulada  -> ot.updated_at, porque ordenes_trabajo NO tiene columna de fecha de
//               anulación: se anota como aproximada en vez de inventarla
//   cancelada-> sin fecha; sitúa su quincena efectiva
export const hechosDeVisita = (visita, ordenes) => {
  const hechos = [];
  const propias = ordenes.filter(o => o.programacion_id === visita.id);

  for (const orden of propias) {
    if (orden.estado === 'CERRADA') {
      hechos.push({
        tipo: TIPOS_HISTORIAL.EJECUTADA,
        visita,
        orden,
        fecha: visita.fecha_ejecucion ?? null,
        fechaAproximada: !visita.fecha_ejecucion,
        sello: visita.fecha_ejecucion ?? orden.fecha_cierre ?? orden.fecha_apertura
      });
    } else if (orden.estado === 'ANULADA') {
      hechos.push({
        tipo: TIPOS_HISTORIAL.ANULADA,
        visita,
        orden,
        fecha: null,
        fechaAproximada: true,
        sello: orden.updated_at ?? orden.fecha_apertura
      });
    } else {
      hechos.push({
        tipo: TIPOS_HISTORIAL.EN_CURSO,
        visita,
        orden,
        fecha: null,
        fechaAproximada: false,
        sello: orden.fecha_apertura
      });
    }
  }

  // Una visita cancelada es una decisión tomada, y por tanto historia. Solo se añade si no
  // tiene ninguna orden que ya la cuente: con orden, el hecho es la orden.
  if (visita.estado === 'CANCELADO' && propias.length === 0) {
    hechos.push({
      tipo: TIPOS_HISTORIAL.CANCELADA,
      visita,
      orden: null,
      fecha: null,
      fechaAproximada: false,
      sello: visita.quincena_efectiva ?? visita.quincena_programada
    });
  }

  return hechos;
};

// Resultado por familia de un hecho, en la forma que la tabla del prototipo necesita: una
// columna por familia. `null` significa que la familia NO estaba en el alcance de la visita,
// no que no esté instalada: el listado de programación no publica el inventario físico.
export const resultadoPorFamilia = hecho => {
  const detalles = hecho.orden?.detalles?.items ?? [];
  const previstos = hecho.visita?.equipos?.items ?? [];
  const mapa = {};

  for (const familia of [...REGULARES, ...ANUALES]) {
    const detalle = detalles.find(d => d.tipo_equipo === familia);
    const previsto = previstos.find(e => e.tipo_equipo === familia);

    mapa[familia] = detalle
      ? {
        estado: detalle.estado,
        nivel_programado: detalle.nivel_programado,
        nivel_completado: detalle.nivel_completado,
        evidencias: Array.isArray(detalle.evidencias) ? detalle.evidencias.length : 0
      }
      : previsto
        ? { estado: null, nivel_programado: previsto.nivel_mantenimiento, previstoSinOrden: true }
        : null;
  }

  return mapa;
};

// ---------------------------------------------------------------------------
// QUÉ EXIGE EL BACKEND PARA UN RESULTADO · F2.2
// ---------------------------------------------------------------------------
// Esto NO valida ni bloquea: describe. La autoridad es resolverResultado() del backend, y
// su 409 se muestra tal cual. Aquí solo se anticipa, en una línea, qué va a exigir para la
// combinación que el técnico está eligiendo, para que no tenga que descubrirlo por error.
//
// Las condiciones salen de ese mismo resolverResultado, leído del código:
//   PENDIENTE / NO_APLICA  ->  nivel_completado DEBE ser null, y hay que enviarlo explícito
//   COMPLETADO             ->  nivel_completado DEBE ser EXACTAMENTE el previsto
//   PARCIAL                ->  prohibido en GPS/ADAS, imposible si el previsto es M1,
//                              y exige un nivel ESTRICTAMENTE MENOR que el previsto
export const exigenciaDeResultado = (detalle, estado) => {
  const previsto = detalle?.nivel_programado ?? null;
  const anual = esAnual(detalle?.tipo_equipo);

  if (estado === 'PENDIENTE' || estado === 'NO_APLICA') {
    return {
      nivelEsperado: null,
      nivelFijo: true,
      texto: `${estado} se registra sin nivel completado.`
    };
  }

  if (estado === 'COMPLETADO') {
    return {
      nivelEsperado: previsto,
      nivelFijo: true,
      texto: `COMPLETADO exige declarar el nivel previsto: ${previsto}.`
    };
  }

  if (estado === 'PARCIAL') {
    if (anual) {
      return {
        nivelEsperado: null,
        nivelFijo: false,
        texto: `No se admite un resultado parcial en ${ETIQUETA_EQUIPO[detalle.tipo_equipo] ?? detalle.tipo_equipo}: su mantenimiento `
          + 'anual solo contempla M3. Declara COMPLETADO, PENDIENTE o NO_APLICA.'
      };
    }

    if (previsto === 'M1') {
      return {
        nivelEsperado: null,
        nivelFijo: false,
        texto: 'No se admite un resultado parcial cuando el nivel previsto es M1: no existe un nivel '
          + 'inferior. Declara COMPLETADO si se hizo, o PENDIENTE si no.'
      };
    }

    const menores = NIVELES.filter(n => ORDEN[n] < ORDEN[previsto]);

    return {
      nivelEsperado: null,
      nivelFijo: false,
      opciones: menores,
      texto: `PARCIAL exige un nivel MENOR que el previsto (${previsto}): `
        + `${menores.join(' o ')}.`
    };
  }

  return { nivelEsperado: null, nivelFijo: false, texto: '' };
};

export const aperturaDeOt = visita => {
  const estado = visita?.estado;
  const noAnuladas = visita?.ordenes_trabajo?.no_anuladas ?? 0;
  const previstos = visita?.equipos?.total ?? 0;

  let motivo = null;

  if (estado === 'PROYECTADO') {
    motivo = MOTIVOS_APERTURA.proyectada;
  } else if (estado === 'CANCELADO') {
    motivo = MOTIVOS_APERTURA.cancelada;
  } else if (!ESTADOS_QUE_ADMITEN_OT.includes(estado)) {
    motivo = `La visita está en ${estado}. ${MOTIVOS_APERTURA.estadoNoAdmite}`;
  } else if (noAnuladas > 0) {
    motivo = MOTIVOS_APERTURA.activa;
  } else if (previstos === 0) {
    motivo = MOTIVOS_APERTURA.sinPrevistos;
  }

  return {
    puede_abrir: motivo === null,
    motivo_abrir: motivo,
    // Distinto de !puede_abrir: la visita puede tener una OT activa que conviene abrir en
    // vez de crear otra.
    tiene_activa: noAnuladas > 0
  };
};
