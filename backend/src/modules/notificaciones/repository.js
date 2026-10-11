import { pool } from '../../config/database.js';

export const obtenerNotificacionesUsuario =
  async usuarioId => {
    const result = await pool.query(
      `SELECT
         id,
         tipo,
         titulo,
         mensaje,
         url,
         leida,
         fecha_creacion,
         fecha_lectura
       FROM notificaciones
       WHERE usuario_id = $1
       ORDER BY
         leida ASC,
         fecha_creacion DESC
       LIMIT 30`,
      [usuarioId]
    );

    return result.rows;
  };

export const obtenerCantidadNoLeidas =
  async usuarioId => {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS total
       FROM notificaciones
       WHERE usuario_id = $1
         AND leida = FALSE`,
      [usuarioId]
    );

    return result.rows[0]?.total || 0;
  };

export const marcarNotificacionLeida =
  async ({
    id,
    usuarioId
  }) => {
    const result = await pool.query(
      `UPDATE notificaciones
       SET
         leida = TRUE,
         fecha_lectura =
           COALESCE(
             fecha_lectura,
             CURRENT_TIMESTAMP
           )
       WHERE id = $1
         AND usuario_id = $2
       RETURNING *`,
      [
        id,
        usuarioId
      ]
    );

    return result.rows[0] || null;
  };

export const marcarTodasNotificacionesLeidas =
  async usuarioId => {
    await pool.query(
      `UPDATE notificaciones
       SET
         leida = TRUE,
         fecha_lectura =
           COALESCE(
             fecha_lectura,
             CURRENT_TIMESTAMP
           )
       WHERE usuario_id = $1
         AND leida = FALSE`,
      [usuarioId]
    );
  };

export const crearNotificacionUsuario =
  async ({
    usuarioId,
    tipo,
    titulo,
    mensaje,
    url = null
  }) => {
    const result = await pool.query(
      `INSERT INTO notificaciones (
         usuario_id,
         tipo,
         titulo,
         mensaje,
         url
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5
       )
       RETURNING *`,
      [
        usuarioId,
        tipo,
        titulo,
        mensaje,
        url
      ]
    );

    return result.rows[0] || null;
  };

export const crearNotificacionesPorRoles =
  async ({
    roles,
    tipo,
    titulo,
    mensaje,
    url = null,
    excluirUsuarioId = null
  }) => {
    const result = await pool.query(
      `INSERT INTO notificaciones (
         usuario_id,
         tipo,
         titulo,
         mensaje,
         url
       )
       SELECT
         u.id,
         $2,
         $3,
         $4,
         $5
       FROM usuarios u
       WHERE LOWER(BTRIM(u.rol)) =
             ANY($1::text[])
         AND LOWER(BTRIM(u.estado)) =
             'activo'
         AND (
           $6::integer IS NULL
           OR u.id <> $6
         )
       RETURNING *`,
      [
        roles,
        tipo,
        titulo,
        mensaje,
        url,
        excluirUsuarioId
      ]
    );

    return result.rows;
  };