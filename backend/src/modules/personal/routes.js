import {
  Router
} from 'express';

import {
  opcionesPersonal,
  cambiarEstadoPersonal,
  listarPersonal,
  registrarPersonal,
  editarPersonal,
  borrarPersonal
} from './controller.js';

const router = Router();

router.get('/opciones', opcionesPersonal);
router.patch('/:id/estado', cambiarEstadoPersonal);

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