import bcrypt from 'bcryptjs';

import {
  ROLE_PERMISSIONS
} from '../../config/permissions.js';

import {
  crearUsuarioConAsignaciones,
  obtenerUsuarioPorId,
  actualizarEstadoUsuario,
  actualizarUsuarioConAsignaciones,
  obtenerPersonalAdministrativoPorDni,
  obtenerUsuarioPorPersonaId,
  obtenerUsuarioPorUsername,
  contarClienteOperacionesAsignables
} from './repository.js';

export class UsuarioValidationError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name =
      'UsuarioValidationError';

    this.status = status;
  }
}

// ==========================================
// USERNAME AUTOMÁTICO
// ==========================================

const generarUsername =
  nombreCompleto => {
    const partes =
      String(nombreCompleto || '')
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        )
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .map(
          parte =>
            parte.replace(
              /[^a-z0-9]/g,
              ''
            )
        )
        .filter(Boolean);

    if (partes.length < 3) {
      throw new UsuarioValidationError(
        'El nombre completo no permite generar el username'
      );
    }

    const primerApellido =
      partes[0];

    const primerNombre =
      partes[2];

    return (
      `${primerNombre.charAt(0)}` +
      `${primerApellido}`
    );
  };

// ==========================================
// VALIDACIÓN DE CONTRASEÑA AL EDITAR
// ==========================================

const validarNuevaPassword =
  password => {
    if (typeof password !== 'string') {
      throw new UsuarioValidationError(
        'La contraseña debe ser un texto'
      );
    }

    if (!password.trim()) {
      throw new UsuarioValidationError(
        'La contraseña no puede contener solo espacios'
      );
    }

    if ([...password].length < 15) {
      throw new UsuarioValidationError(
        'La contraseña debe tener al menos 15 caracteres'
      );
    }

    if (bcrypt.truncates(password)) {
      throw new UsuarioValidationError(
        'La contraseña supera el límite de 72 bytes; usa una más corta'
      );
    }
  };

// ==========================================
// NORMALIZAR ASIGNACIONES
// ==========================================

const normalizarClienteOperacionIds =
  valor => {
    if (!Array.isArray(valor)) {
      throw new UsuarioValidationError(
        'Las operaciones asignadas deben enviarse como una lista'
      );
    }

    const ids = valor.map(
      id => Number(id)
    );

    if (
      ids.some(
        id =>
          !Number.isInteger(id) ||
          id <= 0
      )
    ) {
      throw new UsuarioValidationError(
        'Existe una operación seleccionada no válida'
      );
    }

    return [
      ...new Set(ids)
    ];
  };

const validarAsignacionesSupervisor =
  async clienteOperacionIds => {
    if (clienteOperacionIds.length === 0) {
      throw new UsuarioValidationError(
        'Debe asignar por lo menos una operación al supervisor'
      );
    }

    const cantidadValida =
      await contarClienteOperacionesAsignables(
        clienteOperacionIds
      );

    if (
      cantidadValida !==
      clienteOperacionIds.length
    ) {
      throw new UsuarioValidationError(
        'Una o más operaciones seleccionadas no existen, están inactivas o son internas'
      );
    }
  };

// ==========================================
// CREAR USUARIO
// ==========================================

export const prepararNuevoUsuario =
  async datos => {
    const {
      username,
      rol,
      estado,
      clienteOperacionIds
    } = datos || {};

    /*
     * Por compatibilidad, el frontend envía
     * el DNI dentro de username.
     */
    const dniSeleccionado =
      String(username || '').trim();

    if (
      !/^\d{8}$/.test(
        dniSeleccionado
      )
    ) {
      throw new UsuarioValidationError(
        'Seleccione un trabajador con un DNI válido'
      );
    }

    const persona =
      await obtenerPersonalAdministrativoPorDni(
        dniSeleccionado
      );

    if (!persona) {
      throw new UsuarioValidationError(
        'Seleccione un trabajador administrativo activo'
      );
    }

    const usuarioDePersona =
      await obtenerUsuarioPorPersonaId(
        persona.id
      );

    if (usuarioDePersona) {
      throw new UsuarioValidationError(
        'La persona seleccionada ya tiene un usuario',
        409
      );
    }

    const usernameFinal =
      generarUsername(
        persona.nombre_completo
      );

    const usernameExistente =
      await obtenerUsuarioPorUsername(
        usernameFinal
      );

    if (usernameExistente) {
      throw new UsuarioValidationError(
        `El nombre de usuario ${usernameFinal} ya está registrado`,
        409
      );
    }

    const rolFinal =
      String(rol || 'supervisor')
        .trim()
        .toLowerCase();

    if (
      ![
        'admin',
        'supervisor',
        'ti'
      ].includes(rolFinal)
    ) {
      throw new UsuarioValidationError(
        'Rol no válido'
      );
    }

    const estadoFinal =
      String(estado || 'activo')
        .trim()
        .toLowerCase();

    if (
      ![
        'activo',
        'inactivo'
      ].includes(estadoFinal)
    ) {
      throw new UsuarioValidationError(
        'Estado de usuario no válido'
      );
    }

    let asignacionesFinales = [];

    if (rolFinal === 'supervisor') {
      asignacionesFinales =
        normalizarClienteOperacionIds(
          clienteOperacionIds
        );

      await validarAsignacionesSupervisor(
        asignacionesFinales
      );
    }

    /*
     * La contraseña inicial es el DNI.
     * En la base solamente se almacena el hash.
     */
    const passwordHash =
      await bcrypt.hash(
        persona.dni,
        10
      );

    const usuarioCreado =
      await crearUsuarioConAsignaciones({
        personaId:
          persona.id,

        username:
          usernameFinal,

        passwordHash,

        rol:
          rolFinal,

        permisos:
          ROLE_PERMISSIONS[rolFinal],

        estado:
          estadoFinal,

        clienteOperacionIds:
          asignacionesFinales
      });

    return {
      usernameFinal,
      usuarioCreado
    };
  };

// ==========================================
// EDITAR USUARIO
// ==========================================

export const actualizarUsuarioCompleto =
  async ({
    id,
    datos,
    usuarioActualId
  }) => {
    const idFinal =
      Number.parseInt(
        id,
        10
      );

    if (
      !Number.isInteger(idFinal) ||
      idFinal <= 0
    ) {
      throw new UsuarioValidationError(
        'ID de usuario no válido'
      );
    }

    const usuarioAnterior =
      await obtenerUsuarioPorId(
        idFinal
      );

    if (!usuarioAnterior) {
      throw new UsuarioValidationError(
        'Usuario no encontrado',
        404
      );
    }

    const {
      password,
      rol,
      estado,
      clienteOperacionIds
    } = datos || {};

    const rolFinal =
      String(
        rol ||
        usuarioAnterior.rol
      )
        .trim()
        .toLowerCase();

    if (
      ![
        'admin',
        'supervisor',
        'ti'
      ].includes(rolFinal)
    ) {
      throw new UsuarioValidationError(
        'Rol no válido'
      );
    }

    const estadoFinal =
      String(
        estado ||
        usuarioAnterior.estado
      )
        .trim()
        .toLowerCase();

    if (
      ![
        'activo',
        'inactivo'
      ].includes(estadoFinal)
    ) {
      throw new UsuarioValidationError(
        'Estado de usuario no válido'
      );
    }

    if (
      idFinal ===
      Number(usuarioActualId) &&
      estadoFinal === 'inactivo'
    ) {
      throw new UsuarioValidationError(
        'No puedes desactivar tu propio usuario'
      );
    }

    let asignacionesFinales = [];

    if (rolFinal === 'supervisor') {
      let asignacionesRecibidas =
        clienteOperacionIds;

      /*
       * Si se edita otro dato del supervisor
       * sin mandar asignaciones, conserva las actuales.
       */
      if (
        asignacionesRecibidas ===
        undefined
      ) {
        asignacionesRecibidas =
          Array.isArray(
            usuarioAnterior.asignaciones
          )
            ? usuarioAnterior
              .asignaciones
              .map(
                asignacion =>
                  asignacion
                    .cliente_operacion_id
              )
            : [];
      }

      asignacionesFinales =
        normalizarClienteOperacionIds(
          asignacionesRecibidas
        );

      await validarAsignacionesSupervisor(
        asignacionesFinales
      );
    }

    let passwordHash = null;

    if (
      password !== undefined &&
      password !== ''
    ) {
      validarNuevaPassword(password);

      passwordHash =
        await bcrypt.hash(
          password,
          10
        );
    }

    const usuarioActualizado =
      await actualizarUsuarioConAsignaciones({
        id:
          idFinal,

        passwordHash,

        rol:
          rolFinal,

        permisos:
          ROLE_PERMISSIONS[rolFinal],

        estado:
          estadoFinal,

        clienteOperacionIds:
          asignacionesFinales
      });

    if (!usuarioActualizado) {
      throw new UsuarioValidationError(
        'Usuario no encontrado',
        404
      );
    }

    return {
      usuarioAnterior,
      usuarioActualizado
    };
  };

// ==========================================
// ACTIVAR O DESACTIVAR
// ==========================================

export const cambiarEstadoUsuario =
  async ({
    id,
    estado,
    usuarioActualId
  }) => {
    const idFinal =
      Number.parseInt(
        id,
        10
      );

    const estadoFinal =
      String(estado || '')
        .trim()
        .toLowerCase();

    if (
      !Number.isInteger(idFinal) ||
      idFinal <= 0
    ) {
      throw new UsuarioValidationError(
        'ID de usuario no válido'
      );
    }

    if (
      ![
        'activo',
        'inactivo'
      ].includes(estadoFinal)
    ) {
      throw new UsuarioValidationError(
        'El estado debe ser activo o inactivo'
      );
    }

    if (
      idFinal ===
      Number(usuarioActualId) &&
      estadoFinal === 'inactivo'
    ) {
      throw new UsuarioValidationError(
        'No puedes desactivar tu propio usuario'
      );
    }

    const usuarioAnterior =
      await obtenerUsuarioPorId(
        idFinal
      );

    if (!usuarioAnterior) {
      throw new UsuarioValidationError(
        'Usuario no encontrado',
        404
      );
    }

    const usuarioActualizado =
      await actualizarEstadoUsuario(
        idFinal,
        estadoFinal
      );

    return {
      estadoFinal,
      usuarioAnterior,
      usuarioActualizado
    };
  };