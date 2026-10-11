import {
  obtenerTotalVehiculos,
  obtenerInspeccionesHoy,
  obtenerTickerInspecciones,
  obtenerTrabajosTI,
  obtenerUltimaInspeccionPublica,
  obtenerTimelinePublico,
  obtenerUltimoIncidentePublico
} from './repository.js';

import {
  calcularEstado,
  construirUrlImagen,
  fechaActualPeru,
  normalizarPlacaPublica
} from './service.js';

// ==========================================
// ESTADÍSTICAS PÚBLICAS
// ==========================================

export const obtenerStatsPublicos =
  async (req, res) => {
    try {
      const hoy =
        fechaActualPeru();

      const [
        totalFlota,
        inspeccionesHoy,
        inspecciones,
        trabajos
      ] =
        await Promise.all([
          obtenerTotalVehiculos(),
          obtenerInspeccionesHoy(
            hoy
          ),
          obtenerTickerInspecciones(),
          obtenerTrabajosTI()
        ]);

      const ticker =
        inspecciones.map(
          inspeccion => ({
            placa:
              inspeccion.placa,

            hora:
              inspeccion.hora,

            estado:
              calcularEstado(
                inspeccion
              )
          })
        );

      const trabajosTI =
        trabajos.map(
          trabajo => ({
            id:
              trabajo.id,

            tipo:
              trabajo.tipo_solicitud,

            placa:
              trabajo.placa
          })
        );

      return res.json({
        totalFlota,
        inspeccionesHoy,
        ticker,
        trabajosTI
      });
    } catch (error) {
      console.error(
        'Error obteniendo estadísticas públicas:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error del servidor'
        });
    }
  };

// ==========================================
// CONSULTA POR PLACA
// ==========================================

export const consultarUnidadPublica =
  async (req, res) => {
    let placa;

    try {
      placa =
        normalizarPlacaPublica(
          req.params.placa
        );
    } catch (error) {
      return res
        .status(
          error.status || 400
        )
        .json({
          error:
            error.message
        });
    }

    try {
      const [
        inspeccion,
        timelineRegistros,
        incidente
      ] =
        await Promise.all([
          obtenerUltimaInspeccionPublica(
            placa
          ),
          obtenerTimelinePublico(
            placa
          ),
          obtenerUltimoIncidentePublico(
            placa
          )
        ]);

      if (!inspeccion) {
        return res
          .status(404)
          .json({
            error:
              'Unidad no encontrada'
          });
      }

      const timeline =
        timelineRegistros.map(
          registro => ({
            fecha:
              registro.fecha,

            hora:
              registro.hora,

            estado:
              calcularEstado(
                registro
              )
          })
        );

      return res.json({
        placa:
          inspeccion.placa,

        fecha:
          inspeccion.fecha,

        hora:
          inspeccion.hora,

        tablet:
          inspeccion.tablet,

        radio:
          inspeccion.radio,

        camaras:
          inspeccion.camaras,

        estado_general:
          calcularEstado(
            inspeccion
          ),

        incidente_pendiente:incidente
          ?{
            estado:incidente.estado,
            tipo_solicitud:incidente.tipo_solicitud,
            fecha: incidente.fecha
          }
          : null, 

        timeline,

        fotos: [
          {
            tipo:
              'Tablet',

            url:
              construirUrlImagen(
                req,
                inspeccion.img_tablet
              )
          },
          {
            tipo:
              'Radio',

            url:
              construirUrlImagen(
                req,
                inspeccion.img_radio
              )
          },
          {
            tipo:
              'Cámaras',

            url:
              construirUrlImagen(
                req,
                inspeccion.img_camaras
              )
          }
        ]
      });
    } catch (error) {
      console.error(
        'Error consultando unidad pública:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error del servidor'
        });
    }
  };