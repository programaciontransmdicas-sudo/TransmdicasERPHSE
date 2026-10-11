import { pool } from '../../../config/database.js';

// Misma fuente de verdad que el service: las familias anuales las define el nucleo.
import {
  ANUALES
} from '../../../../scripts/ti-pr-01/generador-nucleo.mjs';

// ==========================================
// FRECUENCIAS DE UN PROGRAMA (TI-PR-01)
// SQL contra el modelo 013-016. Parametrizado, columnas explícitas.
// ==========================================
//
// version_id se expone porque existe y es NULLABLE a propósito: 20260923_004 la dejó como
// referencia DOCUMENTAL opcional. La clave operativa es programa_id, que es la que
// gobierna uq_frecuencia_programa_equipo_nivel. Hoy las 14 filas la tienen en NULL.
//
// Cada función acepta un cliente opcional para poder ejecutarse dentro de una transacción
// de prueba con ROLLBACK.

const COLUMNAS = `
  f.id,
  f.programa_id,
  f.version_id,
  f.tipo_equipo,
  f.nivel_mantenimiento,
  f.frecuencia_quincenas,
  f.created_at,
  f.updated_at`;

// Una sola consulta. El orden reproduce el del cajetín: familias regulares y luego anuales,
// y dentro de cada una M1, M2, M3.
export const obtenerFrecuencias = async (
  programaId,
  {
    tipo_equipo = null,
    nivel_mantenimiento = null
  } = {},
  cliente = pool
) => {
  const result = await cliente.query(
    `SELECT ${COLUMNAS}
     FROM programa_mantenimiento_frecuencias f
     WHERE f.programa_id = $1
       AND ($2::text IS NULL OR f.tipo_equipo = $2)
       AND ($3::text IS NULL OR f.nivel_mantenimiento = $3)
     ORDER BY
       CASE WHEN f.tipo_equipo = ANY($4::text[]) THEN 1 ELSE 0 END,
       f.tipo_equipo,
       f.nivel_mantenimiento`,
    [
      programaId,
      tipo_equipo,
      nivel_mantenimiento,
      ANUALES
    ]
  );

  return result.rows;
};
