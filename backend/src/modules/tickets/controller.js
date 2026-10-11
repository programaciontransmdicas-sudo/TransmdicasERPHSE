import {
  uploadToCloudinary,
  deleteFromCloudinary
} from '../../services/cloudinaryService.js';

import {
  logAction
} from '../../services/auditService.js';

import {
  obtenerVehiculosTickets,
  obtenerVehiculoTicketPorPlaca,
  obtenerPersonalTickets,
  obtenerPersonaActivaPorId,
  insertarTicket,
  insertarPulsera,
  insertarSolicitudDescargaVideos,
  obtenerTickets,
  obtenerTicketPorId,
  actualizarEstadoTicket,
  obtenerUltimaInspeccion,
  actualizarInspeccionTicket,
  eliminarTicketPorId,
  obtenerUsuarioTicket,
  obtenerSolicitudesDescargaVideos,
  actualizarEstadoSolicitudDescargaVideos,
  obtenerReportesPulseras,
  actualizarEstadoReportePulsera,
} from './repository.js';

import {
  contextoTicket,
  OPERACIONES_INVALIDAS_TICKET,
  IMPLEMENTOS_PERMITIDOS,
  componenteConFalla,
  obtenerOperacionesUnicas,
  obtenerClientesOperacionesUnicas
} from './service.js';

import {
  crearNotificacionUsuario,
  crearNotificacionesPorRoles
} from '../notificaciones/repository.js'


// ==========================================
// OPCIONES DE TICKETS DE UNIDADES
// ==========================================

export const opcionesTickets =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(req);

      const [
        vehiculos,
        personal
      ] =
        await Promise.all([
          obtenerVehiculosTickets({
            accesoTotal:
              contexto.accesoTotal,
            clienteOperacionIds:
              contexto.clienteOperacionIds,
            operacionesInvalidas:
              OPERACIONES_INVALIDAS_TICKET
          }),

          obtenerPersonalTickets()
        ]);

      const operaciones =
        obtenerOperacionesUnicas(
          vehiculos
        );

      return res.json({
        vehiculos,
        personal,
        operaciones,
        clientesOperaciones:
          obtenerClientesOperacionesUnicas(
            vehiculos
          )
      });

    } catch (error) {
      console.error(
        'Error cargando opciones de tickets:',
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          error:
            error.status === 401 ||
              error.status === 403
              ? error.message
              : 'Error al cargar opciones de tickets'
        });
    }
  };
//===========================================
// OPCIONES PARA DESCARGA DE VIDEOS
//===========================================

// ==========================================
// OPCIONES PARA DESCARGA DE VIDEOS
// ==========================================

export const opcionesSolicitudDescargaVideos =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(
          req,
          'crear'
        );

      if (
        ![
          'admin',
          'supervisor'
        ].includes(contexto.rol)
      ) {
        return res.status(403).json({
          error:
            'No tienes permiso para solicitar descargas de videos'
        });
      }

      const vehiculos =
        await obtenerVehiculosTickets({
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds,
          operacionesInvalidas:
            OPERACIONES_INVALIDAS_TICKET
        });

      return res.json({
        vehiculos,

        operaciones:
          obtenerOperacionesUnicas(
            vehiculos
          ),

        clientesOperaciones:
          obtenerClientesOperacionesUnicas(
            vehiculos
          ),

        nombreSolicitante:
          contexto.nombreSolicitante
      });
    } catch (error) {
      console.error(
        'Error cargando opciones de descarga de videos:',
        error
      );

      return res
        .status(error.status || 500)
        .json({
          error:
            error.status === 401 ||
              error.status === 403
              ? error.message
              : 'Error al cargar las opciones de descarga de videos'
        });
    }
  };

const FECHA_DESCARGA_REGEX =
  /^\d{4}-\d{2}-\d{2}$/;

const HORA_DESCARGA_REGEX =
  /^([01]\d|2[0-3]):[0-5]\d$/;

const esFechaDescargaValida =
  valor => {
    if (
      !FECHA_DESCARGA_REGEX.test(
        valor
      )
    ) {
      return false;
    }

    const fecha =
      new Date(
        `${valor}T00:00:00Z`
      );

    return (
      !Number.isNaN(
        fecha.getTime()
      ) &&
      fecha
        .toISOString()
        .slice(0, 10) === valor
    );
  };


// ==========================================
// CREAR SOLICITUD DE DESCARGA DE VIDEOS
// ==========================================

export const crearSolicitudDescargaVideos =
  async (req, res) => {
    const placasRecibidas =
      Array.isArray(
        req.body?.placas
      )
        ? req.body.placas
        : [];

    const placas = [
      ...new Set(
        placasRecibidas
          .map(placa =>
            String(placa || '')
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
      )
    ];
    const clienteOperacionId =
      Number(
        req.body?.cliente_operacion_id
      );

    const fechaDescarga =
      String(
        req.body?.fecha_descarga || ''
      ).trim();

    const horaInicio =
      String(
        req.body?.hora_inicio || ''
      ).trim();

    const horaFin =
      String(
        req.body?.hora_fin || ''
      ).trim();

    const fechaLlegadaUnidad =
      String(
        req.body?.fecha_llegada_unidad || ''
      ).trim();

    const horaLlegadaUnidad =
      String(
        req.body?.hora_llegada_unidad || ''
      ).trim();

    const motivo =
      String(
        req.body?.motivo || ''
      ).trim();

    if (placas.length === 0) {
      return res.status(400).json({
        error:
          'Debe seleccionar al menos una placa'
      });
    }
    if (
      !Number.isInteger(
        clienteOperacionId
      ) ||
      clienteOperacionId <= 0
    ) {
      return res.status(400).json({
        error:
          'Debe seleccionar un cliente y una operación'
      });
    }

    if (
      !esFechaDescargaValida(
        fechaDescarga
      )
    ) {
      return res.status(400).json({
        error:
          'Debe indicar una fecha de descarga válida'
      });
    }
    if (
      !esFechaDescargaValida(
        fechaLlegadaUnidad
      ) ||
      !HORA_DESCARGA_REGEX.test(
        horaLlegadaUnidad
      )
    ) {
      return res.status(400).json({
        error:
          'Debe indicar una fecha y hora de llegada de la unidad valida'
      });
    }

    if (
      !HORA_DESCARGA_REGEX.test(
        horaInicio
      ) ||
      !HORA_DESCARGA_REGEX.test(
        horaFin
      ) ||
      horaFin <= horaInicio
    ) {
      return res.status(400).json({
        error:
          'La hora final debe ser posterior a la hora inicial'
      });
    }

    if (
      !motivo ||
      motivo.length > 1000
    ) {
      return res.status(400).json({
        error:
          'El motivo es obligatorio y admite hasta 1000 caracteres'
      });
    }

    try {
      const contexto =
        await contextoTicket(
          req,
          'crear'
        );

      if (
        ![
          'admin',
          'supervisor'
        ].includes(contexto.rol)
      ) {
        return res.status(403).json({
          error:
            'No tienes permiso para solicitar descargas de videos'
        });
      }

      const vehiculos =
        await obtenerVehiculosTickets({
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds,
          operacionesInvalidas:
            OPERACIONES_INVALIDAS_TICKET
        });
      const clientesOperaciones =
        obtenerClientesOperacionesUnicas(
          vehiculos
        );

      const clienteOperacion =
        clientesOperaciones.find(
          item =>
            Number(item.id) ===
            clienteOperacionId
        );

      if (!clienteOperacion) {
        return res.status(403).json({
          error:
            'El cliente y la operación no pertenecen a su alcance autorizado'
        });
      }

      const vehiculosPorPlaca =
        new Map(
          vehiculos.map(
            vehiculo => [
              String(vehiculo.placa)
                .trim()
                .toUpperCase(),
              vehiculo
            ]
          )
        );

      const vehiculosSeleccionados =
        placas
          .map(placa =>
            vehiculosPorPlaca.get(placa)
          )
          .filter(Boolean);

      if (
        vehiculosSeleccionados.length !==
        placas.length
      ) {
        return res.status(403).json({
          error:
            'Una o más placas no pertenecen a sus clientes y operaciones asignados'
        });
      }
      const operacion =
        clienteOperacion.operacion;

      const solicitud =
        await insertarSolicitudDescargaVideos({
          clienteOperacionId,
          operacion,
          placas,
          fechaLlegadaUnidad,
          horaLlegadaUnidad,
          fechaDescarga,
          horaInicio,
          horaFin,
          motivo,
          solicitadoPor:
            req.user.id
        });

      await logAction(
        req.user.id,
        `Registró solicitud de descarga de videos #${solicitud.id}`,
        'solicitudes_descarga_videos',
        req,
        null,
        solicitud
      );
      await crearNotificacionesPorRoles({
        roles: [
          'admin',
          'administrador',
          'ti'
        ],
        tipo: 'SOLICITUD_VIDEO_NUEVA',
        titulo: 'Nueva solicitud de descarga de videos',
        mensaje:
          `Solicitud ${solicitud.id}: ` +
          `${placas.length} placa(s) para ${operacion}. `,
        url: 'tickets',
        excluirUsuarioId: req.user.id
      }).catch(error => {
        console.error(
          'Error creando notificaciones de video:',
          error
        );
      });

      return res
        .status(201)
        .json({
          success: true,
          solicitud
        });
    } catch (error) {
      console.error(
        'Error registrando solicitud de descarga de videos:',
        error
      );

      if (
        error.status === 401 ||
        error.status === 403
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
        return res
          .status(400)
          .json({
            error:
              'Una de las placas o el usuario solicitante ya no existe'
          });
      }

      return res
        .status(500)
        .json({
          error:
            'Error al registrar la solicitud de descarga de videos'
        });
    }
  };

// ==========================================
// LISTAR SOLICITUDES DE DESCARGA DE VIDEOS
// ==========================================

export const listarSolicitudesDescargaVideos =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(
          req,
          'ver'
        );

      const solicitudes =
        await obtenerSolicitudesDescargaVideos({
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      return res.json(
        solicitudes
      );
    } catch (error) {
      console.error(
        'Error listando solicitudes de descarga:',
        error
      );

      if (
        error.status === 401 ||
        error.status === 403
      ) {
        return res
          .status(error.status)
          .json({
            error: error.message
          });
      }

      return res
        .status(500)
        .json({
          error:
            'Error al obtener las solicitudes de descarga de videos'
        });
    }
  };


const ESTADOS_SOLICITUD_VIDEO = [
  'Pendiente',
  'En proceso',
  'Atendida',
  'Rechazada'
];


// ==========================================
// ACTUALIZAR ESTADO DE SOLICITUD
// ==========================================

export const cambiarEstadoSolicitudDescargaVideos =
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
            'ID de solicitud no válido'
        });
    }

    const estadoRecibido =
      String(
        req.body?.estado || ''
      ).trim();

    const estado =
      ESTADOS_SOLICITUD_VIDEO.find(
        estadoPermitido =>
          estadoPermitido.toLowerCase() ===
          estadoRecibido.toLowerCase()
      );

    if (!estado) {
      return res
        .status(400)
        .json({
          error:
            'Estado de solicitud no válido'
        });
    }

    try {
      const contexto =
        await contextoTicket(
          req,
          'gestionar'
        );

      const solicitud =
        await actualizarEstadoSolicitudDescargaVideos({
          id,
          estado,
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      if (!solicitud) {
        return res
          .status(404)
          .json({
            error:
              'Solicitud no encontrada'
          });
      }

      await logAction(
        req.user.id,
        `Cambió solicitud de descarga #${id} a ${estado}`,
        'solicitudes_descarga_videos',
        req,
        null,
        solicitud
      );
      if (
        Numer(solicitud.solicitado_por) !== Number(req.user.id)
      ) {
        await crearNotificacionUsuario({
          usuarioId: solicitud.solicitado_por,
          tipo: 'SOLICITUD_VIDEO_ESTADO',
          titulo: 'Solicitud de video actualizada',
          mensaje: ` La solicitud #${solicitud.id} cambio a ` +
            `"${estado}". `,
          url: 'tickets'
        }).catch(error => {
          console.error(
            'Error notificando estado de video',
            error
          );
        });
      }

      return res.json({
        success: true,
        solicitud
      });
    } catch (error) {
      console.error(
        'Error actualizando solicitud de descarga:',
        error
      );

      if (
        error.status === 401 ||
        error.status === 403
      ) {
        return res
          .status(error.status)
          .json({
            error: error.message
          });
      }

      return res
        .status(500)
        .json({
          error:
            'Error al actualizar el estado de la solicitud'
        });
    }
  };

// ==========================================
// OPCIONES DE PULSERAS
// ==========================================

export const opcionesReportePulseras =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(
          req,
          'crear'
        );

      if (
        ![
          'admin',
          'supervisor'
        ].includes(contexto.rol)
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para registrar reportes de pulseras'
          });
      }

      const [
        vehiculos,
        personal
      ] =
        await Promise.all([
          obtenerVehiculosTickets({
            accesoTotal:
              contexto.accesoTotal,
            clienteOperacionIds:
              contexto.clienteOperacionIds,
            operacionesInvalidas:
              OPERACIONES_INVALIDAS_TICKET
          }),

          obtenerPersonalTickets()
        ]);

      const operaciones =
        obtenerOperacionesUnicas(
          vehiculos
        );

      return res.json({
        operaciones,
        clientesOperaciones:
          obtenerClientesOperacionesUnicas(
            vehiculos
          ),
        personal
      });

    } catch (error) {
      console.error(
        'Error cargando opciones de pulseras:',
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          error:
            error.status === 401 ||
              error.status === 403
              ? error.message
              : 'Error al cargar opciones de pulseras'
        });
    }
  };
// ==========================================
// CREAR REPORTE DE PULSERA
// ==========================================

export const crearReportePulsera =
  async (req, res) => {

    const solicitantePersonaId =
      Number(
        req.body?.solicitante_persona_id
      );

    const receptorPersonaId =
      Number(
        req.body?.receptor_persona_id
      );

    const clienteOperacionId =
      Number(
        req.body?.cliente_operacion_id
      );

    const motivoRenovacion =
      String(
        req.body?.motivo_renovacion || ''
      ).trim();

    const fechaLlegadaPersonal =
      String(
        req.body?.fecha_llegada_personal || ''
      ).trim();

    const horaLlegadaPersonal =
      String(
        req.body?.hora_llegada_personal || ''
      ).trim();

    if (
      !Number.isInteger(
        solicitantePersonaId
      ) ||
      solicitantePersonaId <= 0
    ) {
      return res.status(400).json({
        error:
          'Debe seleccionar un solicitante válido'
      });
    }

    if (
      !Number.isInteger(
        receptorPersonaId
      ) ||
      receptorPersonaId <= 0
    ) {
      return res.status(400).json({
        error:
          'Debe seleccionar una persona válida para recibir la pulsera'
      });
    }

    if (
      !Number.isInteger(
        clienteOperacionId
      ) ||
      clienteOperacionId <= 0
    ) {
      return res.status(400).json({
        error:
          'Debe seleccionar un cliente y una operación'
      });
    }
    if (
      !esFechaDescargaValida(
        fechaLlegadaPersonal
      ) ||
      !HORA_DESCARGA_REGEX.test(
        horaLlegadaPersonal
      )
    ) {
      return res.status(400).json({
        error:
          'Debe indicar una fecha y hora de llegada del personal validas'
      });
    }

    if (!motivoRenovacion) {
      return res.status(400).json({
        error:
          'Debe indicar el motivo de renovación'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error:
          'Debe adjuntar una evidencia'
      });
    }

    let evidenciaUrl = null;

    try {

      const contexto =
        await contextoTicket(
          req,
          'crear'
        );

      if (
        ![
          'admin',
          'supervisor'
        ].includes(contexto.rol)
      ) {
        return res
          .status(403)
          .json({
            error:
              'No tienes permiso para registrar reportes de pulseras'
          });
      }

      const [
        solicitante,
        receptor,
        vehiculos
      ] =
        await Promise.all([
          obtenerPersonaActivaPorId(
            solicitantePersonaId
          ),

          obtenerPersonaActivaPorId(
            receptorPersonaId
          ),

          obtenerVehiculosTickets({
            accesoTotal:
              contexto.accesoTotal,
            clienteOperacionIds:
              contexto.clienteOperacionIds,
            operacionesInvalidas:
              OPERACIONES_INVALIDAS_TICKET
          })
        ]);

      if (!solicitante) {
        return res.status(400).json({
          error:
            'El solicitante no existe o está inactivo'
        });
      }

      if (!receptor) {
        return res.status(400).json({
          error:
            'La persona que recibirá la pulsera no existe o está inactiva'
        });
      }

      const clientesOperaciones =
        obtenerClientesOperacionesUnicas(
          vehiculos
        );

      const clienteOperacion =
        clientesOperaciones.find(
          item =>
            Number(item.id) ===
            clienteOperacionId
        );

      if (!clienteOperacion) {
        return res.status(403).json({
          error:
            'El cliente y la operación no pertenecen a su alcance asignado'
        });
      }

      evidenciaUrl =
        await uploadToCloudinary(
          req.file.buffer,
          'pulseras/evidencias',
          'image'
        );

      const pulsera =
        await insertarPulsera({
          solicitantePersonaId,
          receptorPersonaId,
          operacion:
            clienteOperacion.operacion,
          clienteOperacionId:
            clienteOperacion.id,
          motivoRenovacion,
          fechaLlegadaPersonal,
          horaLlegadaPersonal,
          evidenciaUrl,
          creadoPor:
            req.user?.id || null
        });

      if (!pulsera) {
        throw new Error(
          'No se pudo registrar la pulsera'
        );
      }

      await logAction(
        req.user?.id || null,
        `Registró reporte de pulsera #${pulsera.id}`,
        'pulseras',
        req,
        null,
        pulsera
      );
      await crearNotificacionesPorRoles({
        roles: ['admin', 'administrador', 'ti'],
        tipo: 'REPORTE_PULSERA_NUEVO',
        titulo: 'Nuevo reporte de pulsera',
        mensaje: `Reporte # ${pulsera.id} registrado para ` +
          `${receptor.nombre_completo}.`,
        url: 'tickets',
        excluirUsuarioId: req.user.id
      }).catch(error => {
        console.error(
          'Error creando notificaciones de pulsera: ',
          error
        );
      });



      return res
        .status(201)
        .json({
          success: true,
          pulsera
        });

    } catch (error) {

      if (evidenciaUrl) {
        await deleteFromCloudinary(
          evidenciaUrl
        ).catch(() => { });
      }

      console.error(
        'Error registrando reporte de pulsera:',
        error
      );

      if (
        error.status === 401 ||
        error.status === 403
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
        return res
          .status(400)
          .json({
            error:
              'El solicitante o receptor ya no existe'
          });
      }

      return res
        .status(500)
        .json({
          error:
            'Error al registrar el reporte de pulsera'
        });
    }
  };

// ==========================================
// LISTAR REPORTES DE PULSERAS
// ==========================================

export const listarReportesPulseras =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(
          req,
          'ver'
        );

      const reportes =
        await obtenerReportesPulseras({
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      return res.json(reportes);
    } catch (error) {
      console.error(
        'Error listando reportes de pulseras:',
        error
      );

      return res
        .status(error.status || 500)
        .json({
          error:
            error.status
              ? error.message
              : 'Error al obtener los reportes de pulseras'
        });
    }
  };

const ESTADOS_REPORTE_PULSERA = [
  'Pendiente',
  'En Proceso',
  'Resuelto'
];

// ==========================================
// CAMBIAR ESTADO DE REPORTE DE PULSERA
// ==========================================

export const cambiarEstadoReportePulsera =
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
      return res.status(400).json({
        error: 'ID de reporte no válido'
      });
    }

    const estadoRecibido =
      String(
        req.body?.estado || ''
      ).trim();

    const estado =
      ESTADOS_REPORTE_PULSERA.find(
        item =>
          item.toLowerCase() ===
          estadoRecibido.toLowerCase()
      );

    if (!estado) {
      return res.status(400).json({
        error: 'Estado de reporte no válido'
      });
    }

    try {
      const contexto =
        await contextoTicket(
          req,
          'gestionar'
        );

      const reporte =
        await actualizarEstadoReportePulsera({
          id,
          estado,
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      if (!reporte) {
        return res.status(404).json({
          error:
            'Reporte no encontrado o fuera de su alcance'
        });
      }

      await logAction(
        req.user.id,
        `Cambió reporte de pulsera #${id} a ${estado}`,
        'pulseras',
        req,
        null,
        reporte
      );
      if (
        Number(reporte.creado_por) !==
        Number(req.user.id)
      ) {
        await crearNotificacionUsuario({
          usuarioId: reporte.creado_por,
          tipo: 'REPORTE_PULSERA_ESTADO',
          titulo: 'Reporte de pulsera actualizado',
          mensaje:
            `El reporte #${reporte.id} cambió a ` +
            `"${estado}".`,
          url: 'tickets'
        }).catch(error => {
          console.error(
            'Error notificando estado de pulsera:',
            error
          );
        });
      }

      return res.json({
        success: true,
        reporte
      });
    } catch (error) {
      console.error(
        'Error actualizando reporte de pulsera:',
        error
      );

      return res
        .status(error.status || 500)
        .json({
          error:
            error.status
              ? error.message
              : 'Error al actualizar el reporte de pulsera'
        });
    }
  };


// ==========================================
// CREAR TICKET DE UNIDAD
// ==========================================
export const createSupportTicket =
  async (req, res) => {
    const {
      placa,
      persona_id,
      tipo_solicitud,
      descripcion,
      implemento,
      fecha_llegada_unidad,
      hora_llegada_unidad
    } = req.body || {};

    const placaFinal =
      String(
        placa || ''
      )
        .trim()
        .toUpperCase();

    const tipoSolicitudFinal =
      String(
        tipo_solicitud || ''
      ).trim();

    const descripcionFinal =
      String(
        descripcion || ''
      ).trim();
    const fechaLlegadaUnidad =
      String(
        fecha_llegada_unidad || ''
      ).trim();

    const horaLlegadaUnidad =
      String(
        hora_llegada_unidad || ''
      ).trim();


    const implementoFinal =
      tipoSolicitudFinal ===
        'Soporte Técnico'
        ? String(
          implemento || ''
        ).trim()
        : null;


    // ========================================
    // VALIDACIONES
    // ========================================

    if (
      !placaFinal ||
      placaFinal.length > 20
    ) {
      return res
        .status(400)
        .json({
          error:
            'Debe seleccionar una placa válida'
        });
    }

    if (!tipoSolicitudFinal) {
      return res
        .status(400)
        .json({
          error:
            'Debe indicar el tipo de solicitud'
        });
    }

    if (!descripcionFinal) {
      return res
        .status(400)
        .json({
          error:
            'La descripción es obligatoria'
        });
    }
    if (
      !esFechaDescargaValida(
        fechaLlegadaUnidad
      ) ||
      !HORA_DESCARGA_REGEX.test(
        horaLlegadaUnidad
      )
    ) {
      return res.status(400).json({
        error:
          'Debe indicar una fecha y hora de llegada de la unidad válidas'
      });
    }
    if (
      tipoSolicitudFinal ===
      'Soporte Técnico' &&
      !IMPLEMENTOS_PERMITIDOS.includes(
        implementoFinal
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Seleccione el implemento que presenta la falla'
        });
    }


    const evidenciasSubidas = [];

    let ticketCreado = false;


    try {
      const contexto =
        await contextoTicket(
          req,
          'crear'
        );

      const vehiculoAutorizado =
        await obtenerVehiculoTicketPorPlaca({
          placa:
            placaFinal,
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      if (!vehiculoAutorizado) {
        return res
          .status(403)
          .json({
            error:
              'La placa no pertenece a sus clientes y operaciones asignados'
          });
      }

      const usuarioTicket =
        await obtenerUsuarioTicket(
          req.user.id
        );

      const personaIdSeleccionada =
        Number(persona_id);

      const personaIdFinal =
        usuarioTicket?.persona_id
          ? Number(usuarioTicket.persona_id)
          : personaIdSeleccionada;

      if (
        !Number.isInteger(personaIdFinal) ||
        personaIdFinal <= 0
      ) {
        return res.status(400).json({
          error:
            'Esta cuenta no está vinculada a una persona. Seleccione un solicitante.'
        });
      }


      // ========================================
      // VALIDAR PERSONA
      // ========================================

      const persona =
        await obtenerPersonaActivaPorId(
          personaIdFinal
        );

      if (!persona) {
        return res
          .status(400)
          .json({
            error:
              'La persona seleccionada no existe o está inactiva'
          });
      }

      // ========================================
      // SUBIR EVIDENCIAS INICIALES
      // ========================================

      for (
        const archivo of
        req.files || []
      ) {
        const url =
          await uploadToCloudinary(
            archivo.buffer,
            'tickets_unidades/evidencias_iniciales',
            'image'
          );

        evidenciasSubidas.push({
          tipo: 'inicial',
          url
        });
      }


      // ========================================
      // CREAR
      // ========================================

      const ticket =
        await insertarTicket({
          placa: placaFinal,
          personaId: personaIdFinal,
          tipoSolicitud: tipoSolicitudFinal,
          descripcion: descripcionFinal,
          implemento: implementoFinal,
          fechaLlegadaUnidad,
          horaLlegadaUnidad,
          evidencias: evidenciasSubidas,
          creadoPor: req.user.id
        });


      if (!ticket) {
        throw new Error(
          'No se pudo crear el ticket'
        );
      }


      ticketCreado = true;


      await logAction(
        req.user?.id || null,

        `Creó ticket de unidad #${ticket.id}`,

        'tickets_unidades',

        req,

        null,

        ticket
      );

      await crearNotificacionesPorRoles({
        roles: [
          'admin', 'administrador', 'ti'
        ],
        tipo: 'TICKET_NUEVO',
        titulo: 'Nuevo ticket de soporte',
        mensaje: `Ticket #${ticket.id} registrado para ` + `la unidad ${placaFinal}. `,
        url: 'tickets',
        excluirUsuarioId: req.user.id,
      }).catch(error => {
        console.error(
          'Error creando notificaciones de ticket',
        );
      });


      return res
        .status(201)
        .json({
          success: true,
          id:
            ticket.id,
          ticket
        });

    } catch (error) {
      if (!ticketCreado) {
        await Promise.allSettled(
          evidenciasSubidas.map(
            evidencia =>
              deleteFromCloudinary(
                evidencia.url
              )
          )
        );
      }


      console.error(
        'Error registrando ticket de unidad:',
        error
      );


      if (
        error.status === 401 ||
        error.status === 403
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
        '23503'
      ) {
        return res
          .status(400)
          .json({
            error:
              'La placa o la persona seleccionada ya no existe'
          });
      }


      return res
        .status(500)
        .json({
          error:
            'Error al registrar el ticket'
        });
    }
  };


// ==========================================
// LISTAR
// ==========================================

export const listarTickets =
  async (req, res) => {
    try {
      const contexto =
        await contextoTicket(req);

      const tickets =
        await obtenerTickets({
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });

      return res.json(
        tickets
      );

    } catch (error) {
      console.error(
        'Error obteniendo tickets:',
        error
      );

      return res
        .status(
          error.status || 500
        )
        .json({
          error:
            error.status === 401 ||
              error.status === 403
              ? error.message
              : 'Error al obtener tickets'
        });
    }
  };


// ==========================================
// ACTUALIZAR ESTADO
// ==========================================

export const actualizarTicket =
  async (req, res) => {
    const { id } =
      req.params;

    const {
      estado,
      resolucion_desc
    } =
      req.body || {};


    if (
      !id ||
      !/^\d+$/.test(
        String(id)
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El identificador del ticket no es válido'
        });
    }


    const estadoFinal =
      String(
        estado || ''
      ).trim();


    if (
      ![
        'Pendiente',
        'En Proceso',
        'Resuelto'
      ].includes(
        estadoFinal
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El estado debe ser Pendiente, En Proceso o Resuelto'
        });
    }


    // ========================================
    // EVIDENCIA OBLIGATORIA AL RESOLVER
    // ========================================

    if (
      estadoFinal ===
      'Resuelto' &&
      !req.file
    ) {
      return res
        .status(400)
        .json({
          error:
            'Debe adjuntar una evidencia para resolver el ticket'
        });
    }


    let evidenciaUrl =
      null;

    let evidenciaPersistida =
      false;


    try {
      const contexto =
        await contextoTicket(
          req,
          'gestionar'
        );

      const valoresAnteriores =
        await obtenerTicketPorId({
          id,
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });


      if (!valoresAnteriores) {
        return res
          .status(404)
          .json({
            error:
              'Ticket no encontrado'
          });
      }


      // ========================================
      // SUBIR EVIDENCIA DE CIERRE
      // ========================================

      if (req.file) {
        evidenciaUrl =
          await uploadToCloudinary(
            req.file.buffer,
            'tickets_unidades/evidencias_cierre',
            'image'
          );
      }


      const valoresActuales =
        await actualizarEstadoTicket({
          id,

          estado:
            estadoFinal,

          evidencia:
            evidenciaUrl,

          accesoTotal:
            contexto.accesoTotal,

          clienteOperacionIds:
            contexto.clienteOperacionIds
        });


      if (!valoresActuales) {
        if (evidenciaUrl) {
          await deleteFromCloudinary(
            evidenciaUrl
          );
        }

        return res
          .status(404)
          .json({
            error:
              'Ticket no encontrado'
          });
      }


      evidenciaPersistida =
        Boolean(
          evidenciaUrl
        );


      await logAction(
        req.user?.id || null,

        `Actualizó ticket de unidad #${id} a ${estadoFinal}`,

        'tickets_unidades',

        req,

        valoresAnteriores,

        valoresActuales
      );
      if (
        valoresActuales.creado_por &&
        Number(valoresActuales.creado_por) !==
        Number(req.user.id)
      ) {
        await crearNotificacionUsuario({
          usuarioId:
            valoresActuales.creado_por,
          tipo: 'TICKET_ESTADO',
          titulo: 'Ticket actualizado',
          mensaje:
            `Tu ticket #${valoresActuales.id} de la unidad ` +
            `${valoresActuales.placa} cambió a ` +
            `"${estadoFinal}".`,
          url: 'tickets'
        }).catch(error => {
          console.error(
            'Error notificando estado del ticket:',
            error
          );
        });
      }


      // ========================================
      // SI SE RESUELVE, REPARAR INSPECCIÓN
      // ========================================

      if (
        estadoFinal ===
        'Resuelto' &&
        valoresActuales.placa
      ) {
        await repararInspeccionRelacionada({
          req,

          ticket:
            valoresActuales,

          ticketId:
            id,

          resolucion:
            resolucion_desc
        });
      }


      return res.json({
        success: true,

        ticket:
          valoresActuales,

        evidenciaUrl
      });


    } catch (error) {
      if (
        evidenciaUrl &&
        !evidenciaPersistida
      ) {
        await deleteFromCloudinary(
          evidenciaUrl
        );
      }


      console.error(
        'Error actualizando ticket:',
        error
      );


      if (
        error.message?.includes(
          'No se puede resolver el ticket sin evidencia'
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              error.message
          });
      }


      return res
        .status(500)
        .json({
          error:
            'Error al actualizar el ticket'
        });
    }
  };


// ==========================================
// REPARAR INSPECCIÓN RELACIONADA
// ==========================================

const repararInspeccionRelacionada =
  async ({
    req,
    ticket,
    ticketId,
    resolucion
  }) => {
    const inspeccionAnterior =
      await obtenerUltimaInspeccion(
        ticket.placa
      );


    if (!inspeccionAnterior) {
      return;
    }


    let tablet =
      inspeccionAnterior.tablet;

    let radio =
      inspeccionAnterior.radio;

    let camaras =
      inspeccionAnterior.camaras;

    let fueActualizada =
      false;


    if (
      componenteConFalla(
        tablet
      )
    ) {
      tablet = 'OK';
      fueActualizada = true;
    }


    if (
      componenteConFalla(
        radio
      )
    ) {
      radio = 'OK';
      fueActualizada = true;
    }


    if (
      componenteConFalla(
        camaras
      )
    ) {
      camaras = 'OK';
      fueActualizada = true;
    }


    if (!fueActualizada) {
      return;
    }


    const resolucionFinal =
      String(
        resolucion || ''
      ).trim();


    const detalleResolucion =
      resolucionFinal
        ? `: ${resolucionFinal}`
        : '';


    const nuevaObservacion =
      `[Reparado por TKT-${ticketId}${detalleResolucion}]`;


    const observaciones =
      inspeccionAnterior
        .observaciones
        ? `${inspeccionAnterior.observaciones} ${nuevaObservacion}`
        : nuevaObservacion;


    const inspeccionActual =
      await actualizarInspeccionTicket({
        id:
          inspeccionAnterior.id,

        tablet,

        radio,

        camaras,

        observaciones
      });


    await logAction(
      req.user?.id || null,

      `Reparó última inspección para ${ticket.placa} mediante TKT-${ticketId}`,

      'inspecciones_flota',

      req,

      inspeccionAnterior,

      inspeccionActual
    );
  };


// ==========================================
// ELIMINAR
// ==========================================

export const eliminarTicket =
  async (req, res) => {
    const { id } =
      req.params;


    if (
      !id ||
      !/^\d+$/.test(
        String(id)
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El identificador del ticket no es válido'
        });
    }


    try {
      const contexto =
        await contextoTicket(
          req,
          'gestionar'
        );

      const ticketEliminado =
        await eliminarTicketPorId({
          id,
          accesoTotal:
            contexto.accesoTotal,
          clienteOperacionIds:
            contexto.clienteOperacionIds
        });


      if (!ticketEliminado) {
        return res
          .status(404)
          .json({
            error:
              'Ticket no encontrado'
          });
      }


      // ========================================
      // BORRAR EVIDENCIAS DE CLOUDINARY
      // ========================================

      const evidencias =
        Array.isArray(
          ticketEliminado.evidencias
        )
          ? ticketEliminado.evidencias
          : [];


      const urls =
        evidencias
          .map(
            evidencia =>
              typeof evidencia ===
                'string'
                ? evidencia
                : evidencia?.url
          )
          .filter(Boolean);


      await Promise.allSettled(
        urls.map(
          url =>
            deleteFromCloudinary(
              url
            )
        )
      );


      await logAction(
        req.user?.id || null,

        `Eliminó ticket de unidad #${id}`,

        'tickets_unidades',

        req,

        ticketEliminado,

        null
      );


      return res.json({
        success: true
      });


    } catch (error) {
      console.error(
        'Error eliminando ticket:',
        error
      );


      return res
        .status(500)
        .json({
          error:
            'Error al eliminar el ticket'
        });
    }
  };
