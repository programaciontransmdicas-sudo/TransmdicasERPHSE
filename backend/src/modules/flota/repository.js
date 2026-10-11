import { pool } from '../../config/database.js';

export const buscarVehiculos = async ({
  search,
  operacion,
  accesoTotal,
  clienteOperacionIds
}) => {
  let whereClause = `
    WHERE (
      $1::boolean = TRUE
      OR v.cliente_operacion_id =
         ANY($2::integer[])
    )
  `;

  const params = [
    Boolean(accesoTotal),
    clienteOperacionIds || []
  ];
  let paramIndex = 3;

  if (search) {
    whereClause += `
      AND (
        LOWER(v.placa) LIKE $${paramIndex}
        OR LOWER(COALESCE(v.operacion, ''))
           LIKE $${paramIndex}
      )
    `;

    params.push(`%${search}%`);
    paramIndex++;
  }

  if (operacion) {
    if (operacion === 'Falta identificar') {
      whereClause += `
        AND (
          v.operacion IS NULL
          OR BTRIM(v.operacion) = ''
          OR LOWER(BTRIM(v.operacion))
             IN (
               'sin operación',
               'sin operacion',
               'falta identificar'
             )
        )
      `;
    } else if (operacion === 'Industrias') {
      whereClause += `
        AND LOWER(COALESCE(v.operacion, ''))
            LIKE $${paramIndex}
      `;

      params.push('%industria%');
      paramIndex++;
    } else if (operacion === 'Bambas') {
      whereClause += `
        AND LOWER(COALESCE(v.operacion, ''))
            LIKE $${paramIndex}
      `;

      params.push('%bambas%');
      paramIndex++;
    } else {
      whereClause += `
        AND LOWER(BTRIM(v.operacion))
            = $${paramIndex}
      `;

      params.push(
        operacion.toLowerCase()
      );

      paramIndex++;
    }
  }

  const result = await pool.query(
    `SELECT
       v.placa,
       v.operacion AS programa,
       v.tipo_vehiculo,
       v.marca_tracto,
       v.modelo_tracto,
       v.anio_fabricacion,
       v.operacion,
       v.cliente,
       v.cliente_operacion_id,

       i.tablet,
       i.radio,
       i.camaras,

       i.estado AS estado_inspeccion,

       i.fecha_hora::date::text AS fecha,
       to_char(
         i.fecha_hora,
         'HH24:MI'
       ) AS hora,

       i.observaciones

     FROM vehiculos v

     LEFT JOIN (
       SELECT
         placa,
         tablet,
         radio,
         camaras,
         estado,
         fecha_hora,
         observaciones,

         ROW_NUMBER() OVER (
           PARTITION BY placa
           ORDER BY id DESC
         ) AS rn

       FROM inspecciones_flota
     ) i

       ON v.placa = i.placa
      AND i.rn = 1

     ${whereClause}

     ORDER BY v.placa ASC`,
    params
  );

  return result.rows;
};

export const insertarVehiculo = async ({
  placa,
  operacion,
  tipo_vehiculo,
  cliente,
  marca_tracto,
  modelo_tracto,
  anio_fabricacion
}) => {
  const result = await pool.query(
    `INSERT INTO vehiculos (
       placa,
       operacion,
       tipo_vehiculo,
       cliente,
       marca_tracto,
       modelo_tracto,
       anio_fabricacion
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7
     )
     RETURNING *`,
    [
      placa,
      operacion,
      tipo_vehiculo || null,
      cliente || null,
      marca_tracto || null,
      modelo_tracto || null,
      anio_fabricacion || null
    ]
  );

  return result.rows[0];
};

export const obtenerVehiculoPorPlaca =
  async placa => {
    const result = await pool.query(
      `SELECT *
       FROM vehiculos
       WHERE placa = $1`,
      [placa]
    );

    return result.rows[0] || null;
  };

export const actualizarVehiculo =
  async (
    placa,
    campos,
    data
  ) => {
    const cambios = campos
      .map(
        (campo, indice) =>
          `${campo} = $${indice + 1}`
      )
      .join(', ');

    const valores = campos.map(
      campo => {
        if (data[campo] === null) {
          return null;
        }

        return (
          data[campo].trim() ||
          null
        );
      }
    );

    valores.push(placa);

    const result = await pool.query(
      `UPDATE vehiculos
       SET ${cambios}
       WHERE placa = $${valores.length}
       RETURNING *`,
      valores
    );

    return result.rows[0] || null;
  };

export const eliminarVehiculo =
  async placa => {
    const result = await pool.query(
      `DELETE FROM vehiculos
       WHERE placa = $1
       RETURNING *`,
      [placa]
    );

    return result.rows[0] || null;
  };

export const obtenerTractos = async ({
  accesoTotal,
  clienteOperacionIds
}) => {
  const result = await pool.query(
    `SELECT *
     FROM vehiculos v
     WHERE $1::boolean = TRUE
        OR v.cliente_operacion_id =
           ANY($2::integer[])
     ORDER BY placa ASC`,
    [
      Boolean(accesoTotal),
      clienteOperacionIds || []
    ]
  );

  return result.rows;
};
