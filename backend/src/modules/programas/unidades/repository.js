import { pool } from '../../../config/database.js';

// ==========================================
// UNIDADES DE UN PROGRAMA DE MANTENIMIENTO (TI-PR-01)
// SQL contra el modelo 013-016. Siempre parametrizado, columnas siempre explicitas.
// ==========================================
//
// NO se seleccionan ni se escriben fecha_base_m1, fecha_base_m2, fecha_base_m3 ni
// quincena_arranque: las retira 20261001_900 y hoy estan a NULL en las 174 filas reales.
// Todas las columnas que aparecen aqui sobreviven al cleanup.
//
// Cada funcion acepta un cliente opcional para poder ejecutarse dentro de una transaccion
// de prueba con ROLLBACK. Por defecto usa el pool, igual que el resto de los modulos.

// quincena_incorporacion como texto: date -> Date de JavaScript desplaza la zona.
const COLUMNAS_UNIDAD = `
  u.id,
  u.programa_id,
  u.placa,
  u.quincena_incorporacion::text AS quincena_incorporacion,
  u.observaciones,
  u.created_at,
  u.updated_at`;

// Datos del vehiculo por JOIN: no se duplican en programa_mantenimiento_unidades.
// Solo columnas que existen hoy en vehiculos.
const COLUMNAS_VEHICULO = `
  v.operacion,
  v.cliente,
  v.tipo_vehiculo,
  v.marca_tracto,
  v.modelo_tracto,
  v.anio_fabricacion::text AS anio_fabricacion`;

export const obtenerUnidadesPorPrograma = async (
  programaId,
  { placa = null } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_UNIDAD},
            ${COLUMNAS_VEHICULO}
     FROM programa_mantenimiento_unidades u
     JOIN vehiculos v ON v.placa = u.placa
     WHERE u.programa_id = $1
       AND ($2::text IS NULL OR u.placa = $2)
     ORDER BY u.placa ASC`,
    [programaId, placa]
  );

  return result.rows;
};

// El id se busca SIEMPRE acotado por programa_id: la ruta esta anidada bajo el programa,
// asi que una unidad de otro programa no debe encontrarse desde aqui. Es lo que expresa
// uq_programa_unidad_id_programa.
export const obtenerUnidadPorId = async (
  programaId,
  id,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS_UNIDAD},
            ${COLUMNAS_VEHICULO}
     FROM programa_mantenimiento_unidades u
     JOIN vehiculos v ON v.placa = u.placa
     WHERE u.programa_id = $1
       AND u.id = $2`,
    [programaId, id]
  );

  return result.rows[0] ?? null;
};

export const existeVehiculo = async (
  placa,
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT 1 AS existe
     FROM vehiculos
     WHERE placa = $1`,
    [placa]
  );

  return result.rowCount > 0;
};

export const insertarUnidad = async (
  {
    programa_id,
    placa,
    quincena_incorporacion,
    observaciones
  },
  cliente = pool
) => {
  const result = await cliente.query(
    `INSERT INTO programa_mantenimiento_unidades (
       programa_id,
       placa,
       quincena_incorporacion,
       observaciones
     )
     VALUES (
       $1,
       $2,
       $3::date,
       $4
     )
     RETURNING id`,
    [
      programa_id,
      placa,
      quincena_incorporacion,
      observaciones
    ]
  );

  return obtenerUnidadPorId(
    programa_id,
    result.rows[0].id,
    cliente
  );
};

export const actualizarUnidad = async (
  programaId,
  id,
  campos,
  data,
  cliente = pool
) => {
  // Lista blanca con su cast: campos ya viene filtrada por CAMPOS_EDITABLES en el service,
  // y aqui se vuelve a restringir para que ningun nombre llegue a la sentencia sin pasar
  // por ella.
  const permitidos = {
    quincena_incorporacion: {
      columna: 'quincena_incorporacion',
      cast: '::date'
    },
    observaciones: {
      columna: 'observaciones',
      cast: ''
    }
  };

  const asignaciones = [];
  const valores = [];

  for (const campo of campos) {
    const permitido = permitidos[campo];

    if (!permitido) {
      continue;
    }

    valores.push(data[campo]);
    asignaciones.push(
      `${permitido.columna} = $${valores.length}${permitido.cast}`
    );
  }

  if (asignaciones.length === 0) {
    return obtenerUnidadPorId(
      programaId,
      id,
      cliente
    );
  }

  valores.push(programaId, id);

  const result = await cliente.query(
    `UPDATE programa_mantenimiento_unidades
     SET ${asignaciones.join(', ')}
     WHERE programa_id = $${valores.length - 1}
       AND id = $${valores.length}
     RETURNING id`,
    valores
  );

  if (result.rowCount === 0) {
    return null;
  }

  return obtenerUnidadPorId(
    programaId,
    id,
    cliente
  );
};
