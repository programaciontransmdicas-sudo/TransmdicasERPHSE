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

router.get(
  '/charts',
  obtenerCharts
);

export default router;