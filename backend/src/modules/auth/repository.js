import {
  pool
} from '../../config/database.js';

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