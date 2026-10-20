import {
  REGULARES, FISICOS, idx, quin
} from '../../../scripts/ti-pr-01/generador-nucleo.mjs';

export const errorConfiguracionPrograma = mensaje => Object.assign(new Error(mensaje), { status: 409 });

// Son referencias de planificación; nunca se crean ciclos ni ejecuciones ficticias.
export function prepararInicioPrograma(equipos, frecuencias, fechaNegocio) {
  const inicio = idx(fechaNegocio);
  const frecuencia = (familia, nivel) => {
    const filas = frecuencias.filter(f => f.tipo_equipo === familia && f.nivel_mantenimiento === nivel);
    const valor = Number(filas[0]?.frecuencia_quincenas);
    if (filas.length !== 1 || !Number.isInteger(valor) || valor <= 0) {
      throw errorConfiguracionPrograma(`Revise la frecuencia de ${familia} ${nivel} en TI-PR-01 antes de crear la unidad.`);
    }
    return valor;
  };
  const anclas = [], regulares = [], pendientes = [];
  const nombres = { CAMARAS: 'Cámaras', COPILOTO: 'Copiloto', RADIO_BASE: 'Radio base' };
  for (const familia of REGULARES) {
    const fisicos = equipos.filter(e => FISICOS[familia].includes(e.tipo_equipo));
    if (!fisicos.some(e => e.estado_inventario === 'INSTALADO')) {
      if (fisicos.some(e => e.estado_inventario === 'POR_VALIDAR')) {
        pendientes.push(`${nombres[familia]}: confirme si está instalado para programar su mantenimiento.`);
      }
      continue;
    }
    const f1 = frecuencia(familia, 'M1');
    const f2 = frecuencia(familia, 'M2');
    const f3 = frecuencia(familia, 'M3');
    if (f2 <= f1 || f3 <= f2) {
      throw errorConfiguracionPrograma(`Revise el orden de las frecuencias de ${nombres[familia]} en TI-PR-01.`);
    }
    regulares.push(familia);
    for (const nivel of ['M1', 'M2', 'M3']) {
      anclas.push({ familia, nivel, quincena: quin(nivel === 'M1' ? inicio - f1 : inicio) });
    }
  }
  for (const familia of ['GPS', 'ADAS']) {
    const equipo = equipos.find(e => e.tipo_equipo === familia);
    if (!equipo || equipo.estado_inventario === 'NO_APLICA') continue;
    if (equipo.estado_inventario !== 'INSTALADO') {
      pendientes.push(`${familia}: confirme si está instalado para programar su mantenimiento.`);
      continue;
    }
    // Conserva el alcance del generador existente: ADAS anual solo con TRACKLOG.
    if (familia === 'ADAS' && !/TRACKLOG/i.test(equipo.marca || '')) {
      pendientes.push(equipo.marca
        ? 'ADAS: el proveedor indicado no pertenece al alcance anual de TI-PR-01.'
        : 'ADAS: confirme el proveedor para determinar su mantenimiento anual.');
      continue;
    }
    if (!equipo.fecha_instalacion) {
      pendientes.push(`${familia}: falta la fecha de instalación para calcular su mantenimiento anual.`);
      continue;
    }
    const frec = frecuencia(familia, 'M3');
    const referencia = idx(equipo.fecha_instalacion);
    anclas.push({ familia, nivel: 'M3', quincena: quin(referencia) });
    if (referencia + frec < inicio) {
      pendientes.push(`${familia}: su mantenimiento anual ya venció según la fecha de instalación; coordine su programación.`);
    }
  }
  return { quincena: quin(inicio), regulares, anclas, pendientes };
}
