import 'dotenv/config';
import jwt from 'jsonwebtoken';

import { pool } from '../config/database.js';
import { ROLE_PERMISSIONS } from '../config/permissions.js';

export const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 64) {
  throw new Error(
    'JWT_SECRET debe existir y contener al menos 64 caracteres'
  );
}

export const PUBLIC_ROUTES = [
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login\/?$/
  },
  {
    method:'GET',
    pattern: /^\/api\/auth\/usuarios-activos\/?$/
  },
  {
    method: 'POST',
    pattern: /^\/api\/public\/incidentes-soporte\/?$/
  },
  {
    method: 'GET',
    pattern: /^\/api\/public\/stats\/?$/
  },
  {
    method: 'GET',
    pattern: /^\/api\/public\/consulta\/[^/]+\/?$/
  },
  {
    method: 'GET',
    pattern: /^\/uploads\/.+$/
  },
  {
    method: 'HEAD',
    pattern: /^\/uploads\/.+$/
  }
];

export const isPublicRoute = req => {
  return PUBLIC_ROUTES.some(({ method, pattern }) => {
    return (
      req.method === method &&
      pattern.test(req.path)
    );
  });
};

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  const match = authHeader?.match(
    /^Bearer\s+(.+)$/i
  );

  const token = match?.[1];

  if (!token) {
    return res.status(401).json({
      error: 'Token requerido para acceder a este recurso'
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: 'Token inválido o expirado'
    });
  }

  try {
    const result = await pool.query(
      `SELECT
     u.id,
     u.username,
     u.rol,
     u.estado,
     u.operacion,

     -- F5.1 · la PERSONA detras de la cuenta. usuarios.persona_id -> personal(id) es la
     -- unica relacion que liga un usuario con una persona real, y ordenes_trabajo.tecnico_id
     -- referencia personal(id), no usuarios(id). Sin esta columna el cierre no puede
     -- resolver que tecnico ejecuto el mantenimiento. Es NULLABLE: no toda cuenta tiene
     -- persona, y quien la consuma tiene que tratar el null.
     u.persona_id,

     COALESCE(
       (
         SELECT array_agg(
           sa.cliente_operacion_id
           ORDER BY sa.cliente_operacion_id
         )
         FROM supervisor_asignaciones sa
         INNER JOIN cliente_operaciones co
           ON co.id =
              sa.cliente_operacion_id
         INNER JOIN clientes c
           ON c.id =
              co.cliente_id
         WHERE sa.usuario_id = u.id
           AND co.activo = TRUE
           AND c.activo = TRUE
           AND c.es_interno = FALSE
       ),
       ARRAY[]::integer[]
     ) AS cliente_operacion_ids

   FROM usuarios u
   WHERE u.id = $1`,
      [decoded.id]
    );

    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({
        error: 'El usuario de esta sesión ya no existe'
      });
    }

    const estadoUsuario = String(
      usuario.estado || 'activo'
    )
      .trim()
      .toLowerCase();

    if (estadoUsuario !== 'activo') {
      return res.status(401).json({
        error: 'El usuario se encuentra inactivo'
      });
    }

    const rolOriginal = String(
      usuario.rol || ''
    )
      .trim()
      .toLowerCase();

    const rol = rolOriginal === 'administrador'
      ? 'admin'
      : rolOriginal;

    const permisos = ROLE_PERMISSIONS[rol];

    if (!permisos) {
      return res.status(403).json({
        error: 'El usuario tiene un rol no válido'
      });
    }

    const clienteOperacionIds =
      Array.isArray(
        usuario.cliente_operacion_ids
      )
        ? usuario
          .cliente_operacion_ids
          .map(Number)
          .filter(Number.isInteger)
        : [];

    req.user = {
      ...decoded,
      id:
        usuario.id,
      username:
        usuario.username,
      rol,
      permisos,

      // Se conserva temporalmente.
      operacion:
        usuario.operacion || null,

      // Nuevo alcance real del supervisor.
      clienteOperacionIds,

      // F5.1 · AÑADIDO, no sustituye nada. La persona ligada a la cuenta, o null. Se
      // normaliza a entero o null para que quien lo consuma no reciba un string.
      persona_id: Number.isInteger(usuario.persona_id)
        ? usuario.persona_id
        : null
    };

    return next();
  } catch (error) {
    console.error(
      'Error verificando el estado del usuario:',
      error
    );

    return res.status(500).json({
      error: 'Error al verificar la sesión'
    });
  }
};

export const tieneAccesoTotalFlota =
  req => {
    const rol = String(
      req.user?.rol || ''
    )
      .trim()
      .toLowerCase();

    return (
      rol === 'admin' ||
      rol === 'administrador' ||
      rol === 'ti' ||
      (rol === 'supervisor' && ['GET', 'HEAD'].includes(req.method))
    );
  };

export const obtenerClienteOperacionIds =
  req => {
    if (
      tieneAccesoTotalFlota(req)
    ) {
      return null;
    }

    return Array.isArray(
      req.user?.clienteOperacionIds
    )
      ? req.user
        .clienteOperacionIds
        .map(Number)
        .filter(Number.isInteger)
      : [];
  };

export const puedeAccederClienteOperacion =
  (
    req,
    clienteOperacionId
  ) => {
    if (
      tieneAccesoTotalFlota(req)
    ) {
      return true;
    }

    const id =
      Number(clienteOperacionId);

    return (
      Number.isInteger(id) &&
      obtenerClienteOperacionIds(req)
        .includes(id)
    );
  };

export const requireAdmin = (req, res, next) => {
  const rol = String(
    req.user?.rol || ''
  ).toLowerCase();

  if (
    rol !== 'admin' &&
    rol !== 'administrador'
  ) {
    return res.status(403).json({
      error:
        'Acceso denegado. Se requiere rol de Administrador.'
    });
  }

  return next();
};

export const requirePermiso = (
  modulos,
  accion
) => {
  return (req, res, next) => {
    const rol = String(
      req.user?.rol || ''
    ).toLowerCase();

    if (
      rol === 'admin' ||
      rol === 'administrador'
    ) {
      return next();
    }

    const listaModulos = Array.isArray(modulos)
      ? modulos
      : [modulos];

    const permitido = listaModulos.some(modulo => {
      return (
        req.user?.permisos?.[modulo]?.[accion] === true
      );
    });

    if (!permitido) {
      return res.status(403).json({
        error:
          'No tienes permiso para acceder a este recurso'
      });
    }

    return next();
  };
};

export const hasPermiso = (
  req,
  modulo,
  accion
) => {
  const rol = String(
    req.user?.rol || ''
  ).toLowerCase();

  if (
    rol === 'admin' ||
    rol === 'administrador'
  ) {
    return true;
  }

  return (
    req.user?.permisos?.[modulo]?.[accion] === true
  );
};

export const getModuloMovimiento = tipoMovimiento => {
  const tipo = String(
    tipoMovimiento || 'Entrega'
  )
    .trim()
    .toLowerCase();

  return (
    tipo === 'devolución' ||
    tipo === 'devolucion'
  )
    ? 'devoluciones'
    : 'entregas';
};
