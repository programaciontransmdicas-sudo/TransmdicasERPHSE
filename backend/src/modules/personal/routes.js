import {
  Router
} from 'express';

import {
  listarPersonal,
  registrarPersonal,
  editarPersonal,
  borrarPersonal
} from './controller.js';

const router = Router();

router.get(
  '/',
  listarPersonal
);

router.post(
  '/',
  registrarPersonal
);

router.put(
  '/:id',
  editarPersonal
);

router.delete(
  '/:id',
  borrarPersonal
);

export default router;