import { pool } from '../../config/database.js';

export const obtenerMantenimientos = async () => {
  const result = await pool.query(
    `SELECT 
       v.placa,
       COALESCE(m.id, i.id, 0) AS id,
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
     ORDER BY v.placa ASC`
  );

  return result.rows;
};

export const crearMantenimiento = async ({
  placa,
  fecha_ejecutada,
  frecuencia_dias,
  dvr,
  copiloto,
  radio_base,
  handy,
  camara_interna,
  camara_externa,
  camara_retroceso,
  sensores_retroceso,
  sensores_delanteros,
  sistema_adas
}) => {
  const result = await pool.query(
    `INSERT INTO mantenimientos_tecnicos (
       placa,
       fecha_ejecutada,
       frecuencia_dias,
       dvr,
       copiloto,
       radio_base,
       handy,
       camara_interna,
       camara_externa,
       camara_retroceso,
       sensores_retroceso,
       sensores_delanteros,
       sistema_adas
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13
     )
     RETURNING *`,
    [
      placa,
      fecha_ejecutada,
      frecuencia_dias,
      dvr,
      copiloto,
      radio_base,
      handy,
      camara_interna,
      camara_externa,
      camara_retroceso,
      sensores_retroceso,
      sensores_delanteros,
      sistema_adas
    ]
  );

  return result.rows[0];
};