import { consultarEquiposVehiculo, actualizarEquiposVehiculo } from './equiposController.js';
import {
  Router
} from 'express';

import {
  opcionesFlota,
  cambiarEstadoVehiculo,
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

router.get('/:placa/equipos', consultarEquiposVehiculo);
router.put('/:placa/equipos', actualizarEquiposVehiculo);
router.patch('/:placa/estado', cambiarEstadoVehiculo);
maestroRoutes.get('/opciones', opcionesFlota);

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