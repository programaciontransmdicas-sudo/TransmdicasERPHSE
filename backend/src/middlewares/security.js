import {
  isPublicRoute,
  verifyToken,
  requireAdmin,
  requirePermiso
} from './auth.js';

const PERMISSION_ROUTES = [
    {
    pattern: /^\/api\/notificaciones(?:\/|$)/,
    allowAuthenticated: true
  },
  {
    pattern: /^\/api\/usuarios(?:\/|$)/,
    adminOnly: true
  },
  {
    pattern: /^\/api\/personal(?:\/|$)/,
    modules: ['personal']
  },
  {
    pattern: /^\/api\/maestro(?:\/|$)/,
    modules: ['flota']
  },
  {
    pattern: /^\/vehiculos(?:\/|$)/,
    modules: ['flota']
  },
  {
    pattern: /^\/inspecciones(?:\/|$)/,
    modules: ['dashboard']
  },
  {
    pattern: /^\/api\/incidentes(?:\/|$)/,
    modules: ['tickets']
  },
  {
    pattern: /^\/api\/incidentes_soporte(?:\/|$)/,
    modules: ['tickets']
  },
  {
    pattern: /^\/mantenimientos(?:\/|$)/,
    modules: ['mantenimiento']
  },
  {
    pattern: /^\/api\/entregas(?:\/|$)/,
    modules: ['entregas', 'devoluciones']
  },
  {
    pattern: /^\/entregas(?:\/|$)/,
    modules: ['entregas', 'devoluciones']
  },
  {
    pattern: /^\/api\/reportes(?:\/|$)/,
    modules: ['reportes']
  },
  {
    pattern: /^\/reportes(?:\/|$)/,
    modules: ['reportes']
  },
  {
    pattern: /^\/stats(?:\/|$)/,
    modules: ['resumen']
  },
  {
    // TI-PR-01. Mismo modulo de permiso que /mantenimientos: es el mismo
    // dominio de negocio y ya existe en los permisos de usuario.
    pattern: /^\/api\/programas-mantenimiento(?:\/|$)/,
    modules: ['mantenimiento']
  }
];

export const authenticateRequest = (
  req,
  res,
  next
) => {
  if (
    req.method === 'OPTIONS' ||
    isPublicRoute(req)
  ) {
    return next();
  }

  return verifyToken(req, res, next);
};

export const authorizeRequest = (
  req,
  res,
  next
) => {
  if (isPublicRoute(req)) {
    return next();
  }

  const rule = PERMISSION_ROUTES.find(
    ({ pattern }) => pattern.test(req.path)
  );

  if (!rule) {
  return res.status(404).json({
    error: 'Ruta no encontrada'
  });
}

  // El permiso de lectura del supervisor se limita a un único historial filtrado.
  // También bloquea las rutas legacy, los detalles por ID y todas las escrituras.
  if (
    String(req.user?.rol || '').trim().toLowerCase() === 'supervisor' &&
    rule.modules?.includes('mantenimiento') &&
    !(req.method === 'GET' &&
      /^\/api\/programas-mantenimiento\/historial-supervisor\/?$/.test(req.path))
  ) {
    return res.status(403).json({
      error: 'Solo puedes consultar el historial de tus clientes y operaciones asignados'
    });
  }

  if (rule.adminOnly) {
    return requireAdmin(req, res, next);
  }
  if(rule.allowAuthenticated){
    return next();
  }

  const esCreacionTicket =
  req.method === 'POST' && (
    /^\/api\/incidentes_soporte\/?$/i.test(
      req.path
    ) ||
    /^\/api\/incidentes\/(?:pulseras|solicitudes-descarga-videos)\/?$/i.test(
      req.path
    )
  );
  const accion = esCreacionTicket
    ? 'crear'
    : (
      req.method === 'GET' ||
      req.method === 'HEAD'
        ? 'ver'
        : 'editar'
    );

  return requirePermiso(
    rule.modules,
    accion
  )(req, res, next);
};