import { pool } from '../../config/database.js';
import {validarDatosPersonal} from './service.js';

export const obtenerPersonal = async () => {
  const result = await pool.query(
    `SELECT *
     FROM personal
     ORDER BY nombre_completo ASC`
  );

  return result.rows;
};

export const crearPersonal = async ({
  nombre_completo,
  dni,
  modalidad,
  area,
  cargo,
  estado
}) => {
  const result = await pool.query(
    `INSERT INTO personal (
       nombre_completo,
       dni,
       modalidad,
       area,
       cargo,
       estado
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6
     )
     RETURNING *`,
    [
      nombre_completo,
      dni,
      modalidad,
      area,
      cargo,
      estado || 'Activo'
    ]
  );

  return result.rows[0];
};
   
export const actualizarPersonal =
  async (id, datos) => {
    const cambios =
      validarDatosPersonal(
        datos,
        true
      );

    const campos =
      Object.keys(cambios);

    const asignaciones =
      campos.map(
        (campo, index) =>
          `${campo} = $${index + 1}`
      );

    const valores =
      campos.map(
        campo => cambios[campo]
      );

    const result =
      await pool.query(
        `UPDATE personal
         SET ${asignaciones.join(', ')}
         WHERE id = $${campos.length + 1}
         RETURNING *`,
        [
          ...valores,
          id
        ]
      );

    return result.rows[0] || null;
  };


export const eliminarPersonal=
async id=>{
  const result = 
  await pool.query(
    `DELETE FROM personal
    WHERE id = $1
    RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
};