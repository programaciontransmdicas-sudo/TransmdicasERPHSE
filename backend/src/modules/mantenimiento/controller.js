import {
  obtenerMantenimientos,
  crearMantenimiento
} from './repository.js';

import {
  normalizarMantenimientos,
  validarNuevoMantenimiento,
  MantenimientoValidationError
} from './service.js';

import {
  logAction
} from '../../services/auditService.js';

export const listarMantenimientos =
  async (req, res) => {
    try {
      const resultado =
        await obtenerMantenimientos();

      const mantenimientos =
        normalizarMantenimientos(
          resultado
        );

      return res.json(
        mantenimientos
      );
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error:
          'Error al obtener mantenimientos'
      });
    }
  };

export const registrarMantenimiento =
  async (req, res) => {
    try {
      const datos =
        validarNuevoMantenimiento(
          req.body
        );

      const mantenimientoCreado =
        await crearMantenimiento(
          datos
        );

      await logAction(
        req.user
          ? req.user.id
          : null,
        `Registró mantenimiento para ${datos.placa}`,
        'mantenimientos_tecnicos'
      );

      return res.json(
        mantenimientoCreado
      );
    } catch (error) {
      if (
        error instanceof
        MantenimientoValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      if (
        error.code === '23503'
      ) {
        return res.status(400).json({
          error:
            'La placa seleccionada no existe en el maestro de vehículos'
        });
      }

      console.error(error);

      return res.status(500).json({
        error:
          'Error al registrar mantenimiento'
      });
    }
  };