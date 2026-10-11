// ==========================================
// INSUMOS DE UNA UNIDAD DEL PROGRAMA (TI-PR-01)
// Dominio y normalización de filtros. No conoce HTTP ni SQL.
// ==========================================
//
// Sirve dos consultas de SOLO LECTURA sobre la misma unidad, y por eso comparten módulo:
// el inventario físico y el estado de fase.
//
// -------------------------------------------------------------------------------------
// TRES TABLAS, TRES RESPONSABILIDADES QUE NO SE MEZCLAN
// -------------------------------------------------------------------------------------
// vehiculo_equipos · INVENTARIO FISICO por placa y tipo FISICO de equipo. Su COMMENT en la
//   base lo dice: "Inventario fisico de equipos tecnologicos por unidad, con marca, serie,
//   fecha de instalacion y observaciones". Dominio de estado_inventario: INSTALADO,
//   NO_APLICA, POR_VALIDAR -chk_vehiculo_equipo_estado-. uq_vehiculo_equipo (placa,
//   tipo_equipo) permite como máximo una fila por tipo, así que la AUSENCIA de fila es
//   información y se reporta como tal, sin inventarle un estado.
//
// programa_mantenimiento_unidad_ciclos · EJECUCION YA OCURRIDA. Su COMMENT: "Estado de
//   ciclo por programa/unidad/equipo/nivel. NO se versiona documentalmente: publicar V02 no
//   reinicia ciclos ni pierde la ultima quincena ejecutada". Lleva ultima_quincena -la
//   quincena administrativa, NOT NULL, día 1 o 16-, ultima_fecha_real -el día FISICO,
//   nullable- y fuente, y puede citar el detalle de OT que lo movió.
//
// programa_mantenimiento_unidad_anclas · PUNTO DE PARTIDA DE FASE. Su COMMENT: "Referencia
//   fija de fase por (unidad, tipo_equipo, nivel). NO es la proxima fecha: es el punto
//   desde el cual se calcula el PRIMER vencimiento de un nivel que todavia nunca tuvo
//   ejecucion real. El ciclo ejecutado siempre tiene precedencia sobre el ancla". No tiene
//   fecha física, no tiene fuente y no cita ninguna OT: no representa una ejecución.
//
// Medido sobre los datos reales: 688 ciclos y 1062 anclas, y CERO claves
// (unidad, tipo_equipo, nivel) con las dos cosas a la vez. Son complementarias, no
// equivalentes: el ancla existe justo donde todavía no hay ciclo.
//
// Este módulo NO resuelve cuál de las dos gobierna. Esa precedencia es del generador y ya
// vive en su núcleo; duplicarla aquí crearía una segunda implementación que acabaría
// divergiendo.

import {
  ValidationError
} from '../../comun.js';

// UNA SOLA FUENTE DE VERDAD, igual que en frecuencias: las familias, su composición física
// y el orden de los niveles los define el núcleo del generador. Aquí se importan.
import {
  REGULARES,
  ANUALES,
  FISICOS,
  ORDEN
} from '../../../../../scripts/ti-pr-01/generador-nucleo.mjs';

// Los tipos FISICOS del inventario -chk_vehiculo_equipo_tipo-, distintos de las FAMILIAS
// que usan frecuencias, ciclos y anclas. Se derivan de FISICOS del núcleo, que es el mapa
// familia -> componentes físicos, más las dos anuales, que no se descomponen.
export const TIPOS_FISICOS = [
  ...REGULARES.flatMap(
    familia => FISICOS[familia]
  ),
  ...ANUALES
];

// chk_vehiculo_equipo_estado
export const ESTADOS_INVENTARIO = [
  'INSTALADO',
  'NO_APLICA',
  'POR_VALIDAR'
];

// chk_ciclo_tipo_equipo, chk_ancla_tipo_equipo
export const FAMILIAS = [
  ...REGULARES,
  ...ANUALES
];

// chk_ciclo_nivel, chk_ancla_nivel
export const NIVELES = Object.keys(ORDEN);

// chk_ciclo_fuente. EXCEL es la siembra inicial y sigue siendo válida.
export const FUENTES_CICLO = [
  'INSPECCIONES_FLOTA',
  'MANTENIMIENTOS_TECNICOS',
  'EXCEL',
  'MANUAL',
  'ORDENES_TRABAJO'
];

// chk_ancla_origen
export const ORIGENES_ANCLA = [
  'DERIVADA_M1_INICIAL',
  'MANUAL'
];

const normalizarDeDominio = (
  campo,
  valor,
  dominio
) => {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  const texto = String(valor)
    .trim()
    .toUpperCase();

  if (!dominio.includes(texto)) {
    throw new ValidationError(
      `${campo} debe ser ${dominio.join(', ')}`
    );
  }

  return texto;
};

export const normalizarFiltrosEquipos = (
  query = {}
) => ({
  tipo_equipo: normalizarDeDominio(
    'tipo_equipo',
    query.tipo_equipo,
    TIPOS_FISICOS
  ),
  estado_inventario: normalizarDeDominio(
    'estado_inventario',
    query.estado_inventario,
    ESTADOS_INVENTARIO
  )
});

export const normalizarFiltrosCiclos = (
  query = {}
) => ({
  tipo_equipo: normalizarDeDominio(
    'tipo_equipo',
    query.tipo_equipo,
    FAMILIAS
  ),
  nivel_mantenimiento: normalizarDeDominio(
    'nivel_mantenimiento',
    query.nivel_mantenimiento,
    NIVELES
  )
});

// Completa los 8 tipos físicos con las filas que existen y marca las que NO existen.
// Ausencia de fila no es un estado del dominio: es la falta de un registro de inventario,
// y se distingue con presente:false en vez de inventarle un estado_inventario.
//
// Solo se completa cuando NO hay filtro: con un filtro por tipo o por estado, marcar como
// ausentes los tipos que el propio filtro descartó sería mentir.
export const proyectarInventario = (
  filas,
  { completar = true } = {}
) => {
  if (!completar) {
    return filas.map(
      equipo => ({
        tipo_equipo: equipo.tipo_equipo,
        presente: true,
        equipo
      })
    );
  }

  const porTipo = new Map(
    filas.map(fila => [fila.tipo_equipo, fila])
  );

  return TIPOS_FISICOS.map(tipo => ({
    tipo_equipo: tipo,
    presente: porTipo.has(tipo),
    equipo: porTipo.get(tipo) ?? null
  }));
};
