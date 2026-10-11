import {
  obtenerOperaciones,
  obtenerClientesConOperaciones,
  obtenerPersonalAdministrativo,
  obtenerUsuarios
} from './repository.js';

import {
  prepararNuevoUsuario,
  actualizarUsuarioCompleto,
  cambiarEstadoUsuario,
  UsuarioValidationError
} from './service.js';

import {
  logAction
} from '../../services/auditService.js';

// ==========================================
// OPERACIONES ANTIGUAS
// ==========================================

export const listarOperaciones =
  async (req, res) => {
    try {
      const operaciones =
        await obtenerOperaciones();

      return res.json(
        operaciones
      );
    } catch (error) {
      console.error(
        'Error obteniendo operaciones:',
        error
      );

      return res.status(500).json({
        error:
          'Error al obtener operaciones'
      });
    }
  };

// ==========================================
// CLIENTES Y OPERACIONES NUEVAS
// ==========================================

export const listarClientesOperaciones =
  async (req, res) => {
    try {
      const clientes =
        await obtenerClientesConOperaciones();

      return res.json(
        clientes
      );
    } catch (error) {
      console.error(
        'Error obteniendo clientes y operaciones:',
        error
      );

      return res.status(500).json({
        error:
          'Error al obtener clientes y operaciones'
      });
    }
  };

// ==========================================
// PERSONAL ADMINISTRATIVO
// ==========================================

export const listarPersonalAdministrativo =
  async (req, res) => {
    try {
      const personal =
        await obtenerPersonalAdministrativo();

      return res.json(
        personal
      );
    } catch (error) {
      console.error(
        'Error cargando personal administrativo:',
        error
      );

      return res.status(500).json({
        error:
          'Error al cargar personal administrativo'
      });
    }
  };

// ==========================================
// LISTADO DE USUARIOS
// ==========================================

export const listarUsuarios =
  async (req, res) => {
    try {
      const usuarios =
        await obtenerUsuarios();

      return res.json(
        usuarios
      );
    } catch (error) {
      console.error(
        'Error obteniendo usuarios:',
        error
      );

      return res.status(500).json({
        error:
          'Error al obtener usuarios'
      });
    }
  };

// ==========================================
// CREAR USUARIO
// ==========================================

export const registrarUsuario =
  async (req, res) => {
    try {
      const {
        usernameFinal,
        usuarioCreado
      } =
        await prepararNuevoUsuario(
          req.body
        );

      await logAction(
        req.user.id,
        `Usuario creado: ${usernameFinal}`,
        'usuarios',
        req,
        null,
        usuarioCreado
      );

      return res.status(201).json({
        success: true,
        id:
          usuarioCreado.id,
        usuario:
          usuarioCreado
      });
    } catch (error) {
      if (
        error instanceof
        UsuarioValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      if (error.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'La persona o el nombre de usuario ya están registrados'
          });
      }

      if (
        error.code === '23503' ||
        error.code === 'P0001'
      ) {
        return res
          .status(400)
          .json({
            error:
              error.code === 'P0001'
                ? error.message
                : 'Una de las operaciones seleccionadas no es válida'
          });
      }

      console.error(
        'Error creando usuario:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al crear usuario'
        });
    }
  };

// ==========================================
// EDITAR USUARIO
// ==========================================

export const actualizarUsuario =
  async (req, res) => {
    try {
      const {
        usuarioAnterior,
        usuarioActualizado
      } =
        await actualizarUsuarioCompleto({
          id:
            req.params.id,

          datos:
            req.body,

          usuarioActualId:
            req.user.id
        });

      await logAction(
        req.user.id,
        `Usuario actualizado: ${usuarioActualizado.username}`,
        'usuarios',
        req,
        usuarioAnterior,
        usuarioActualizado
      );

      return res.json({
        success: true,
        usuario:
          usuarioActualizado
      });
    } catch (error) {
      if (
        error instanceof
        UsuarioValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      if (error.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'El nombre de usuario ya está registrado'
          });
      }

      if (
        error.code === '23503' ||
        error.code === 'P0001'
      ) {
        return res
          .status(400)
          .json({
            error:
              error.code === 'P0001'
                ? error.message
                : 'Una de las operaciones seleccionadas no es válida'
          });
      }

      console.error(
        'Error editando usuario:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al actualizar usuario'
        });
    }
  };

// ==========================================
// ACTIVAR O DESACTIVAR
// ==========================================

export const cambiarEstado =
  async (req, res) => {
    try {
      const {
        estadoFinal,
        usuarioAnterior,
        usuarioActualizado
      } =
        await cambiarEstadoUsuario({
          id:
            req.params.id,

          estado:
            req.body?.estado,

          usuarioActualId:
            req.user.id
        });

      await logAction(
        req.user.id,
        `Usuario ${usuarioActualizado.username} cambiado a ${estadoFinal}`,
        'usuarios',
        req,
        usuarioAnterior,
        usuarioActualizado
      );

      return res.json({
        success: true,
        usuario:
          usuarioActualizado
      });
    } catch (error) {
      if (
        error instanceof
        UsuarioValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(
        'Error actualizando usuario:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al cambiar el estado del usuario'
        });
    }
  };