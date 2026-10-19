import { ValidationError } from '../../comun.js';
import { ESTADOS } from '../service.js';
import { REGULARES, ANUALES, RANGO, PENDIENTES, indice, quincena, efectiva, nivelRegular } from '../ajustes/planificador.js';

const normal = valor => String(valor ?? '').trim().toUpperCase();
const placaClave = valor => normal(valor).replace(/[-\s]/g, '');
export const placaVisible = valor => placaClave(valor).replace(/^(.{3})(.{3})$/, '$1-$2');
const minimo = valores => valores.filter(Boolean).sort()[0] ?? null;
const maximo = valores => valores.filter(Boolean).sort().at(-1) ?? null;
const niveles = Object.keys(RANGO);
const fecha = valor => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
  && Number.isFinite(Date.parse(`${valor}T00:00:00Z`))
  && new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;

export function filtrosExcel(query = {}) {
  if (Object.keys(query).some(k => !['busqueda', 'operacion', 'estado'].includes(k))) {
    throw new ValidationError('Los filtros del reporte no son válidos.');
  }
  for (const k of ['busqueda', 'operacion', 'estado']) {
    if (query[k] !== undefined && (typeof query[k] !== 'string' || query[k].length > 150)) {
      throw new ValidationError('Los filtros del reporte no son válidos.');
    }
  }
  if (query.estado && !ESTADOS.includes(query.estado)) throw new ValidationError('Seleccione un estado válido.');
  return { busqueda: placaClave(query.busqueda), operacion: normal(query.operacion), estado: query.estado || '' };
}

export function finQuincena(q) {
  if (q.slice(8) === '01') return `${q.slice(0, 8)}15`;
  return new Date(Date.UTC(Number(q.slice(0, 4)), Number(q.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

function ejecucionCompleta(v) {
  // Cuenta visitas, nunca dispositivos ni número de órdenes. Una OT abierta, anulada,
  // parcial o sin detalle no es una ejecución completa, aunque la visita tenga fecha.
  if (v.estado !== 'EJECUTADO' || !v.fecha_ejecucion || !v.equipos.length) return false;
  const aplicables = v.equipos.filter(e => !v.resultados.some(d => d.equipo_id === e.id && d.estado === 'NO_APLICA'));
  return aplicables.length > 0 && aplicables.every(e => v.resultados.some(d =>
    d.equipo_id === e.id && d.estado === 'COMPLETADO'
    && RANGO[d.nivel_completado] >= RANGO[e.nivel_mantenimiento]));
}

const pertenecePeriodo = (v, inicio, fin) => [efectiva(v), v.quincena_programada]
  .some(q => q && q <= fin && finQuincena(q) >= inicio);
const agrupar = (filas, clave) => {
  const mapa = new Map();
  for (const fila of filas) {
    const k = fila[clave];
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(fila);
  }
  return mapa;
};
const literal = v => String(v ?? '').replace(/\r\n?/g, '\n').trim();

export function prepararReporte(datos, filtros = filtrosExcel()) {
  const { periodo_inicio: inicio, periodo_fin: fin } = datos.version;
  if (!fecha(inicio) || !fecha(fin) || inicio > fin || !fecha(datos.fecha_negocio)) {
    throw new ValidationError('El período o la fecha de referencia del programa no son válidos.', 409);
  }
  // Limita el ancho a la capacidad de Excel. No se descartan silenciosamente períodos.
  if (indice(fin) - indice(inicio) > 239) throw new ValidationError('El período del programa es demasiado extenso para este reporte.', 409);
  const visitasPorUnidad = agrupar(datos.visitas, 'programa_unidad_id');
  const ciclosPorUnidad = agrupar(datos.ciclos, 'programa_unidad_id');
  const columnas = new Set();
  for (let i = indice(inicio); i <= indice(fin); i++) columnas.add(quincena(i));
  const filas = [];

  for (const unidad of datos.unidades) {
    if (filtros.busqueda && !placaClave(unidad.placa).includes(filtros.busqueda)) continue;
    if (filtros.operacion && (filtros.operacion === '__SIN_OPERACION__'
      ? normal(unidad.operacion) !== '' : normal(unidad.operacion) !== filtros.operacion)) continue;
    const todas = visitasPorUnidad.get(unidad.id) ?? [];
    const enPeriodo = todas.filter(v => pertenecePeriodo(v, inicio, fin));
    const visibles = enPeriodo.filter(v => !filtros.estado || v.estado === filtros.estado);
    // Estar inscrita en el programa o tener ciclos históricos no basta: la unidad
    // debe tener al menos una visita en el alcance que se está exportando.
    if (!visibles.length) continue;
    const activas = visibles.filter(v => v.estado !== 'CANCELADO');
    const pendientes = todas.filter(v => PENDIENTES.includes(v.estado));
    const ciclos = ciclosPorUnidad.get(unidad.id) ?? [];
    const familias = REGULARES.filter(tipo => todas.some(v => v.estado !== 'CANCELADO'
      && v.equipos.some(e => e.tipo_equipo === tipo)) || ciclos.some(c => c.tipo_equipo === tipo));
    const notas = new Set([literal(unidad.observaciones)].filter(Boolean));

    // Una fecha única solo afirma cobertura común. Si falta una familia, queda vacía.
    // Cuando las fechas difieren, la más antigua es la cobertura común garantizada y
    // el desglose en observaciones evita presentar la última cámara como toda la unidad.
    const ultimas = niveles.map(nivel => {
      const porFamilia = familias.map(tipo => ({ tipo, fecha: maximo(ciclos.filter(c =>
        c.tipo_equipo === tipo && RANGO[c.nivel_mantenimiento] >= RANGO[nivel]
      ).map(c => c.ultima_fecha_real)) }));
      if (new Set(porFamilia.map(c => c.fecha)).size > 1) {
        notas.add(`Últ. ${nivel} por equipo: ${porFamilia.map(c => `${c.tipo}: ${c.fecha || 'sin registro'}`).join('; ')}.`);
      }
      return porFamilia.length && porFamilia.every(c => c.fecha) ? minimo(porFamilia.map(c => c.fecha)) : null;
    });
    const proximas = niveles.map(nivel => minimo(pendientes.filter(v =>
      RANGO[nivelRegular(v)] >= RANGO[nivel]).map(efectiva)));
    const arranque = unidad.quincena_incorporacion || minimo(todas.filter(v => v.estado !== 'CANCELADO').map(v => v.quincena_programada));
    const matriz = new Map();
    const movidas = new Set();
    for (const v of visibles) {
      const q = efectiva(v);
      columnas.add(q);
      let texto = nivelRegular(v) || (v.equipos.some(e => ANUALES.includes(e.tipo_equipo)) ? 'AN' : '');
      const anuales = v.equipos.filter(e => ANUALES.includes(e.tipo_equipo));
      if (anuales.length) notas.add(`${q}: ${anuales.map(e => `${e.tipo_equipo} ${e.nivel_mantenimiento}`).join(' + ')}.`);
      if (v.estado === 'CANCELADO') texto = texto ? `${texto} cancelado` : 'Cancelado';
      const previa = matriz.get(q);
      if (!previa || previa.estado === 'CANCELADO') matriz.set(q, { texto, nivel: nivelRegular(v), estado: v.estado });
      else if (v.estado !== 'CANCELADO') throw new ValidationError(`Hay más de una visita activa en ${placaVisible(unidad.placa)} para ${q}. Revise la programación.`, 409);
      if (v.estado === 'CANCELADO') continue;
      const origenes = new Set();
      if (v.quincena_programada !== q) origenes.add(v.quincena_programada);
      for (const a of v.ajustes ?? []) {
        if (a.tipo !== 'REPROGRAMACION') continue;
        origenes.add(a.origen);
        notas.add(`Reprogramado ${a.origen} → ${a.destino}: ${literal(a.motivo)}`);
      }
      for (const origen of origenes) {
        if (origen && origen !== q && origen <= fin && finQuincena(origen) >= inicio) {
          movidas.add(origen);
          columnas.add(origen);
        }
      }
      if (v.estado === 'EJECUTADO_PARCIAL') notas.add(`${q}: ejecución parcial.`);
      if (v.estado === 'NO_EJECUTADO') notas.add(`${q}: no ejecutado.`);
      if (v.estado === 'NO_APLICA') notas.add(`${q}: no aplica.`);
    }
    for (const origen of movidas) {
      const actual = matriz.get(origen);
      if (actual && actual.estado !== 'CANCELADO') actual.texto += '\nReprogramado';
      else matriz.set(origen, { texto: 'Reprogramado', estado: 'REPROGRAMADO', nivel: null });
    }
    // Misma noción de vencimiento que Programa: vence al terminar la quincena de Perú.
    const plazos = pendientes.map(v => finQuincena(efectiva(v)));
    const proximoPlazo = minimo(plazos);
    const sieteDias = new Date(Date.parse(`${datos.fecha_negocio}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const estado = !todas.some(v => v.estado !== 'CANCELADO') ? 'SIN PROGRAMACIÓN'
      : proximoPlazo && proximoPlazo < datos.fecha_negocio ? 'VENCIDO'
        : proximoPlazo && proximoPlazo <= sieteDias ? 'POR VENCER' : 'AL DÍA';
    if (!proximas.some(Boolean) && familias.length) notas.add('Sin próximas visitas regulares materializadas.');
    const programados = activas.filter(v => v.estado !== 'NO_APLICA').length;
    const ejecutados = activas.filter(ejecucionCompleta).length;
    filas.push({ unidad, ultimas, proximas, estado, arranque, matriz,
      programados, ejecutados, porcentaje: programados ? ejecutados / programados : null,
      observaciones: [...notas].join('\n') });
  }
  if (columnas.size > 240) throw new ValidationError('El reporte supera el máximo de quincenas permitido.', 409);
  return { ...datos, filtros, filas, quincenas: [...columnas].sort() };
}
