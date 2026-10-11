import { pool } from '../../config/database.js';

export const existeVehiculo = async ({
  placa,
  accesoTotal,
  clienteOperacionIds
}) => {
  const result = await pool.query(
    `SELECT placa
     FROM public.vehiculos
     WHERE placa = $1
       AND (
         $2::boolean = TRUE
         OR cliente_operacion_id =
            ANY($3::integer[])
       )`,
    [
      placa,
      Boolean(accesoTotal),
      clienteOperacionIds || []
    ]
  );

  return result.rows.length > 0;
};

export const obtenerHistorial = async ({
  placa,
  accesoTotal,
  clienteOperacionIds
}) => {
  const result = await pool.query(
    `SELECT i.*,
       i.fecha_hora::date::text AS fecha,
       to_char(i.fecha_hora, 'HH24:MI') AS hora
     FROM inspecciones_flota i
     INNER JOIN vehiculos v
       ON v.placa = i.placa
     WHERE i.placa = $1
       AND (
         $2::boolean = TRUE
         OR v.cliente_operacion_id =
            ANY($3::integer[])
       )
     ORDER BY i.id DESC`,
    [
      placa,
      Boolean(accesoTotal),
      clienteOperacionIds || []
    ]
  );

  return result.rows;
};

export const crearInspeccion = async ({
  placa,
  fechaHora,
  tablet,
  radio,
  camaras,
  imgTablet,
  imgRadio,
  imgCamaras,
  observaciones,
  accesoTotal,
  clienteOperacionIds
}) => {
  let client;
  let descartar = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO inspecciones_flota (
     placa,
     fecha_hora,
     tablet,
     radio,
     camaras,
     img_tablet,
     img_radio,
     img_camaras,
     observaciones
   )
   SELECT
     $1, $2, $3, $4, $5,
     $6, $7, $8, $9
   FROM vehiculos v
   WHERE v.placa = $1
     AND (
       $10::boolean = TRUE
       OR v.cliente_operacion_id =
          ANY($11::integer[])
     )
   RETURNING *,
             fecha_hora::date::text AS fecha,
             to_char(fecha_hora, 'HH24:MI') AS hora`,
      [
        placa,
        fechaHora,
        tablet,
        radio,
        camaras,
        imgTablet,
        imgRadio,
        imgCamaras,
        observaciones || '',
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );
    await client.query('COMMIT');

    return result.rows[0];
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        descartar = true;
      }
    }

    throw error;
  } finally {
    if (client) {
      client.release(descartar);
    }
  }
};

export const obtenerInspeccionPorId =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT i.*,
              i.fecha_hora::date::text AS fecha,
              to_char(i.fecha_hora, 'HH24:MI') AS hora
       FROM inspecciones_flota i
       INNER JOIN vehiculos v
         ON v.placa = i.placa
       WHERE i.id = $1
         AND (
           $2::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($3::integer[])
         )`,
      [
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

export const actualizarInspeccion =
  async ({
    id,
    fechaHora,
    tablet,
    radio,
    camaras,
    imgTablet,
    imgRadio,
    imgCamaras,
    observaciones,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `UPDATE inspecciones_flota
   SET fecha_hora = $1,
       tablet = $2,
       radio = $3,
       camaras = $4,
       img_tablet = $5,
       img_radio = $6,
       img_camaras = $7,
       observaciones = $8
   FROM vehiculos v
   WHERE inspecciones_flota.id = $9
     AND v.placa = inspecciones_flota.placa
     AND (
       $10::boolean = TRUE
       OR v.cliente_operacion_id =
          ANY($11::integer[])
     )
   RETURNING inspecciones_flota.*,
             inspecciones_flota.fecha_hora::date::text AS fecha,
             to_char(inspecciones_flota.fecha_hora, 'HH24:MI') AS hora`,
      [
        fechaHora,
        tablet,
        radio,
        camaras,
        imgTablet,
        imgRadio,
        imgCamaras,
        observaciones || '',
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );


    return result.rows[0] || null;
  };

export const eliminarInspeccion =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `DELETE FROM inspecciones_flota i
       USING vehiculos v
       WHERE i.id = $1
         AND v.placa = i.placa
         AND (
           $2::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($3::integer[])
         )
       RETURNING i.*,
          i.fecha_hora::date::text AS fecha,
          to_char(i.fecha_hora, 'HH24:MI') AS hora`,
      [
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };
