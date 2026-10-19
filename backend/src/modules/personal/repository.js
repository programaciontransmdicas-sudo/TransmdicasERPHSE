import { pool } from '../../config/database.js';
import {validarDatosPersonal} from './service.js';

export const obtenerPersonal = async (incluirInactivos = false) => {
  const result = await pool.query(
    `SELECT *
     FROM personal
     WHERE $1::boolean OR LOWER(BTRIM(estado)) = 'activo'
     ORDER BY nombre_completo ASC`,
    [incluirInactivos]
  );

  return result.rows;
};

export const crearPersonal = async ({
  nombre_completo,
  dni,
  modalidad,
  area,
  cargo,
  estado,
  cliente,
  operacion,
  cliente_operacion_id
}) => {
  const result = await pool.query(
    `INSERT INTO personal (
       nombre_completo,
       dni,
       modalidad,
       area,
       cargo,
       estado, cliente, operacion, cliente_operacion_id
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6, $7, $8, $9
     )
     RETURNING *`,
    [
      nombre_completo,
      dni,
      modalidad,
      area,
      cargo,
      estado || 'Activo', cliente, operacion, cliente_operacion_id
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
    `UPDATE personal SET estado = 'Inactivo'
    WHERE id = $1
    RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
};