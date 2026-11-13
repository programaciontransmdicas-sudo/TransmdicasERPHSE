import { leerIndicadoresMantenimiento } from '../stats/mantenimiento.js';
import { obtenerTrabajosTI, obtenerUltimaInspeccionPublica, obtenerUltimoIncidentePublico } from './repository.js';
import { construirUrlImagen, normalizarPlacaPublica } from './service.js';

// ==========================================
// ESTADÍSTICAS PÚBLICAS
// ==========================================

export const obtenerStatsPublicos = async (_req, res) => {
  try {
    const [datos, trabajos] = await Promise.all([
      leerIndicadoresMantenimiento({ accesoTotal: true }), obtenerTrabajosTI()
    ]);
    const ticker = [...datos.ordenes].sort((a, b) => `${b.fecha_cierre || ''} ${b.hora || ''}`.localeCompare(`${a.fecha_cierre || ''} ${a.hora || ''}`)).slice(0, 10).map(o => ({ placa: o.placa, hora: o.hora, fecha: o.fecha, estado: o.resultado }));
    const mantenimientosHoy = datos.ordenes.filter(o => o.fecha === datos.fecha_negocio).length;
    return res.json({ totalFlota: datos.unidades.length, mantenimientosHoy,
      inspeccionesHoy: mantenimientosHoy, ticker,
      trabajosTI: trabajos.map(t => ({ id: t.id, tipo: t.tipo_solicitud, placa: t.placa })) });
  } catch (error) {
    console.error('Error obteniendo estadísticas públicas:', error.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
};

// ==========================================
// CONSULTA POR PLACA
// ==========================================

export const consultarUnidadPublica = async (req, res) => {
  try {
    const placa = normalizarPlacaPublica(req.params.placa);
    const [datos, incidente, inspeccionHistorica] = await Promise.all([
      leerIndicadoresMantenimiento({ accesoTotal: true, placa }), obtenerUltimoIncidentePublico(placa),
      obtenerUltimaInspeccionPublica(placa)
    ]);
    const unidad = datos.unidades.find(u => u.placa === placa);
    if (!unidad) return res.status(404).json({ error: 'Unidad no encontrada' });
    const ultima = datos.ordenes[0];
    const equipo = tipo => ultima?.equipos?.find(e => e.tipo === tipo)?.estado || 'Sin registro';
    return res.json({ placa, fecha: ultima?.fecha || 'Sin registro', hora: '',
      estado_general: unidad.estado, tablet: equipo('COPILOTO'), radio: equipo('RADIO_BASE'),
      camaras: equipo('CAMARAS'), incidente_pendiente: incidente || null,
      timeline: datos.ordenes.slice(0, 3).map(o => ({ fecha: o.fecha, hora: '', estado: o.resultado })),
      fotos: inspeccionHistorica ? [
        { tipo: 'Inspección histórica · Tablet', url: construirUrlImagen(req, inspeccionHistorica.img_tablet) },
        { tipo: 'Inspección histórica · Radio', url: construirUrlImagen(req, inspeccionHistorica.img_radio) },
        { tipo: 'Inspección histórica · Cámaras', url: construirUrlImagen(req, inspeccionHistorica.img_camaras) }
      ] : [] });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error consultando la unidad pública:', error.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
};
