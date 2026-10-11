import { pool } from '../../config/database.js';

// ==========================================
// ESTADÍSTICAS PÚBLICAS
// ==========================================

export const obtenerTotalVehiculos =
  async () => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cantidad
       FROM vehiculos`
    );

    return Number(
      result.rows[0]?.cantidad || 0
    );
  };

export const obtenerInspeccionesHoy =
  async fecha => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cantidad
       FROM inspecciones_flota
       WHERE fecha_hora::date = $1::date`,
      [fecha]
    );

    return Number(
      result.rows[0]?.cantidad || 0
    );
  };

export const obtenerTickerInspecciones =
  async () => {
    const result = await pool.query(
      `SELECT
   placa,
   fecha_hora::date::text AS fecha,
   to_char(fecha_hora, 'HH24:MI') AS hora,
   tablet,
   radio,
   camaras
 FROM inspecciones_flota
 ORDER BY id DESC
 LIMIT 10`
    );

    return result.rows;
  };

export const obtenerTrabajosTI =
  async () => {
    const result = await pool.query(
      `SELECT
         id,
         tipo_solicitud,
         placa
       FROM incidentes_soporte
       WHERE estado IN (
         'Resuelto',
         'Concluido'
       )
       ORDER BY id DESC
       LIMIT 3`
    );

    return result.rows;
  };

// ==========================================
// CONSULTA POR PLACA
// ==========================================

export const obtenerUltimaInspeccionPublica =
  async placa => {
    const result = await pool.query(
      `SELECT *,
        fecha_hora::date::text AS fecha,
        to_char(fecha_hora, 'HH24:MI') AS hora
 FROM inspecciones_flota
 WHERE placa = $1
 ORDER BY id DESC
 LIMIT 1`,
      [placa]
    );

    return result.rows[0] || null;
  };

export const obtenerTimelinePublico =
  async placa => {
    const result = await pool.query(
      `SELECT
   fecha_hora::date::text AS fecha,
   to_char(fecha_hora, 'HH24:MI') AS hora,
   tablet,
   radio,
   camaras
 FROM inspecciones_flota
 WHERE placa = $1
 ORDER BY id DESC
 LIMIT 3`,
      [placa]
    );

    return result.rows;
  };

export const obtenerUltimoIncidentePublico =
  async placa => {
    const result = await pool.query(
      `SELECT estado, tipo_solicitud, fecha
       FROM incidentes_soporte
       WHERE placa = $1
       ORDER BY id DESC
       LIMIT 1`,
      [placa]
    );

    return result.rows[0] || null;
  };
