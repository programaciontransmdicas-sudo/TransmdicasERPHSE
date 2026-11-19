const normal = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const valoresTexto = (tipo, r) => tipo==='tickets'
  ? [r.id,`TKT-${r.id}`,r.placa,r.nombre_completo,r.dni,r.descripcion,r.resolucion_desc,r.implemento,r.cliente,r.operacion]
  : tipo==='pulseras' ? [r.id,`PUL-${r.id}`,r.nombre_solicitante,r.nombre_receptor,r.receptor_dni,r.motivo_renovacion,r.motivo_sin_cambio,r.operacion]
    : [r.id,`DVD-${r.id}`,r.nombre_solicitante,r.placas?.join(' '),r.motivo,r.observaciones_atencion,r.operacion];
function fechaLocal(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const f=new Date(v); if (Number.isNaN(f.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(f);
  const obtener=tipo=>partes.find(p=>p.type===tipo)?.value;
  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`;
}
export function filtrarSoporte(tipo, registros, filtros) {
  return registros.filter(r=>{
    const fecha=fechaLocal(tipo==='videos'?r.fecha_ingreso:r.fecha_creacion);
    return (!filtros.texto || valoresTexto(tipo,r).some(v=>normal(v).includes(normal(filtros.texto)))) &&
      (!filtros.estado || r.estado===filtros.estado) && (!filtros.cliente || r.cliente===filtros.cliente) && (!filtros.operacion || r.operacion===filtros.operacion) && (!filtros.categoria || r.tipo_solicitud===filtros.categoria) &&
      (!filtros.desde || (fecha && fecha>=filtros.desde)) && (!filtros.hasta || (fecha && fecha<=filtros.hasta));
  });
}
