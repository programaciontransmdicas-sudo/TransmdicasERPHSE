import {
  Router
} from 'express';

import {
  obtenerStatsPublicos,
  consultarUnidadPublica
} from './controller.js';

const router =
  Router();

router.get(
  '/stats',
  obtenerStatsPublicos
);

router.get(
  '/consulta/:placa',
  consultarUnidadPublica
);

export default router;