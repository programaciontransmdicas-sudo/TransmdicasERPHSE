import {
  buscarVehiculos,
  insertarVehiculo,
  obtenerVehiculoPorPlaca,
  actualizarVehiculo,
  eliminarVehiculo,
  obtenerTractos
} from './repository.js';

import {
  calcularEstado,
  prepararFiltrosVehiculos,
  prepararNuevoVehiculo,
  prepararActualizacionVehiculo,
  normalizarPlaca,
  FlotaValidationError
} from './service.js';

import {
  logAction
} from '../../services/auditService.js';

import {
  tieneAccesoTotalFlota,
  obtenerClienteOperacionIds
} from '../../middlewares/auth.js';

export const listarVehiculos =
  async (req, res) => { 
    try {
      const filtros =
        prepararFiltrosVehiculos(
          req.query
        );

      const resultado =
        await buscarVehiculos({
          search:
            filtros.search,
          operacion:
            filtros.operacion,
          accesoTotal:
            tieneAccesoTotalFlota(req),
          clienteOperacionIds:
            obtenerClienteOperacionIds(req) || []
        });

      let vehiculos =
        resultado.map(
          vehiculo => ({
            ...vehiculo,
            estado:
              calcularEstado(
                vehiculo
              )
          })
        );

      if (
        filtros.estado !==
        'Todos'
      ) {
        vehiculos =
          vehiculos.filter(
            vehiculo =>
              vehiculo.estado ===
              filtros.estado
          );
      }

      const total =
        vehiculos.length;

      const data =
        vehiculos.slice(
          filtros.offset,
          filtros.offset +
            filtros.limit
        );

      return res.json({
        data,
        total,
        page:
          filtros.page,
        limit:
          filtros.limit,
        totalPages:
          Math.ceil(
            total /
              filtros.limit
          )
      });
    } catch (error) {
      console.error(
        'Error obteniendo vehículos:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al obtener vehículos'
        });
    }
  };

export const registrarVehiculo =
  async (req, res) => {
    try {
      const datos =
        prepararNuevoVehiculo(
          req.body
        );

      const vehiculoCreado =
        await insertarVehiculo(
          datos
        );

      await logAction(
        req.user.id,
        `Creó el vehículo ${datos.placa}`,
        'vehiculos',
        req,
        null,
        vehiculoCreado
      );

      return res
        .status(201)
        .json(
          vehiculoCreado
        );
    } catch (error) {
      if (
        error instanceof
        FlotaValidationError
      ) {
        return res
          .status(
            error.status
          )
          .json({
            error:
              error.message
          });
      }

      if (
        error.code ===
        '23505'
      ) {
        return res
          .status(409)
          .json({
            error:
              'La placa ya existe'
          });
      }

      console.error(
        'Error creando vehículo:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al crear vehículo'
        });
    }
  };

export const editarVehiculo =
  async (req, res) => {
    try {
      const {
        placa,
        campos,
        data
      } =
        prepararActualizacionVehiculo(
          req.params.placa,
          req.body
        );

      const valoresAnteriores =
        await obtenerVehiculoPorPlaca(
          placa
        );

      if (!valoresAnteriores) {
        return res
          .status(404)
          .json({
            error:
              'Vehículo no encontrado'
          });
      }

      const valoresActuales =
        await actualizarVehiculo(
          placa,
          campos,
          data
        );

      await logAction(
        req.user.id,
        `Actualizó el vehículo ${placa}`,
        'vehiculos',
        req,
        valoresAnteriores,
        valoresActuales
      );

      return res.json(
        valoresActuales
      );
    } catch (error) {
      if (
        error instanceof
        FlotaValidationError
      ) {
        return res
          .status(
            error.status
          )
          .json({
            error:
              error.message
          });
      }

      if (
        error.code ===
        '22001'
      ) {
        return res
          .status(400)
          .json({
            error:
              'Uno de los campos supera la longitud permitida'
          });
      }

      console.error(
        'Error actualizando vehículo:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al actualizar el vehículo'
        });
    }
  };

export const borrarVehiculo =
  async (req, res) => {
    const placa =
      normalizarPlaca(
        req.params.placa
      );

    try {
      const vehiculoEliminado =
        await eliminarVehiculo(
          placa
        );

      if (
        !vehiculoEliminado
      ) {
        return res
          .status(404)
          .json({
            error:
              'Vehículo no encontrado'
          });
      }

      await logAction(
        req.user.id,
        `Eliminó el vehículo ${placa}`,
        'vehiculos',
        req,
        vehiculoEliminado,
        null
      );

      return res.json({
        message:
          'Vehículo eliminado'
      });
    } catch (error) {
      if (
        error.code ===
        '23503'
      ) {
        return res
          .status(409)
          .json({
            error:
              'No se puede eliminar el vehículo porque tiene registros relacionados. Debe conservarse su historial.'
          });
      }

      console.error(
        'Error eliminando vehículo:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error interno al eliminar el vehículo'
        });
    }
    
  };
  export const listarTractos =
  async (req, res) => {
    try {
      const tractos =
        await obtenerTractos({
          accesoTotal:
            tieneAccesoTotalFlota(req),
          clienteOperacionIds:
            obtenerClienteOperacionIds(req) || []
        });

      return res.json(
        tractos
      );
    } catch (error) {
      console.error(
        'Error obteniendo tractos:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error obteniendo tractos'
        });
    }
  };
