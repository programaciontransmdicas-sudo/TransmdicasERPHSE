import {
  Router
} from 'express';

import {
  requireAdmin,
  requirePermiso
} from '../../middlewares/auth.js';

import {
  upload,
  receiveTicketEvidence
} from '../../middlewares/upload.js';

import {
  opcionesTickets,
  opcionesReportePulseras,
  crearReportePulsera,
  createSupportTicket,
  listarTickets,
  actualizarTicket,
  eliminarTicket,
  opcionesSolicitudDescargaVideos,
  crearSolicitudDescargaVideos,
  listarSolicitudesDescargaVideos,
  cambiarEstadoSolicitudDescargaVideos,
  listarReportesPulseras,
  cambiarEstadoReportePulsera,
} from './controller.js';

// ==========================================
// /api/incidentes
// ==========================================

const router = Router();

router.get(
  '/opciones',
  opcionesTickets
);
// Opciones para reporte de pulseras
router.get(
  '/pulseras/opciones',
  requirePermiso('tickets', 'crear'),
  opcionesReportePulseras
);

// Crear reporte de pulsera
router.post(
  '/pulseras',
  requirePermiso('tickets', 'crear'),
  upload.single('evidencia'),
  crearReportePulsera
);
router.get(
  '/pulseras',
  requirePermiso(
    'tickets',
    'ver'
  ),
  listarReportesPulseras
);

router.patch(
  '/pulseras/:id/estado',
  requirePermiso(
    'tickets',
    'gestionar'
  ),
  cambiarEstadoReportePulsera
);
// Opciones para solicitudes de descarga de videos
router.get(
  '/solicitudes-descarga-videos/opciones',
  requirePermiso(
    'tickets',
    'crear'
  ),
  opcionesSolicitudDescargaVideos
);

// Crear solicitud de descarga de videos
router.post(
  '/solicitudes-descarga-videos',
  requirePermiso(
    'tickets',
    'crear'
  ),
  crearSolicitudDescargaVideos
);
// Listar solicitudes de descarga
router.get(
  '/solicitudes-descarga-videos',
  requirePermiso(
    'tickets',
    'ver'
  ),
  listarSolicitudesDescargaVideos
);

// Atender o rechazar una solicitud
router.patch(
  '/solicitudes-descarga-videos/:id/estado',
  requirePermiso(
    'tickets',
    'gestionar'
  ),
  cambiarEstadoSolicitudDescargaVideos
);

router.get(
  '/',
  listarTickets
);

router.put(
  '/:id',
  upload.single(
    'evidencia'
  ),
  actualizarTicket
);

router.delete(
  '/:id',
  requireAdmin,
  eliminarTicket
);

// ==========================================
// /api/incidentes_soporte
// ==========================================

export const protectedTicketCreationRoutes =
  Router();

protectedTicketCreationRoutes.post(
  '/',
  requirePermiso(
    'tickets',
    'crear'
  ),
  receiveTicketEvidence,
  createSupportTicket
);

// ==========================================
// /api/public
// ==========================================

export const publicTicketCreationRoutes =
  Router();

publicTicketCreationRoutes.post(
  '/incidentes-soporte',
  receiveTicketEvidence,
  createSupportTicket
);

export default router;