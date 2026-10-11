import {
  logAction
} from '../../services/auditService.js';

import {
  autenticarUsuario,
  AuthError
} from './service.js';

import { pool } from '../../config/database.js';

export const login =
  async (req, res) => {
    try {
      const resultado =
        await autenticarUsuario({
          username:
            req.body?.username,

          password:
            req.body?.password
        });

      await logAction(
        resultado.user.id,
        'Inicio de sesión exitoso',
        'usuarios',
        req,
        null,
        {
          id:
            resultado.user.id,

          username:
            resultado.user.username,

          rol:
            resultado.user.rol,

          operacion:
            resultado.user.operacion
        }
      );

      return res.json(
        resultado
      );
    } catch (error) {
      if (
        error instanceof
        AuthError
      ) {
        return res
          .status(
            error.status
          )
          .json({
            error:
              error.message
          });
      }

      console.error(
        'Error durante el inicio de sesión:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error del servidor'
        });
    }
  };

export const listarUsuariosActivosLogin = 
  async (req, res)=>{
    const busqueda = String (
      req.query?.q || ''
    ).trim();

    if(busqueda.length < 1){
      return res.json([]);
    }
    try{
      const result = await pool.query(
        `SELECT 
          username
        FROM usuarios
        WHERE LOWER(
          BTRIM(COALESCE(estado, ''))
        ) = 'activo'
          AND LOWER(BTRIM(username))
            LIKE LOWER($1)
        ORDER BY username ASC
        LIMIT 10`,
        [`${busqueda}%`]    
      );
      return res.json(
        result.rows.map(
          row => row.username
        )
      );
    }catch(error){
      console.error(
        'Error buscando usuarios para login',
        error
      );
      return res.status(500).json({
        error:
        'No se pudieron buscar los usuarios'
      });
    }
  };