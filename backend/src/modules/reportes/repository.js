import {
  pool
} from '../../config/database.js';

// ==========================================
// OPERACIONES
// ==========================================

export const obtenerOperacionesReportes =
  async () => {
    const result = await pool.query(
      `SELECT
         v.cliente_operacion_id AS id,
         MIN(BTRIM(v.cliente)) AS cliente,
         MIN(BTRIM(v.operacion)) AS operacion
       FROM vehiculos v
       WHERE v.cliente_operacion_id IS NOT NULL
       GROUP BY v.cliente_operacion_id
       ORDER BY
         MIN(BTRIM(v.cliente)),
         MIN(BTRIM(v.operacion))`
    );

    return result.rows.map(row => ({
      id: row.id,
      cliente: row.cliente,
      operacion: row.operacion,
      etiqueta: `${row.cliente} — ${row.operacion}`
    }));
  };
// ==========================================
// MANTENIMIENTO EXCEL
// ==========================================

export const obtenerDatosMantenimientoReporte =
  async () => {
    const query = `
      SELECT
        v.*,

          COALESCE(
          i.fecha_hora::date::text,
          m.fecha_ejecutada::text
        ) AS fecha_ejecutada_raw,

        COALESCE(
          m.frecuencia_dias,
          180
        ) AS frecuencia_dias,

        CASE
          WHEN i.camaras ILIKE '%OK%'
          THEN 'OK'
          ELSE COALESCE(
            m.dvr,
            'N/A'
          )
        END AS dvr,

        CASE
          WHEN i.tablet ILIKE '%OK%'
          THEN 'OK'
          ELSE COALESCE(
            m.copiloto,
            'N/A'
          )
        END AS copiloto,

        CASE
          WHEN i.radio ILIKE '%OK%'
          THEN 'OK'
          ELSE COALESCE(
            m.radio_base,
            'N/A'
          )
        END AS radio_base,

        COALESCE(
          m.handy,
          'N/A'
        ) AS handy,

        COALESCE(
          m.camara_interna,
          'N/A'
        ) AS camara_interna,

        COALESCE(
          m.camara_externa,
          'N/A'
        ) AS camara_externa,

        COALESCE(
          m.camara_retroceso,
          'N/A'
        ) AS camara_retroceso,

        COALESCE(
          m.sensores_retroceso,
          'N/A'
        ) AS sensores_retroceso,

        COALESCE(
          m.sensores_delanteros,
          'N/A'
        ) AS sensores_delanteros,

        COALESCE(
          m.sistema_adas,
          'N/A'
        ) AS sistema_adas

      FROM vehiculos v

      LEFT JOIN (
        SELECT
          placa,
          fecha_hora,
          camaras,
          tablet,
          radio,
          id,

          ROW_NUMBER() OVER (
            PARTITION BY placa
            ORDER BY id DESC
          ) AS rn

        FROM inspecciones_flota
      ) i
        ON v.placa = i.placa
       AND i.rn = 1

      LEFT JOIN (
        SELECT
          *,

          ROW_NUMBER() OVER (
            PARTITION BY placa
            ORDER BY id DESC
          ) AS rn

        FROM mantenimientos_tecnicos
      ) m
        ON v.placa = m.placa
       AND m.rn = 1

      ORDER BY v.placa ASC
    `;

    const result =
      await pool.query(query);

    return result.rows;
  };