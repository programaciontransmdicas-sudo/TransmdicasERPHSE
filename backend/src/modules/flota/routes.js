import {
  Router
} from 'express';

import {
  listarVehiculos,
  registrarVehiculo,
  editarVehiculo,
  borrarVehiculo,
  listarTractos
} from './controller.js';

const router = Router();

export const maestroRoutes =
  Router();

// ==========================================
// VEHÍCULOS
// ==========================================

router.get(
  '/',
  listarVehiculos
);

router.post(
  '/',
  registrarVehiculo
);

router.put(
  '/:placa',
  editarVehiculo
);

router.delete(
  '/:placa',
  borrarVehiculo
);

// ==========================================
// MAESTRO DE FLOTA
// ==========================================

maestroRoutes.get(
  '/tractos',
  listarTractos
);

export default router;