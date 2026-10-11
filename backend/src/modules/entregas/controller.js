import {
  hasPermiso,
  getModuloMovimiento,
  tieneAccesoTotalFlota,
  obtenerClienteOperacionIds
} from '../../middlewares/auth.js';

import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../../services/cloudinaryService.js';

import {
  obtenerPersonalPorDni,
  obtenerClientesOperacionesEntregas,
  obtenerClienteOperacionEntrega,
  obtenerInventario,
  crearMovimiento,
  obtenerMovimientoPorId,
  actualizarMovimiento,
  eliminarMovimiento,
  obtenerMovimientosParaExportar
} from './repository.js';

import {
  normalizarTipoMovimiento,
  normalizarDni,
  normalizarPrecio,
  normalizarFecha,
  obtenerResourceTypeActa,
  EntregaValidationError,
  procesarImportacionExcel,
  esFechaISOValida,
  normalizarTipoExportacion
} from './service.js';
import {
  generarExcelEntregas
} from '../../reports/excelentregas.js';
import {
  logAction
}from '../../services/auditService.js'

const obtenerAlcance = req => ({
  accesoTotal:
    tieneAccesoTotalFlota(req),
  clienteOperacionIds:
    obtenerClienteOperacionIds(req) || []
});

const obtenerClienteOperacionId = valor => {
  const id = Number.parseInt(
    valor,
    10
  );

  if (!Number.isInteger(id) || id <= 0) {
    throw new EntregaValidationError(
      'Seleccione un cliente y una operación válidos'
    );
  }

  return id;
};


// ==========================================
// LEGACY
// ==========================================

export const listarLegacy = (req, res) => {
  return listarInventario(req, res);
};
export const registrarLegacy = (req, res) => {
  const datos = req.body || {};

  req.body = {
    ...datos,
    fecha: datos.fecha ?? datos.fecha_entrega,
    nombre: datos.nombre ?? datos.nombres
  };

  return registrarMovimiento(req, res);
};
// ==========================================
// PERSONAL
// ==========================================

export const buscarPersonal =
  async (req, res) => {
    try {
      const tipoMovimiento =
        normalizarTipoMovimiento(
          req.query.tipo ||
          'Entrega'
        );

      const modulo =
        getModuloMovimiento(
          tipoMovimiento
        );

      if (
        !hasPermiso(
          req,
          modulo,
          'ver'
        ) ||
        !hasPermiso(
          req,
          modulo,
          'editar'
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para registrar o editar este movimiento'
          });
      }

      const dni =
        normalizarDni(
          req.params.dni
        );

      const persona =
        await obtenerPersonalPorDni(
          dni
        );

      res.set(
        'Cache-Control',
        'no-store'
      );

      return res.json({
        persona
      });
    } catch (error) {
      if (
        error instanceof
        EntregaValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(
        'Error buscando personal para entrega:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'No se pudo consultar al trabajador'
        });
    }
  };

export const listarOpcionesEntregas =
  async (req, res) => {
    try {
      const clientesOperaciones =
        await obtenerClientesOperacionesEntregas(
          obtenerAlcance(req)
        );

      return res.json({
        clientesOperaciones
      });
    } catch (error) {
      console.error(
        'Error obteniendo opciones de entregas:',
        error
      );

      return res.status(500).json({
        error:
          'No se pudieron cargar los clientes y operaciones'
      });
    }
  };

// ==========================================
// LISTAR INVENTARIO
// ==========================================

export const listarInventario =
  async (req, res) => {
    try {
      const puedeVerEntregas =
        hasPermiso(
          req,
          'entregas',
          'ver'
        );

      const puedeVerDevoluciones =
        hasPermiso(
          req,
          'devoluciones',
          'ver'
        );

      if (
        !puedeVerEntregas &&
        !puedeVerDevoluciones
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para consultar inventario TI'
          });
      }

      const inventario =
        await obtenerInventario({
          puedeVerEntregas,
          puedeVerDevoluciones,
          ...obtenerAlcance(req)
        });

      return res.json(
        inventario
      );
    } catch (error) {
      console.error(error);

      return res
        .status(500)
        .json({
          error:
            'Error obteniendo inventario TI'
        });
    }
  };

// ==========================================
// CREAR
// ==========================================

export const registrarMovimiento =
  async (req, res) => {
    try {
      const tipoMovimiento =
        normalizarTipoMovimiento(
          req.body
            ?.tipo_movimiento ||
          'Entrega'
        );

      const moduloMovimiento =
        getModuloMovimiento(
          tipoMovimiento
        );

      if (
        !hasPermiso(
          req,
          moduloMovimiento,
          'editar'
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              `No tienes permiso para crear registros de ${tipoMovimiento}`
          });
      }

      const alcance =
        obtenerAlcance(req);

      const clienteOperacionId =
        obtenerClienteOperacionId(
          req.body?.cliente_operacion_id
        );

      const clienteOperacion =
        await obtenerClienteOperacionEntrega({
          id:
            clienteOperacionId,
          ...alcance
        });

      if (!clienteOperacion) {
        return res.status(403).json({
          error:
            'El cliente y la operación no pertenecen a su alcance asignado'
        });
      }

      let documentoFinal =
        req.body
          ?.documento_url ||
        null;

      if (req.file) {
        const resourceType =
          obtenerResourceTypeActa(
            req.file.mimetype
          );

        try {
          documentoFinal =
            await uploadToCloudinary(
              req.file.buffer,
              'entregas_actas',
              resourceType
            );
        } catch (error) {
          console.error(
            'Error subiendo acta a Cloudinary:',
            error
          );

          return res
            .status(500)
            .json({
              error:
                'Error al subir documento a la nube'
            });
        }
      }

      const movimiento =
        await crearMovimiento({
          fecha:
            normalizarFecha(
              req.body?.fecha
            ),

          encargado:
            req.body?.encargado,

          nombre:
            req.body?.nombre,

          dni:
            req.body?.dni,

          cargo:
            req.body?.cargo,

          operacion:
            clienteOperacion.operacion,

          cliente_operacion_id:
            clienteOperacion.id,

          condicion:
            req.body?.condicion,

          equipo_tipo:
            req.body?.equipo_tipo,

          marca:
            req.body?.marca,

          modelo:
            req.body?.modelo,

          serie:
            req.body?.serie,

          laptop:
            req.body?.laptop,

          mouse:
            req.body?.mouse,

          cargador:
            req.body?.cargador,

          motivo:
            req.body?.motivo,

          observaciones:
            req.body?.observaciones,

          precio:
            normalizarPrecio(
              req.body?.precio
            ),

          tipo_movimiento:
            tipoMovimiento,

          documento_url:
            documentoFinal
        });
        await logAction(req.user.id,
          'Creo movimiento de inventario TI',
          'entregas_ti',
          req,
          null,
          movimiento
        );
      return res
        .status(201)
        .json(
          movimiento
        );
    } catch (error) {
      if (
        error instanceof
        EntregaValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(
        'API POST Error:',
        error
      );

      return res
        .status(500)
        .json({
          error: 'No se pudo registrar el movimiento de inventario'
        });
    }
  };

// ==========================================
// ACTUALIZAR
// ==========================================

export const editarMovimiento =
  async (req, res) => {
    const { id } =
      req.params;

    try {
      const tipoMovimiento =
        normalizarTipoMovimiento(
          req.body
            ?.tipo_movimiento ||
          'Entrega'
        );

      const alcance =
        obtenerAlcance(req);

      const actual =
        await obtenerMovimientoPorId({
          id,
          ...alcance
        });

      if (!actual) {
        return res
          .status(404)
          .json({
            error:
              'No encontrado'
          });
      }

      const moduloActual =
        getModuloMovimiento(
          actual.tipo_movimiento
        );

      const moduloNuevo =
        getModuloMovimiento(
          tipoMovimiento
        );

      if (
        !hasPermiso(
          req,
          moduloActual,
          'editar'
        ) ||
        !hasPermiso(
          req,
          moduloNuevo,
          'editar'
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para modificar este tipo de movimiento'
          });
      }

      const clienteOperacionId =
        obtenerClienteOperacionId(
          req.body?.cliente_operacion_id
        );

      const clienteOperacion =
        await obtenerClienteOperacionEntrega({
          id:
            clienteOperacionId,
          ...alcance
        });

      if (!clienteOperacion) {
        return res.status(403).json({
          error:
            'El cliente y la operación no pertenecen a su alcance asignado'
        });
      }

      let documentoFinal =
        req.body
          ?.documento_url ||
        null;

      if (req.file) {
        try {
          if (
            actual.documento_url
          ) {
            await deleteFromCloudinary(
              actual.documento_url
            );
          }

          const resourceType =
            obtenerResourceTypeActa(
              req.file.mimetype
            );

          documentoFinal =
            await uploadToCloudinary(
              req.file.buffer,
              'entregas_actas',
              resourceType
            );
        } catch (error) {
          console.error(
            'Error subiendo acta a Cloudinary:',
            error
          );

          return res
            .status(500)
            .json({
              error:
                'Error al subir documento a la nube'
            });
        }
      }

      const movimientoActualizado =
        await actualizarMovimiento({
          id,

          fecha:
            normalizarFecha(
              req.body?.fecha
            ),

          encargado:
            req.body?.encargado,

          nombre:
            req.body?.nombre,

          dni:
            req.body?.dni,

          cargo:
            req.body?.cargo,

          operacion:
            clienteOperacion.operacion,

          cliente_operacion_id:
            clienteOperacion.id,

          condicion:
            req.body?.condicion,

          equipo_tipo:
            req.body?.equipo_tipo,

          marca:
            req.body?.marca,

          modelo:
            req.body?.modelo,

          serie:
            req.body?.serie,

          laptop:
            req.body?.laptop,

          mouse:
            req.body?.mouse,

          cargador:
            req.body?.cargador,

          motivo:
            req.body?.motivo,

          observaciones:
            req.body?.observaciones,

          precio:
            normalizarPrecio(
              req.body?.precio
            ),

          tipo_movimiento:
            tipoMovimiento,

          documento_url:
            documentoFinal,

          ...alcance
        });

      if (
        !movimientoActualizado
      ) {
        await logAction(
          req.user.id,
          'Actualizo movimiento de inventario TI',
          'entregas_ti',
          req,
          actual,
          movimientoActualizado
        );
        return res
          .status(404)
          .json({
            error:
              'No encontrado'
          });
      }

      return res.json(
        movimientoActualizado
      );
    } catch (error) {
      if (
        error instanceof
        EntregaValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(
        'API PUT Error:',
        error
      );

      return res
        .status(500)
        .json({
          error: 'No se pudo actualizar el movimiento de inventario'
        });
    }
  };

// ==========================================
// ELIMINAR
// ==========================================

export const borrarMovimiento =
  async (req, res) => {
    try {
      const eliminado =
        await eliminarMovimiento(
          req.params.id
        );

      if (!eliminado) {
        await logAction(
          req.user.id,
          'Elimino movimiento de inventario TI',
          'entregas_ti',
          req,
          eliminado,
          null
        );
        return res
          .status(404)
          .json({
            error:
              'No encontrado'
          });
      }

      return res.json({
        message:
          'Eliminado correctamente'
      });
    } catch (error) {
      console.error(error);

      return res
        .status(500)
        .json({
          error:
            'Error eliminando entrega TI'
        });
    }
  };
// ==========================================
// IMPORTAR EXCEL
// ==========================================

export const importarExcel =
  async (req, res) => {
    try {
      const resultado =
        await procesarImportacionExcel({
          buffer:
            req.file?.buffer,

          tipo:
            req.body?.tipo,

          confirmar:
            req.body?.confirmar,

          firmaRecibida:
            req.body?.firma
        });

      return res.json(
        resultado
      );
    } catch (error) {
      console.error(
        'Error importando Excel:',
        error
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            error.status === 400
              ? error.message
              : 'No se pudo completar la importación. Revisa el registro del backend antes de reintentar.'
        });
    }
  };
  // ==========================================
// EXPORTAR EXCEL
// ==========================================

export const exportarExcel =
  async (req, res) => {
    try {
      const {
        tipo,
        categoria,
        fechaInicio,
        fechaFin
      } = req.query;

      if (
        !esFechaISOValida(
          fechaInicio
        ) ||
        !esFechaISOValida(
          fechaFin
        ) ||
        fechaInicio >
          fechaFin
      ) {
        return res
          .status(400)
          .json({
            error:
              'El rango de fechas no es válido'
          });
      }

      let tipoAutorizado =
        normalizarTipoExportacion(
          tipo
        );

      const puedeVerEntregas =
        hasPermiso(
          req,
          'entregas',
          'ver'
        );

      const puedeVerDevoluciones =
        hasPermiso(
          req,
          'devoluciones',
          'ver'
        );

      if (
        tipoAutorizado ===
          'Entrega' &&
        !puedeVerEntregas
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para exportar entregas'
          });
      }

      if (
        tipoAutorizado ===
          'Devolución' &&
        !puedeVerDevoluciones
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para exportar devoluciones'
          });
      }

      if (!tipoAutorizado) {
        if (
          puedeVerEntregas &&
          !puedeVerDevoluciones
        ) {
          tipoAutorizado =
            'Entrega';
        } else if (
          !puedeVerEntregas &&
          puedeVerDevoluciones
        ) {
          tipoAutorizado =
            'Devolución';
        } else if (
          !puedeVerEntregas &&
          !puedeVerDevoluciones
        ) {
          return res
            .status(403)
            .json({
              error:
                'No tienes permiso para exportar inventario'
            });
        }
      }

      const entregas =
        await obtenerMovimientosParaExportar({
          tipo:
            tipoAutorizado,
          categoria,
          fechaInicio,
          fechaFin,
          ...obtenerAlcance(req)
        });

      const {
        buffer,
        filename
      } =
        await generarExcelEntregas({
          entregas,
          tipo:
            tipoAutorizado,
          fechaInicio,
          fechaFin
        });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${filename}`
      );

      return res.send(
        buffer
      );
    } catch (error) {
      if (
        error instanceof
        EntregaValidationError
      ) {
        return res
          .status(error.status)
          .json({
            error:
              error.message
          });
      }

      console.error(
        'Error exportando Excel:',
        error
      );

      return res
        .status(500)
        .send(
          'Error generando el archivo Excel premium'
        );
    }
  };
