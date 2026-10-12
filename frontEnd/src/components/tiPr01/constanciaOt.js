import { apiTiPr01 } from '../../services/api';

// Referencia de presentación derivada de la clave existente; no crea correlativos en BD.
export const codigoOrden = orden => orden.codigo || `OT-${String(orden.id).padStart(6, '0')}`;

export const fechaConstancia = valor => {
  if (!valor) return 'No registrada';
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [anio, mes, dia] = texto.split('-');
    return `${dia}/${mes}/${anio}`;
  }
  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) return 'No registrada';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short'
  }).format(fecha);
};

export const cargarConstancia = async (programaId, orden) => {
  const resultados = await Promise.allSettled([
    apiTiPr01.obtenerOrdenTrabajo(programaId, orden.programacion_id, orden.id),
    apiTiPr01.obtenerVisitaProgramacion(programaId, orden.programacion_id),
    apiTiPr01.listarEvidenciasOrden(programaId, orden.programacion_id, orden.id)
  ]);
  const errores = resultados.filter(resultado => resultado.status === 'rejected');
  if (errores.length) throw errores[0].reason;
  const [actual, visita, evidencias] = resultados.map(resultado => resultado.value);
  if (evidencias.estado_orden !== actual.estado) {
    throw new Error('La orden cambió mientras se consultaba. Vuelve a generar la constancia.');
  }
  return { orden: actual, visita, evidencias, consultada: new Date().toISOString() };
};
