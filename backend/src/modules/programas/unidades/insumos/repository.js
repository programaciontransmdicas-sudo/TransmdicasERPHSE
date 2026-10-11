import { pool } from '../../../../config/database.js';

// ==========================================
// INSUMOS DE UNA UNIDAD DEL PROGRAMA (TI-PR-01)
// SQL contra el modelo 013-016. Parametrizado, columnas explícitas, SOLO LECTURA.
// ==========================================
//
// NINGUNA de estas funciones escribe. Los ciclos los mueve el cierre de la orden de
// trabajo -cerrar_orden_trabajo()-, y las anclas las siembra el loader inicial. Exponerlos
// no es moverlos.
//
// Cada función acepta un cliente opcional para poder ejecutarse dentro de una transacción
// de prueba con ROLLBACK.

// Fechas como texto: date -> Date de JavaScript desplaza la zona horaria.
const COLUMNAS_EQUIPO = `
  e.id,
  e.placa,
  e.tipo_equipo,
  e.estado_inventario,
  e.marca,
  e.numero_serie,
  e.fecha_instalacion::text AS fecha_instalacion,
  e.observaciones,
  e.fuente,
  e.created_at,
  e.updated_at`;

// ultima_quincena es la quincena ADMINISTRATIVA -día 1 o 16, NOT NULL-.
// ultima_fecha_real es el día FISICO en que se hizo el trabajo, y es independiente: puede
// caer en otra quincena y NO mueve el ciclo. Se exponen las dos, separadas.
const COLUMNAS_CICLO = `
  c.id,
  c.programa_unidad_id,
  c.programa_id,
  c.tipo_equipo,
  c.nivel_mantenimiento,
  c.ultima_quincena::text    AS ultima_quincena,
  c.ultima_fecha_real::text  AS ultima_fecha_real,
  c.fuente,
  c.orden_trabajo_detalle_id,
  c.observaciones,
  c.created_at,
  c.updated_at`;

// El ancla NO tiene fecha física, ni fuente, ni referencia a OT: no representa una
// ejecución. Solo el punto de partida de la fase y de dónde salió.
const COLUMNAS_ANCLA = `
  a.id,
  a.programa_unidad_id,
  a.programa_id,
  a.tipo_equipo,
  a.nivel_mantenimiento,
  a.quincena_ancla::text AS quincena_ancla,
  a.origen,
  a.observaciones,
  a.created_at,
  a.updated_at`;

// El inventario se resuelve por PLACA, que es la clave de vehiculo_equipos, y la placa se
// toma de la unidad del programa: así el inventario devuelto es siempre el de esa unidad y
// no el de una placa arbitraria.
export const obtenerEquiposDeUnidad = async (
  programaId,
  unidadId,
  {
    tipo_equipo = null,
    estado_inventario = null
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_EQUIPO}
     FROM programa_mantenimiento_unidades u
     JOIN vehiculo_equipos e ON e.placa = u.placa
     WHERE u.programa_id = $1
       AND u.id = $2
       AND ($3::text IS NULL OR e.tipo_equipo = $3)
       AND ($4::text IS NULL OR e.estado_inventario = $4)
     ORDER BY e.tipo_equipo ASC`,
    [
      programaId,
      unidadId,
      tipo_equipo,
      estado_inventario
    ]
  );

  return result.rows;
};

export const obtenerCiclosDeUnidad = async (
  programaId,
  unidadId,
  {
    tipo_equipo = null,
    nivel_mantenimiento = null
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_CICLO}
     FROM programa_mantenimiento_unidad_ciclos c
     WHERE c.programa_id = $1
       AND c.programa_unidad_id = $2
       AND ($3::text IS NULL OR c.tipo_equipo = $3)
       AND ($4::text IS NULL OR c.nivel_mantenimiento = $4)
     ORDER BY c.tipo_equipo ASC, c.nivel_mantenimiento ASC`,
    [
      programaId,
      unidadId,
      tipo_equipo,
      nivel_mantenimiento
    ]
  );

  return result.rows;
};

export const obtenerAnclasDeUnidad = async (
  programaId,
  unidadId,
  {
    tipo_equipo = null,
    nivel_mantenimiento = null
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_ANCLA}
     FROM programa_mantenimiento_unidad_anclas a
     WHERE a.programa_id = $1
       AND a.programa_unidad_id = $2
       AND ($3::text IS NULL OR a.tipo_equipo = $3)
       AND ($4::text IS NULL OR a.nivel_mantenimiento = $4)
     ORDER BY a.tipo_equipo ASC, a.nivel_mantenimiento ASC`,
    [
      programaId,
      unidadId,
      tipo_equipo,
      nivel_mantenimiento
    ]
  );

  return result.rows;
};
