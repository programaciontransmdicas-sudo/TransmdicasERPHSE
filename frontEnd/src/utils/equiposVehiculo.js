export const CATALOGO_EQUIPOS = [
  ['DVR', 'DVR'],
  ['CAMARA_INTERNA', 'Cámara interna'],
  ['CAMARA_EXTERNA', 'Cámara externa'],
  ['ADAS', 'ADAS'],
  ['COPILOTO', 'Copiloto'],
  ['RADIO_BASE', 'Radio base'],
  ['GPS', 'GPS']
];

export function limpiarObservacionesEquipo(observaciones) {
  const mensajeInterno = 'Presencia confirmada el 19/10/2026. Lote ti_pr01_programacion_19102026_v1.';
  return String(observaciones ?? '')
    .split(/\r?\n/)
    .filter(linea => linea.trim() !== mensajeInterno)
    .join('\n')
    .trim();
}

export function crearEquiposFormulario(registrados = [], nuevo = false) {
  return CATALOGO_EQUIPOS.map(([tipo_equipo]) => {
    const existente = registrados.find(e => e.tipo_equipo === tipo_equipo);
    return {
      tipo_equipo,
      estado_inventario: existente?.estado_inventario || (nuevo ? '' : 'POR_VALIDAR'),
      marca: existente?.marca || '',
      modelo: existente?.modelo || '',
      numero_serie: existente?.numero_serie || '',
      fecha_instalacion: existente?.fecha_instalacion || '',
      observaciones: limpiarObservacionesEquipo(existente?.observaciones)
    };
  });
}

