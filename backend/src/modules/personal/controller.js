import {
  obtenerPersonal,
  crearPersonal,
  actualizarPersonal,
  eliminarPersonal
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
        await obtenerPersonal();

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
      const datos =
        validarNuevoPersonal(
          req.body
        );

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
      const personalActualizado =
        await actualizarPersonal(id, req.body);
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
      return res.status(500).json({ error: 'Error al acutalizar personal' });
    }
  };
export const borrarPersonal =
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
      const personalEliminado =
        await eliminarPersonal(id);

      if (!personalEliminado) {
        return res
          .status(404)
          .json({
            error:
              'Personal no encontrado'
          });
      }

      await logAction(
        req.user
          ? req.user.id
          : null,
        `Eliminó personal: ${personalEliminado.nombre_completo}`,
        'personal',
        req,
        personalEliminado,
        null
      );

      return res.json({
        success: true,
        message:
          'Personal eliminado correctamente'
      });
    } catch (error) {
      if (
        error.code === '23503' ||
        error.code === '23001'
      ) {
        return res
          .status(409)
          .json({
            error:
              'No se puede eliminar este personal porque tiene usuarios, entregas, tickets o pulseras relacionados. Cambia su estado a Inactivo.'
          });
      }

      console.error(
        'Error eliminando personal:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al eliminar personal'
        });
    }
  };