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
      rol === 'ti' ||
      rol === 'supervisor';

    const clienteOperacionIds =
      accesoTotal
        ? []
        : normalizarIds(
          req.user.clienteOperacionIds
        );

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


export const validarRespuestaSolicitudVideo = datos => {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { status: 400 }); };
  if (!Array.isArray(datos?.enlaces_videos) || datos.enlaces_videos.length < 1 || datos.enlaces_videos.length > 20) {
    fallo('Agrega entre 1 y 20 enlaces de los videos.');
  }
  const enlaces = datos.enlaces_videos.map(valor => {
    if (typeof valor !== 'string' || valor.trim().length > 2048) fallo('Uno de los enlaces no es válido.');
    const enlace = valor.trim();
    let url;
    try { url = new URL(enlace); } catch { fallo('Usa enlaces completos que comiencen con https:// o http://.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fallo('Uno de los enlaces no es válido.');
    return enlace;
  });
  const observaciones = datos.observaciones_atencion ?? '';
  if (typeof observaciones !== 'string' || observaciones.length > 4000) fallo('Las observaciones deben tener como máximo 4000 caracteres.');
  return { enlacesVideos: [...new Set(enlaces)], observacionesAtencion: observaciones.trim() || null };
};


export const normalizarPlacasSolicitudVideo = datos => {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { status: 400 }); };
  if (!Array.isArray(datos?.placas) || !datos.placas.length) fallo('Debe seleccionar al menos una placa');
  const fechaValida = valor => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const fecha = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
  };
  const horaValida = valor => /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
  const vistas = new Set();
  return datos.placas.map(item => {
    const origen = typeof item === 'string' ? { ...datos, placa: item } : item;
    if (!origen || typeof origen !== 'object' || Array.isArray(origen) || typeof origen.placa !== 'string') fallo('Una de las placas no es válida');
    const placa = origen.placa.trim().toUpperCase();
    if (!placa || placa.length > 20) fallo('Una de las placas no es válida');
    if (vistas.has(placa)) fallo(`La placa ${placa} está repetida`);
    vistas.add(placa);
    const detalle = { placa };
    for (const campo of ['fecha_llegada_unidad', 'hora_llegada_unidad', 'fecha_descarga', 'hora_inicio', 'hora_fin']) {
      detalle[campo] = typeof origen[campo] === 'string' ? origen[campo].trim() : '';
    }
    if (!fechaValida(detalle.fecha_descarga)) fallo(`${placa}: indique una fecha de descarga válida`);
    if (!fechaValida(detalle.fecha_llegada_unidad) || !horaValida(detalle.hora_llegada_unidad)) fallo(`${placa}: indique una fecha y hora de llegada válidas`);
    if (!horaValida(detalle.hora_inicio) || !horaValida(detalle.hora_fin) || detalle.hora_fin <= detalle.hora_inicio) fallo(`${placa}: la hora final debe ser posterior a la hora inicial`);
    return detalle;
  });
};
