import { indice, quincena, REGULARES } from '../../src/modules/programas/programacion/ajustes/planificador.js';
export const fecha = '2026-10-16';
export const frecuencias = [...REGULARES.flatMap(tipo_equipo => ['M1', 'M2', 'M3'].map((nivel_mantenimiento, i) => ({
  tipo_equipo,
  nivel_mantenimiento,
  frecuencia_quincenas: [1, 6, 12][i]
}))), {
  tipo_equipo: 'GPS',
  nivel_mantenimiento: 'M3',
  frecuencia_quincenas: 24
}];
export const referencias = frecuencias.map(f => ({
  ...f,
  quincena: '2026-10-01'
}));
export const versiones = [{
  id: 1,
  version: '01',
  estado: 'VIGENTE',
  vigencia_desde: '2026-01-01',
  vigencia_hasta: null
}];
export function visita(id, q, nivel = 'M1', extra = {}) {
  return {
    id,
    programa_id: 1,
    programa_unidad_id: 10,
    version_programa_id: 1,
    quincena_programada: q,
    quincena_efectiva: q,
    quincena_reprogramada: null,
    estado: 'PROYECTADO',
    ot_total: 0,
    nivel_regular_forzado: null,
    planificacion_ajustada: false,
    equipos: REGULARES.map((tipo_equipo, i) => ({
      id: id * 10 + i,
      programacion_id: id,
      tipo_equipo,
      nivel_mantenimiento: nivel
    })),
    ...extra
  };
}
export function escenario(cantidad = 18) {
  return {
    fechaNegocio: fecha,
    referencias,
    frecuencias,
    versiones,
    seleccionadaId: 1,
    visitas: Array.from({
      length: cantidad
    }, (_, i) => visita(i + 1, quincena(indice(fecha) + i), i === 5 ? 'M2' : i === 11 ? 'M3' : 'M1'))
  };
}
