import {
  ROLE_PERMISSIONS
} from '../../config/permissions.js';

import {
  obtenerUsuarioTicket
} from './repository.js';

export const OPERACIONES_INVALIDAS_TICKET = [
  '',
  'test',
  'text',
  'null',
  'undefined',
  'sin operacion',
  'sin operación',
  'falta identificar'
];

export const IMPLEMENTOS_PERMITIDOS = [
  'Tablet',
  'Radio Base',
  'Copiloto',
  'Handy',
  'Otros'
];

const normalizarRol = rol => {
  const rolNormalizado = String(rol || '')
    .trim()
    .toLowerCase();

  return rolNormalizado === 'administrador'
    ? 'admin'
    : rolNormalizado;
};

const normalizarIds = valores => [
  ...new Set(
    (Array.isArray(valores) ? valores : [])
      .map(valor => Number(valor))
      .filter(valor => Number.isInteger(valor) && valor > 0)
  )
];

export const contextoTicket =
  async (
    req,
    accion = 'ver'
  ) => {
    if (!req.user) {
      return {
        rol: 'publico',
        nombreSolicitante: null,
        personaId: null,
        accesoTotal: false,
        clienteOperacionIds: []
      };
    }

    const usuario =
      await obtenerUsuarioTicket(
        req.user.id
      );

    if (!usuario) {
      throw Object.assign(
        new Error('Usuario no encontrado'),
        { status: 401 }
      );
    }

    const rol =
      normalizarRol(usuario.rol);

    const estado = String(
      usuario.estado || ''
    )
      .trim()
      .toLowerCase();

    if (estado !== 'activo') {
      throw Object.assign(
        new Error(
          'La cuenta del usuario está inactiva'
        ),
        { status: 403 }
      );
    }

    if (
      !ROLE_PERMISSIONS[rol]
        ?.tickets?.[accion]
    ) {
      throw Object.assign(
        new Error(
          'La cuenta no tiene permiso para esta acción'
        ),
        { status: 403 }
      );
    }

    const accesoTotal =
      rol === 'admin' ||
      rol === 'ti';

    const clienteOperacionIds =
      accesoTotal
        ? []
        : normalizarIds(
          req.user.clienteOperacionIds
        );

    if (
      rol === 'supervisor' &&
      clienteOperacionIds.length === 0
    ) {
      throw Object.assign(
        new Error(
          'La cuenta no tiene clientes y operaciones asignados'
        ),
        { status: 403 }
      );
    }

    return {
      rol,
      nombreSolicitante:
        usuario.nombre_solicitante,
      personaId:
        usuario.persona_id || null,
      accesoTotal,
      clienteOperacionIds
    };
  };

export const componenteConFalla =
  valor => {
    const estado = String(valor || '')
      .trim()
      .toUpperCase();

    return [
      'FALTA',
      'ERROR',
      'SOPORTE'
    ].includes(estado);
  };

export const obtenerEvidenciasIniciales =
  valor => {
    if (Array.isArray(valor)) {
      return valor;
    }

    if (
      typeof valor !== 'string' ||
      !valor.trim()
    ) {
      return [];
    }

    try {
      const resultado = JSON.parse(valor);

      return Array.isArray(resultado)
        ? resultado
        : [];
    } catch {
      return [];
    }
  };

export const obtenerOperacionesUnicas =
  vehiculos => {
    return [
      ...new Map(
        (vehiculos || [])
          .filter(vehiculo =>
            String(
              vehiculo?.operacion || ''
            ).trim()
          )
          .map(vehiculo => [
            String(vehiculo.operacion)
              .trim()
              .toLowerCase(),
            String(vehiculo.operacion)
              .trim()
          ])
      ).values()
    ].sort((operacionA, operacionB) =>
      operacionA.localeCompare(
        operacionB,
        'es'
      )
    );
  };

export const obtenerClientesOperacionesUnicas =
  vehiculos => {
    const relaciones = new Map();

    for (const vehiculo of vehiculos || []) {
      const id = Number(
        vehiculo?.cliente_operacion_id
      );

      const cliente = String(
        vehiculo?.cliente || ''
      ).trim();

      const operacion = String(
        vehiculo?.operacion || ''
      ).trim();

      if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !cliente ||
        !operacion
      ) {
        continue;
      }

      relaciones.set(id, {
        id,
        cliente,
        operacion,
        etiqueta:
          `${cliente} - ${operacion}`
      });
    }

    return [...relaciones.values()]
      .sort((relacionA, relacionB) =>
        relacionA.etiqueta.localeCompare(
          relacionB.etiqueta,
          'es'
        )
      );
  };
