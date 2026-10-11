import {
  Router
} from 'express';

import {
  listarOperaciones,
  generarMaster,
  generarMantenimientoExcel,
  generarPDFInspecciones,
  generarExcelInspecciones
} from './controller.js';

export const apiReportesRoutes =
  Router();

export const reportesRoutes =
  Router();

// ==========================================
// API REPORTES
// ==========================================

apiReportesRoutes.get(
  '/operaciones',
  listarOperaciones
);

apiReportesRoutes.get(
  '/master',
  generarMaster
);

apiReportesRoutes.get(
  '/mantenimiento-excel',
  generarMantenimientoExcel
);

// ==========================================
// REPORTES
// ==========================================

reportesRoutes.get(
  '/pdf',
  generarPDFInspecciones
);

reportesRoutes.get(
  '/excel',
  generarExcelInspecciones
);