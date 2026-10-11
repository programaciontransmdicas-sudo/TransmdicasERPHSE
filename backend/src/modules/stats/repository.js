import { pool } from '../../config/database.js';

export const obtenerUsuarioPorUsername =
  async username => {
    const result =
      await pool.query(
        `SELECT *
         FROM usuarios
         WHERE username = $1`,
        [username]
      );

    return result.rows[0] || null;
  };

export const actualizarUltimoAcceso =
  async userId => {
    await pool.query(
      `UPDATE usuarios
       SET ultimo_acceso = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );
  };

// ==========================================
// ESTADÍSTICAS RÁPIDAS
// ==========================================

export const obtenerConteosRapidos =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const [
      vehiculosResult,
      inspeccionesResult
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)
         FROM vehiculos v
         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      ),

      pool.query(
        `SELECT COUNT(*)
         FROM inspecciones_flota i
         INNER JOIN vehiculos v
           ON v.placa = i.placa
         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      )
    ]);

    return {
      totalVehiculos:
        Number(
          vehiculosResult
            .rows[0]
            .count
        ),

      totalInspecciones:
        Number(
          inspeccionesResult
            .rows[0]
            .count
        )
    };
  };

// ==========================================
// DATOS PARA GRÁFICOS
// ==========================================

export const obtenerFechasInspecciones =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           fecha_hora::date::text AS fecha
         FROM inspecciones_flota i
         INNER JOIN vehiculos v
           ON v.placa = i.placa
         WHERE i.fecha_hora IS NOT NULL
           AND (
             $1::boolean = TRUE
             OR v.cliente_operacion_id =
                ANY($2::integer[])
           )`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows;
  };

export const obtenerFallosComponentes =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           SUM(
             CASE
               WHEN UPPER(TRIM(COALESCE(tablet, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               THEN 1
               ELSE 0
             END
           ) AS tablet_errors,

           SUM(
             CASE
               WHEN UPPER(TRIM(COALESCE(radio, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               THEN 1
               ELSE 0
             END
           ) AS radio_errors,

           SUM(
             CASE
               WHEN UPPER(TRIM(COALESCE(camaras, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               THEN 1
               ELSE 0
             END
           ) AS camaras_errors

         FROM inspecciones_flota i
         INNER JOIN vehiculos v
           ON v.placa = i.placa
         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows[0] || {};
  };

export const obtenerProgramasStats =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           COALESCE(
             NULLIF(
               CONCAT_WS(
                 ' - ',
                 NULLIF(TRIM(cliente), ''),
                 NULLIF(TRIM(operacion), '')
               ),
               ''
             ),
             'Sin Categoría'
           ) AS programa,

           COUNT(*) AS cantidad

         FROM vehiculos v

         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])

         GROUP BY
           COALESCE(
             NULLIF(
               CONCAT_WS(
                 ' - ',
                 NULLIF(TRIM(cliente), ''),
                 NULLIF(TRIM(operacion), '')
               ),
               ''
             ),
             'Sin Categoría'
           )

         ORDER BY programa`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows;
  };

export const obtenerSaludInspecciones =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           SUM(
             CASE
               WHEN UPPER(TRIM(COALESCE(tablet, ''))) IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               AND UPPER(TRIM(COALESCE(radio, ''))) IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               AND UPPER(TRIM(COALESCE(camaras, ''))) IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               THEN 1
               ELSE 0
             END
           ) AS aprobados,

           SUM(
             CASE
               WHEN UPPER(TRIM(COALESCE(tablet, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               OR UPPER(TRIM(COALESCE(radio, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               OR UPPER(TRIM(COALESCE(camaras, ''))) NOT IN (
                 'OK',
                 'N/A',
                 'NO APLICA',
                 ''
               )
               THEN 1
               ELSE 0
             END
           ) AS observados

         FROM inspecciones_flota i
         INNER JOIN vehiculos v
           ON v.placa = i.placa
         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows[0] || {};
  };

export const obtenerSoporteStats =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           COALESCE(
             estado,
             'Sin Estado'
           ) AS estado,

           COUNT(*) AS cantidad

         FROM incidentes_soporte s
         INNER JOIN vehiculos v
           ON v.placa = s.placa

         WHERE $1::boolean = TRUE
            OR v.cliente_operacion_id =
               ANY($2::integer[])

         GROUP BY
           COALESCE(
             estado,
             'Sin Estado'
           )

         ORDER BY estado`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows;
  };

export const obtenerInventarioAgrupado =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           COALESCE(
             tipo_movimiento,
             'Entrega'
           ) AS tipo_movimiento,

           COUNT(*) AS cantidad

         FROM entregas_ti e

         WHERE $1::boolean = TRUE
            OR e.cliente_operacion_id =
               ANY($2::integer[])

         GROUP BY
           COALESCE(
             tipo_movimiento,
             'Entrega'
           )

         ORDER BY tipo_movimiento`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows;
  };

export const obtenerTotalInventario =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT COUNT(*) AS cantidad
         FROM entregas_ti e
         WHERE $1::boolean = TRUE
            OR e.cliente_operacion_id =
               ANY($2::integer[])`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return Number(
      result.rows[0]
        ?.cantidad || 0
    );
  };
