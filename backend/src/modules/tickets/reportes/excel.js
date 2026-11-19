import ExcelJS from 'exceljs';
const normal = valor => {
  if (valor == null) return '';
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' | ');
  return String(valor);
};
const columnas = {
  tickets: [['N.º','id'],['Estado','estado'],['Fecha de creación','fecha_creacion'],['Placa','placa'],['Cliente','cliente'],['Operación','operacion'],['Solicitante','nombre_completo'],['DNI','dni'],['Categoría','tipo_solicitud'],['Implemento','implemento'],['Descripción','descripcion'],['Resolución','resolucion_desc'],['Fecha de llegada','fecha_llegada_unidad'],['Hora de llegada','hora_llegada_unidad']],
  pulseras: [['N.º','id'],['Estado','estado'],['Fecha de creación','fecha_creacion'],['Solicitante','nombre_solicitante'],['Receptor','nombre_receptor'],['DNI receptor','receptor_dni'],['Operación','operacion'],['Fecha de llegada','fecha_llegada_personal'],['Hora de llegada','hora_llegada_personal'],['Motivo de renovación','motivo_renovacion'],['Cambio realizado','aplica_cambio'],['Motivo sin cambio','motivo_sin_cambio'],['Entrega TI','entrega_ti_id'],['Fecha de cierre','fecha_cierre']],
  videos: [['N.º','id'],['Estado','estado'],['Fecha de solicitud','fecha_ingreso'],['Solicitante','nombre_solicitante'],['Operación','operacion'],['Placas','placas'],['Detalle por placa','detalles_placas'],['Motivo','motivo'],['Fecha de atención','fecha_atencion'],['Atendido por','nombre_atendedor'],['Observaciones','observaciones_atencion'],['Enlaces','enlaces_videos']],
};
export async function generarExcelSoporte(tipo, registros) {
  if (!columnas[tipo]) throw new Error('Tipo de reporte inválido');
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(tipo === 'tickets' ? 'Tickets' : tipo === 'pulseras' ? 'Pulseras' : 'Videos');
  hoja.columns=columnas[tipo].map(([header,key])=>({header,key,width:Math.min(45,Math.max(16,header.length+4))}));
  hoja.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  hoja.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF253659'}};
  hoja.views=[{state:'frozen',ySplit:1}];
  hoja.autoFilter={from:{row:1,column:1},to:{row:1,column:hoja.columns.length}};
  for (const registro of registros) hoja.addRow(Object.fromEntries(columnas[tipo].map(([,key])=>[key, key === 'detalles_placas' && Array.isArray(registro[key]) ? registro[key].map(v => [v.placa, v.fecha_descarga, v.hora_inicio && v.hora_fin ? `${v.hora_inicio}–${v.hora_fin}` : '', v.fecha_llegada_unidad ? `Llegada: ${v.fecha_llegada_unidad} ${v.hora_llegada_unidad || ''}` : ''].filter(Boolean).join(' · ')).join(' | ') : normal(registro[key])])));
  return libro.xlsx.writeBuffer();
}

// No se exporta ningún identificador que no aparezca en la consulta autorizada.
export function seleccionarRegistrosPermitidos(ids, todos) {
  const solicitados = new Set(ids.map(String));
  const registros = todos.filter(item => solicitados.has(String(item.id)));
  return registros.length === solicitados.size ? registros : null;
}
