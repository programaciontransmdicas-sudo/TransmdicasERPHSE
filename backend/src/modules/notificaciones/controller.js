import {
  obtenerNotificacionesUsuario,
  obtenerCantidadNoLeidas,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas
} from './repository.js';

export const listarNotificaciones =
  async (req, res) => {
    try {
      const [
        notificaciones,
        noLeidas
      ] = await Promise.all([
        obtenerNotificacionesUsuario(
          req.user.id
        ),
        obtenerCantidadNoLeidas(
          req.user.id
        )
      ]);

      return res.json({
        notificaciones,
        noLeidas
      });
    } catch (error) {
      console.error(
        'Error obteniendo notificaciones:',
        error
      );

      return res.status(500).json({
        error:
          'Error al obtener las notificaciones'
      });
    }
  };

export const leerNotificacion =
  async (req, res) => {
    const id = Number.parseInt(
      req.params.id,
      10
    );

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        error:
          'ID de notificación no válido'
      });
    }

    try {
      const notificacion =
        await marcarNotificacionLeida({
          id,
          usuarioId: req.user.id
        });

      if (!notificacion) {
        return res.status(404).json({
          error: 'Notificación no encontrada'
        });
      }

      return res.json({
        success: true,
        notificacion
      });
    } catch (error) {
      console.error(
        'Error leyendo notificación:',
        error
      );

      return res.status(500).json({
        error:
          'Error al actualizar la notificación'
      });
    }
  };

export const leerTodasNotificaciones =
  async (req, res) => {
    try {
      await marcarTodasNotificacionesLeidas(
        req.user.id
      );

      return res.json({
        success: true
      });
    } catch (error) {
      console.error(
        'Error leyendo notificaciones:',
        error
      );

      return res.status(500).json({
        error:
          'Error al actualizar las notificaciones'
      });
    }
  };