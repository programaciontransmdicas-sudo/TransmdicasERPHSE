import { indicadoresMantenimiento } from './mantenimiento.js';
import {
  Router
} from 'express';

import {
  obtenerStats,
  obtenerCharts
} from './controller.js';

const router =
  Router();

router.get(
  '/',
  obtenerStats
);

router.get('/mantenimiento', indicadoresMantenimiento);

router.get(
  '/charts',
  obtenerCharts
);

export default router;