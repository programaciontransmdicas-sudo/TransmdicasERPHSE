import { esAdministrador, obtenerCatalogoClientesOperaciones, resolverClienteOperacion, restringirEdicionTI } from '../../services/catalogoService.js';
import {
  obtenerPersonal,
  crearPersonal,
  actualizarPersonal
} from './repository.js';

import {
  validarNuevoPersonal,
  PersonalValidationError
} from './service.js';

import {
  logAction
} from '../../services/auditService.js';

export const listarPersonal =
  async (req, res) => {
    try {
      const personal =
        await obtenerPersonal(esAdministrador(req));

      return res.json(
        personal
      );
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error:
          'Error obteniendo el personal'
      });
    }
  };

export const registrarPersonal =
  async (req, res) => {
    try {
      const relacion = await resolverClienteOperacion(req.body, true);
      const datos = validarNuevoPersonal({ ...req.body, ...relacion });
      if (!esAdministrador(req)) datos.estado = 'Activo';

      const personalCreado =
        await crearPersonal(
          datos
        );

      await logAction(
        req.user
          ? req.user.id
          : null,
        `Registró nuevo personal: ${datos.nombre_completo}`,
        'personal'
      );

      return res
        .status(201)
        .json(personalCreado);
    } catch (error) {
      if ([400, 403].includes(error.status)) return res.status(error.status).json({ error: error.message });
      if (
        error instanceof
        PersonalValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(error);

      return res.status(500).json({
        error:
          'Error al registrar personal (DNI duplicado?)'
      });
    }
  };

export const editarPersonal =
  async (req, res) => {
    const id =
      Number.parseInt(
        req.params.id,
        10
      );
    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return res
        .status(400)
        .json({
          error:
            'ID de personal no válido'
        });
    }
    try {
      restringirEdicionTI(req, ['cliente_operacion_id', 'cliente', 'operacion']);
      const relacion = await resolverClienteOperacion(req.body);
      const personalActualizado = await actualizarPersonal(id, { ...req.body, ...relacion });
      if (!personalActualizado) {
        return res.status(404).json({
          error: 'Personal no encontrado'
        });
      }
      await logAction(
        req.user
          ? req.user.id
          : null,
        `Actualizo personal: ${personalActualizado.nombre_completo}`,
        'personal',
        req,
        null,
        personalActualizado
      );
      return res.json(
        personalActualizado
      );
    } catch (error) {
      if ([400, 403].includes(error.status)) return res.status(error.status).json({ error: error.message });
      if (
        error instanceof
        PersonalValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error: error.message
          });
      }
      if (error.code === '23505') {
        return res.status(409).
          json({ error: 'El DNI ya esta registrado' });
      }
      console.error(
        'Error actualizando personal: ',
        error
      );
      return res.status(500).json({ error: 'Error al actualizar personal' });
    }
  };
export const borrarPersonal = async (_req, res) => res.status(405).json({
  error: 'El personal no se elimina. Utilice la opción de dejarlo inactivo.'
});

export const opcionesPersonal = async (_req, res) => {
  try { return res.json({ clientesOperaciones: await obtenerCatalogoClientesOperaciones() }); }
  catch (error) { console.error('Error cargando catálogo de personal:', error); return res.status(500).json({ error: 'No se pudo cargar el catálogo' }); }
};

export const cambiarEstadoPersonal = async (req, res) => {
  const id = Number(req.params.id);
  const estado = req.body?.estado;
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'ID no válido' });
  if (!['Activo', 'Inactivo'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
  if (!esAdministrador(req) && (req.user?.rol !== 'ti' || estado !== 'Inactivo')) {
    return res.status(403).json({ error: 'No tiene permiso para este cambio de estado' });
  }
  try {
    const persona = await actualizarPersonal(id, { estado });
    if (!persona) return res.status(404).json({ error: 'Personal no encontrado' });
    await logAction(req.user.id, `Cambió personal #${id} a ${estado}`, 'personal', req, null, persona);
    return res.json(persona);
  } catch (error) { console.error('Error cambiando estado del personal:', error); return res.status(500).json({ error: 'No se pudo cambiar el estado' }); }
};
