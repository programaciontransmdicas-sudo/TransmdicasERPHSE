import { quincenaDe } from '../components/tiPr01/dominio.js';

export function quincenaActual(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null;
  return `${fecha.slice(0, 7)}-${Number(fecha.slice(8, 10)) <= 15 ? '01' : '16'}`;
}

export function estadoEnQuincena(visitas, quincena, hoy) {
  const v = (visitas || []).find(x => x.quincena_efectiva === quincena && x.estado !== 'CANCELADO');
  if (!v) return 'SIN INFORMACIÓN';
  if (v.estado === 'EJECUTADO') return 'AL DÍA';
  if (v.estado === 'EJECUTADO_PARCIAL') return 'PARCIAL';
  if (v.estado === 'NO_EJECUTADO') return 'NO EJECUTADO';
  if (v.estado === 'NO_APLICA') return 'NO APLICA';
  if (!['PROGRAMADO', 'PROYECTADO', 'REPROGRAMADO'].includes(v.estado)) return 'OTRO';
  const fin = quincenaDe(quincena)?.fin;
  if (!fin || !hoy) return 'SIN INFORMACIÓN';
  if (fin < hoy) return 'VENCIDA';
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 7);
  return fin <= limite.toISOString().slice(0, 10) ? 'POR VENCER' : 'AL DÍA';
}
