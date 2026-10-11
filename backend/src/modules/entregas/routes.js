import { Router } from 'express';
import {
  requireAdmin,
  hasPermiso
} from '../../middlewares/auth.js';

import {
  upload
} from '../../middlewares/upload.js';


import {
  listarLegacy,
  registrarLegacy,
  buscarPersonal,
  listarOpcionesEntregas,
  listarInventario,
  registrarMovimiento,
  editarMovimiento,
  borrarMovimiento,
  importarExcel,
  exportarExcel
} from './controller.js';

export const legacyEntregasRoutes = Router();
export const entregasRoutes = Router();

// ==========================================
// RUTAS LEGACY /entregas
// ==========================================

legacyEntregasRoutes.get(
  '/',
  listarLegacy
);

legacyEntregasRoutes.post(
  '/',
  registrarLegacy
);

// ==========================================
// CONSULTAR PERSONAL POR DNI
// ==========================================

entregasRoutes.get(
  '/opciones',
  listarOpcionesEntregas
);

entregasRoutes.get(
  '/personal/:dni',
  buscarPersonal
);

// ==========================================
// LISTAR INVENTARIO
// ==========================================

entregasRoutes.get(
  '/',
  listarInventario
);

// ==========================================
// CREAR ENTREGA / DEVOLUCIÓN
// ==========================================

entregasRoutes.post(
  '/',
  upload.single('acta'),
  registrarMovimiento
);

// ==========================================
// ACTUALIZAR
// ==========================================

entregasRoutes.put(
  '/:id',
  upload.single('acta'),
  editarMovimiento
);

// ==========================================
// ELIMINAR
// ==========================================

entregasRoutes.delete(
  '/:id',
  requireAdmin,
  borrarMovimiento
);

// ==========================================
// IMPORTAR EXCEL
// ==========================================

entregasRoutes.post(
  '/upload-excel',
  requireAdmin,
  (req, res, next) => {
    if (
      !hasPermiso(
        req,
        'entregas',
        'editar'
      ) ||
      !hasPermiso(
        req,
        'devoluciones',
        'editar'
      )
    ) {
      return res
        .status(403)
        .json({
          error:
            'No tienes permiso para realizar cargas masivas de inventario'
        });
    }

    return next();
  },
  upload.single('file'),
  importarExcel
);
// ==========================================
// EXPORTAR EXCEL
// ==========================================

entregasRoutes.get(
  '/export-excel',
  exportarExcel
);
