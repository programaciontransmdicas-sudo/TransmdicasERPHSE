import {
  obtenerConteosRapidos,
  obtenerFechasInspecciones,
  obtenerFallosComponentes,
  obtenerProgramasStats,
  obtenerSaludInspecciones,
  obtenerSoporteStats,
  obtenerInventarioAgrupado,
  obtenerTotalInventario
} from './repository.js';

import {
  construirTendencia,
  mapearProgramas,
  mapearSoporte,
  mapearInventario,
  construirFallos,
  construirSalud
} from './service.js';

import {
  tieneAccesoTotalFlota,
  obtenerClienteOperacionIds
} from '../../middlewares/auth.js';

const obtenerAlcance = req => ({
  accesoTotal:
    tieneAccesoTotalFlota(req),
  clienteOperacionIds:
    obtenerClienteOperacionIds(req) || []
});

// ==========================================
// ESTADÍSTICAS RÁPIDAS
// ==========================================

export const obtenerStats =
  async (req, res) => {
    try {
      const resultado =
        await obtenerConteosRapidos(
          obtenerAlcance(req)
        );

      return res.json(
        resultado
      );
    } catch (error) {
      console.error(
        'Error obteniendo estadísticas:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al obtener estadísticas'
        });
    }
  };

// ==========================================
// GRÁFICOS
// ==========================================

export const obtenerCharts =
  async (req, res) => {
    try {
      const alcance =
        obtenerAlcance(req);

      const [
        inspecciones,
        errores,
        programasRows,
        salud,
        soporteRows
      ] =
        await Promise.all([
          obtenerFechasInspecciones(alcance),
          obtenerFallosComponentes(alcance),
          obtenerProgramasStats(alcance),
          obtenerSaludInspecciones(alcance),
          obtenerSoporteStats(alcance)
        ]);

      const tendencia =
        construirTendencia(
          inspecciones
        );

      const programas =
        mapearProgramas(
          programasRows
        );

      const soporte =
        mapearSoporte(
          soporteRows
        );

      let inventario = [];

      try {
        const inventarioRows =
          await obtenerInventarioAgrupado(
            alcance
          );

        inventario =
          mapearInventario(
            inventarioRows
          );
      } catch (error) {
        console.warn(
          'No se pudo agrupar inventario por tipo_movimiento:',
          error.message
        );

        const total =
          await obtenerTotalInventario(
            alcance
          );

        inventario = [
          {
            name:
              'Entregas Registradas',

            value:
              total
          }
        ];
      }

      return res.json({
        trend:
          tendencia,

        programas,

        salud:
          construirSalud(
            salud
          ),

        fallos:
          construirFallos(
            errores
          ),

        soporte,

        inventario
      });
    } catch (error) {
      console.error(
        'Error obteniendo gráficos:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al obtener datos para los gráficos'
        });
    }
  };
