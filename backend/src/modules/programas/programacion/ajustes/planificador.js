import { ValidationError } from '../../comun.js';
export const REGULARES = ['CAMARAS', 'COPILOTO', 'RADIO_BASE'];
export const ANUALES = ['GPS', 'ADAS'];
export const RANGO = {
  M1: 1,
  M2: 2,
  M3: 3
};
export const PENDIENTES = ['PROYECTADO', 'PROGRAMADO', 'REPROGRAMADO'];
export const MOTIVOS = [
  'No se realizó la inspección de la unidad.',
  'La unidad no llegó a base.',
  'No hubo disponibilidad para atender la unidad.',
  'El tiempo disponible fue insuficiente para realizar la inspección.'
];
export const indice = fecha => {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return y * 24 + (m - 1) * 2 + (d >= 16 ? 1 : 0);
};
export const quincena = i => {
  const y = Math.floor(i / 24),
    r = (i % 24 + 24) % 24;
  return `${y}-${String(Math.floor(r / 2) + 1).padStart(2, '0')}-${r % 2 ? '16' : '01'}`;
};
export const efectiva = v => v.quincena_efectiva || v.quincena_reprogramada || v.quincena_programada;
export const nivelRegular = v => (v.equipos || []).filter(e => REGULARES.includes(e.tipo_equipo)).reduce((max, e) => RANGO[e.nivel_mantenimiento] > (RANGO[max] || 0) ? e.nivel_mantenimiento : max, null);
export const editable = v => PENDIENTES.includes(v.estado) && Number(v.ot_total || 0) === 0;
const error = (mensaje, codigo = 'AJUSTE_NO_PERMITIDO') => new ValidationError(mensaje, 409, codigo);
export function versionPara(versiones, fecha) {
  const validas = versiones.filter(v => ['VIGENTE', 'SUPERSEDIDA'].includes(v.estado) && v.vigencia_desde <= fecha && (!v.vigencia_hasta || fecha < v.vigencia_hasta));
  if (validas.length !== 1) throw error(`No hay una única versión vigente para ${fecha}. Configure la vigencia antes de extender la programación.`, 'VERSION_NO_DISPONIBLE');
  return validas[0];
}
export function crearReloj(referencias, frecuencias) {
  const refs = new Map(referencias.filter(r => r.quincena).map(r => [`${r.tipo_equipo}|${r.nivel_mantenimiento}`, indice(r.quincena)]));
  const frec = new Map(frecuencias.map(f => {
    const n = Number(f.frecuencia_quincenas);
    if (!Number.isSafeInteger(n) || n < 1) throw error('Las frecuencias del programa deben ser quincenas enteras positivas.', 'FRECUENCIA_INVALIDA');
    return [`${f.tipo_equipo}|${f.nivel_mantenimiento}`, n];
  }));
  return {
    debido(familias, i) {
      let nivel = null;
      for (const f of familias) for (const n of ['M1', 'M2', 'M3']) {
        const key = `${f}|${n}`;
        if (refs.has(key) && frec.has(key) && i >= refs.get(key) + frec.get(key) && RANGO[n] > (RANGO[nivel] || 0)) nivel = n;
      }
      return nivel;
    },
    cubrir(familia, nivel, i) {
      const niveles = ANUALES.includes(familia) ? [nivel] : ['M1', 'M2', 'M3'].filter(n => RANGO[n] <= RANGO[nivel]);
      for (const n of niveles) {
        const key = `${familia}|${n}`;
        // Referencia de PROYECCIÓN; no escribe ciclos ni afirma que se ejecutó.
        if (!refs.has(key) || i > refs.get(key)) refs.set(key, i);
      }
    },
    validar(familia, nivel) {
      if (!frec.has(`${familia}|${nivel}`)) throw error(`No existe frecuencia para ${familia} / ${nivel}.`, 'FRECUENCIA_NO_CONFIGURADA');
    },
    refs,
    frecuencias: frec
  };
}
export function planificar({
  visitas,
  seleccionadaId,
  destino = null,
  nuevoNivel = null,
  fechaNegocio,
  referencias,
  frecuencias,
  versiones,
  soloRecalculo = false
}) {
  const activas = visitas.filter(v => v.estado !== 'CANCELADO').map(v => ({
    ...v,
    equipos: v.equipos.map(e => ({
      ...e
    }))
  }));
  const seleccionada = activas.find(v => v.id === seleccionadaId);
  if (!seleccionada) throw new ValidationError('Visita no encontrada', 404);
  if (!soloRecalculo && !editable(seleccionada)) throw error('La visita ya tiene una orden o un resultado histórico. No se cambiará su programación.', 'VISITA_CON_HISTORIAL');
  const nivelAnterior = nivelRegular(seleccionada);
  if (nuevoNivel && (!RANGO[nuevoNivel] || !nivelAnterior || RANGO[nuevoNivel] < RANGO[nivelAnterior])) {
    throw new ValidationError('Solo puede mantener o subir el nivel previsto: M1 → M2/M3 o M2 → M3.', 400, 'NIVEL_INFERIOR');
  }
  const origen = efectiva(seleccionada);
  if (destino && indice(destino) < indice(fechaNegocio)) throw new ValidationError('No se puede reprogramar a una quincena que ya terminó.', 400);
  const siguiente = quincena(indice(origen) + 1);
  if (destino && destino !== origen && destino !== siguiente) {
    throw new ValidationError(
      `Solo puede reprogramar a la siguiente quincena de la visita: ${siguiente}.`,
      400,
      'DESTINO_NO_ES_SIGUIENTE_QUINCENA'
    );
  }
  if (nuevoNivel && indice(origen) < indice(fechaNegocio)) throw error('Reprograme la visita vencida antes de cambiar su nivel.');
  const nuevasFechas = new Map(activas.map(v => [v.id, efectiva(v)]));
  if (destino && destino !== origen) {
    // Reserva el destino y desplaza la ocupante y su cadena; nunca pisa otra visita.
    const ocupantes = new Map(activas.filter(v => v.id !== seleccionadaId).map(v => [efectiva(v), v]));
    const desplazar = (v, q) => {
      if (!editable(v)) throw error(`La visita #${v.id} de ${efectiva(v)} tiene una orden o historial y no puede desplazarse.`, 'DESPLAZAMIENTO_CON_OT');
      const otra = ocupantes.get(q);
      if (otra && otra.id !== v.id) desplazar(otra, quincena(indice(q) + 1));
      if (ocupantes.get(nuevasFechas.get(v.id))?.id === v.id) ocupantes.delete(nuevasFechas.get(v.id));
      nuevasFechas.set(v.id, q);
      ocupantes.set(q, v);
    };
    desplazar(seleccionada, destino);
  }
  if (!soloRecalculo && (!destino || destino === origen) && (!nuevoNivel || nuevoNivel === nivelAnterior)) {
    return {
      cambios: [],
      origen,
      destino: origen,
      nivelAnterior,
      nuevoNivel: nivelAnterior
    };
  }
  if (!soloRecalculo) {
    seleccionada.nivel_regular_forzado = nuevoNivel || nivelAnterior;
    seleccionada.planificacion_ajustada = true;
  }
  const inicio = soloRecalculo ? quincena(indice(origen) + 1) : destino || origen;
  const reloj = crearReloj(referencias, frecuencias);
  const cambios = [];
  const secuencia = activas.sort((a, b) => nuevasFechas.get(a.id).localeCompare(nuevasFechas.get(b.id)) || a.id - b.id);
  for (const visita of secuencia) {
    const q = nuevasFechas.get(visita.id),
      qAntes = efectiva(visita);
    const i = indice(q);
    const reg = visita.equipos.filter(e => REGULARES.includes(e.tipo_equipo));
    const original = visitas.find(v => v.id === visita.id);
    const despues = {
      ...visita,
      quincena_efectiva: q,
      ...(q !== qAntes ? { quincena_reprogramada: q, estado: 'REPROGRAMADO' } : {})
    };
    if (q >= inicio && PENDIENTES.includes(visita.estado)) {
      let nivel = reloj.debido(reg.map(e => e.tipo_equipo), i) || (reg.length ? 'M1' : null);
      const piso = visita.nivel_regular_forzado;
      if (piso && RANGO[piso] > (RANGO[nivel] || 0)) nivel = piso;
      if (visita.id === seleccionadaId && nivelAnterior) nivel = nuevoNivel || nivelAnterior;
      for (const e of reg) {
        reloj.validar(e.tipo_equipo, nivel);
        e.nivel_mantenimiento = nivel;
      }
      despues.version_programa_id = versionPara(versiones, q).id;
    }
    const cambioAlcance = visita.equipos.some((e, j) => e.nivel_mantenimiento !== original.equipos[j].nivel_mantenimiento);
    const cambioFecha = q !== qAntes;
    const cambioManual = !soloRecalculo && visita.id === seleccionadaId && (cambioFecha || nuevoNivel && (original.nivel_regular_forzado !== nuevoNivel || !original.planificacion_ajustada));
    if (cambioAlcance || cambioFecha || cambioManual) {
      if (!editable(original)) throw error(`La visita #${visita.id} tiene una orden y su alcance quedaría alterado. No se guardó ningún cambio.`, 'ALCANCE_CON_OT');
      despues.planificacion_ajustada = true;
      cambios.push({
        antes: original,
        despues,
        cambioFecha,
        cambioAlcance,
        manual: visita.id === seleccionadaId
      });
    }
    // El historial real ya está en los ciclos. Solo las visitas pendientes de hoy en
    // adelante se usan como hipótesis para construir las siguientes intervenciones.
    if (PENDIENTES.includes(visita.estado) && i >= indice(fechaNegocio)) {
      for (const e of visita.equipos) reloj.cubrir(e.tipo_equipo, e.nivel_mantenimiento, i);
    }
  }
  return {
    cambios,
    origen,
    destino: inicio,
    nivelAnterior,
    nuevoNivel: nivelRegular(seleccionada)
  };
}
