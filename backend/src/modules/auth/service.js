import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import {
  ROLE_PERMISSIONS
} from '../../config/permissions.js';

import {
  JWT_SECRET
} from '../../middlewares/auth.js';

import {
  obtenerUsuarioPorUsername,
  actualizarUltimoAcceso
} from './repository.js';

export class AuthError extends Error {
  constructor(
    message,
    status
  ) {
    super(message);

    this.name = 'AuthError';
    this.status = status;
  }
}

const normalizarRol =
  rol => {
    const rolOriginal =
      String(rol || '')
        .trim()
        .toLowerCase();

    return rolOriginal ===
      'administrador'
      ? 'admin'
      : rolOriginal;
  };

export const autenticarUsuario =
  async ({
    username,
    password
  }) => {
    const usernameFinal =
      String(
        username || ''
      ).trim();

    const passwordFinal =
      String(
        password || ''
      );

    if (
      !usernameFinal ||
      !passwordFinal
    ) {
      throw new AuthError(
        'Usuario y contraseña son obligatorios',
        400
      );
    }

    const user =
      await obtenerUsuarioPorUsername(
        usernameFinal
      );

    if (!user) {
      throw new AuthError(
        'Credenciales inválidas',
        401
      );
    }

    const validPassword =
      await bcrypt.compare(
        passwordFinal,
        user.password_hash
      );

    if (!validPassword) {
      throw new AuthError(
        'Credenciales inválidas',
        401
      );
    }

    const estadoUsuario =
      String(
        user.estado || 'activo'
      )
        .trim()
        .toLowerCase();

    if (
      estadoUsuario !== 'activo'
    ) {
      throw new AuthError(
        'Este usuario se encuentra inactivo. Comuníquese con el administrador.',
        403
      );
    }

    const rol =
      normalizarRol(
        user.rol
      );

    const permisos =
      ROLE_PERMISSIONS[rol];

    if (!permisos) {
      throw new AuthError(
        'El usuario tiene un rol antiguo o no válido. Comuníquese con el administrador.',
        403
      );
    }

    const operacion =
      user.operacion || null;

    await actualizarUltimoAcceso(
      user.id
    );

    const token =
      jwt.sign(
        {
          id:
            user.id,

          username:
            user.username,

          rol,

          permisos,

          operacion
        },
        JWT_SECRET,
        {
          expiresIn:
            '8h'
        }
      );

    return {
      token,

      user: {
        id:
          user.id,

        username:
          user.username,

        rol,

        permisos,

        operacion
      }
    };
  };