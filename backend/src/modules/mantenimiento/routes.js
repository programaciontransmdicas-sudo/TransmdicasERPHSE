import {
  Router
} from 'express';

import {
  listarMantenimientos,
  registrarMantenimiento
} from './controller.js';

const router = Router();

router.get(
  '/',
  listarMantenimientos
);

router.post(
  '/',
  registrarMantenimiento
);

export default router;