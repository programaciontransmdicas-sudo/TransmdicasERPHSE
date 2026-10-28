// Las fechas DATE son días físicos; los sellos administrativos se leen en hora de Perú.
export const CAMPOS_FECHA_OT = {
  ejecucion: 'Fecha de ejecución',
  cierre: 'Fecha de cierre',
  quincena: 'Quincena efectiva',
  apertura: 'Fecha de apertura'
};

export const diaPeru = valor => {
  if (!valor) return null;
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const fecha = new Date(`${texto}T00:00:00Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto ? texto : null;
  }
  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) return null;
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(fecha).map(({ type, value }) => [type, value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
};

export const fechaEjecucionOt = (orden, visita) => {
  // Una anulación no hereda la ejecución de la OT que posteriormente la sustituyó.
  if (orden?.estado !== 'CERRADA') return null;
  const valor = orden.visita && Object.hasOwn(orden.visita, 'fecha_ejecucion')
    ? orden.visita.fecha_ejecucion : visita?.fecha_ejecucion;
  return diaPeru(valor);
};

export const fechaDeRegistroOt = ({ orden, visita }, campo) => {
  if (campo === 'ejecucion') return fechaEjecucionOt(orden, visita);
  if (campo === 'cierre') return diaPeru(orden?.fecha_cierre);
  if (campo === 'apertura') return diaPeru(orden?.fecha_apertura);
  if (campo === 'quincena') return diaPeru(orden?.visita?.quincena_efectiva
    ?? visita?.quincena_efectiva ?? visita?.quincena_programada);
  return null;
};

export const fechaVisibleOt = valor => {
  const dia = diaPeru(valor);
  return dia ? dia.split('-').reverse().join('/') : '—';
};

export const filtrarYOrdenarFechasOt = (registros, {
  filtrarPor = 'ejecucion', desde = '', hasta = '', ordenarPor = 'ejecucion', sentido = 'desc'
} = {}) => {
  const rangoInvalido = (desde && !diaPeru(desde)) || (hasta && !diaPeru(hasta)) || (desde && hasta && desde > hasta);
  if (rangoInvalido) return [];
  return registros.filter(registro => {
    if (!desde && !hasta) return true;
    const fecha = fechaDeRegistroOt(registro, filtrarPor);
    return fecha && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  }).sort((a, b) => {
    const fa = fechaDeRegistroOt(a, ordenarPor);
    const fb = fechaDeRegistroOt(b, ordenarPor);
    if (fa && fb && fa !== fb) return sentido === 'asc' ? fa.localeCompare(fb) : fb.localeCompare(fa);
    if (Boolean(fa) !== Boolean(fb)) return fa ? -1 : 1;
    // Desempate estable para órdenes del mismo día y registros sin la fecha elegida.
    const apertura = String(b.orden?.fecha_apertura ?? '').localeCompare(String(a.orden?.fecha_apertura ?? ''));
    return apertura || Number(b.orden?.id ?? b.visita?.id ?? 0) - Number(a.orden?.id ?? a.visita?.id ?? 0);
  });
};
