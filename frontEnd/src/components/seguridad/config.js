export const CONTROLES = [
  { id: 'vehiculos', nombre: 'Vehículos', icono: 'truck', descripcion: 'Ingresos y salidas de unidades', referencia: 'Placa', persona: 'Conductor', color: '#2458e8' },
  { id: 'personal', nombre: 'Personal', icono: 'users', descripcion: 'Accesos y conformidad de ingreso', referencia: 'Placa', persona: 'Nombre', color: '#0e9384' },
  { id: 'llaves', nombre: 'Llaves vehiculares', corto: 'Llaves', icono: 'key', descripcion: 'Recojos y devoluciones en garita', referencia: 'Placa', persona: 'Persona que recoge', color: '#a06b18' },
  { id: 'relevos', nombre: 'Relevos de turno', corto: 'Relevos', icono: 'repeat', descripcion: 'Novedades y pendientes de cada turno', referencia: 'Referencia', persona: 'Nombre', color: '#6d5cd1' },
  { id: 'rondas', nombre: 'Rondas de supervisión', corto: 'Rondas', icono: 'route', descripcion: 'Supervisión y seguimiento de anomalías', referencia: 'Tipo de ronda', persona: 'Nombre', color: '#cc6340' },
  { id: 'terceros', nombre: 'Terceros', icono: 'badge', descripcion: 'Visitas, empresas y documentos SCTR', referencia: 'Referencia', persona: 'Nombre', color: '#33739f' },
  { id: 'activos', nombre: 'Activos', icono: 'box', descripcion: 'Movimientos, bienes, series y retornos', referencia: 'N.º documento', persona: 'Responsable', color: '#65703c' },
];
export const BASES = ['Peruarbo', 'Moquegua', 'Espinar'];
export const FILTROS_INICIALES = { base: '', desde: '', hasta: '' };
export const CAMPOS = {
  origenRegistro: 'Registrado desde', salidaReal: 'Salida real', observacionesCierre: 'Observaciones de salida',
  placa: 'Placa', carreta: 'Carreta', conductor: 'Conductor', dni: 'DNI', operacion: 'Operación',
  nombre: 'Nombre', fecha: 'Fecha del evento', agente: 'Agente', estado: 'Estado', motivo: 'Motivo',
  kilometraje: 'Kilometraje', origen: 'Origen', destino: 'Destino', condicion: 'Condición',
  repuesto: 'Repuesto', carga: 'Carga', boleta: 'Boleta', precintos: 'Precintos',
  observaciones: 'Observaciones', controles: 'Checklist', verificaciones: 'Verificaciones',
  implementacion_completa: 'Implementación completa', estacionamiento_seguro: 'Estacionamiento seguro',
  ingresoRegistrado: 'Ingreso registrado', tipoRegistro: 'Tipo de registro', salida: 'Salida',
  cargo: 'Cargo', identificacion: 'Identificación', devolucionFecha: 'Fecha de devolución', recibe: 'Recibe',
  pendientesAnterior: 'Pendientes del turno anterior', novedades: 'Novedades', incidentes: 'Incidentes',
  movimientos: 'Movimientos', equipos: 'Equipos', acciones: 'Acciones realizadas',
  tipo: 'Tipo', turno: 'Turno', fin: 'Fin de la ronda', presentaAnomalias: '¿Se presentaron anomalías?',
  anomalias: 'Anomalías identificadas', seguimiento: 'Pendientes para seguimiento',
  zona: 'Zona / recorrido', hallazgos: 'Hallazgos', comunicacion: 'Comunicación', pendientes: 'Pendientes',
  fechaIngreso: 'Fecha de ingreso', fechaSalida: 'Fecha prevista de salida', horaIngreso: 'Hora de ingreso',
  responsableSolicitud: 'Responsable de la solicitud', empresa: 'Empresa', responsableSitio: 'Responsable en sitio',
  area: 'Área', movimiento: 'Movimiento', documento: 'Documento', numero: 'Número de documento',
  autoriza: 'Autoriza', retorna: '¿Retorna?', fechaPrevista: 'Fecha prevista de retorno', retorno: 'Fecha de retorno',
  documentoRetorno: 'Documento de retorno', conformidad: 'Conformidad', descripcion: 'Descripción', cantidad: 'Cantidad',
  series: 'Series', saldo: 'Saldo', devuelto: 'Devuelto', bienes: 'Bienes', retornos: 'Retornos',
};
const fechas = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
export function fechaPeru(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? String(valor) : fechas.format(fecha);
}
export const numero = valor => Number(valor || 0).toLocaleString('es-PE');
export function etiqueta(clave) {
  return CAMPOS[clave] || clave.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}
export function tonoEstado(estado = '') {
  if (/anomal|pendiente|fuera|parcial/i.test(estado)) return 'amber';
  if (/salida|devuelta|devuelto|retorn|finaliz|complet|conclu/i.test(estado)) return 'neutral';
  return 'green';
}
