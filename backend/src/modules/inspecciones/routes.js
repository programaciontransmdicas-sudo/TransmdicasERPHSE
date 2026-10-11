import {
  Router
} from 'express';

import {
  upload
} from '../../middlewares/upload.js';

import {
  listarHistorial,
  registrarInspeccion,
  editarInspeccion,
  borrarInspeccion
} from './controller.js';

const router = Router();

const camposImagen = upload.fields([
  {
    name: 'img_tablet',
    maxCount: 1
  },
  {
    name: 'img_radio',
    maxCount: 1
  },
  {
    name: 'img_camaras',
    maxCount: 1
  }
]);

router.get(
  '/:placa',
  listarHistorial
);

router.post(
  '/',
  camposImagen,
  registrarInspeccion
);

router.put(
  '/:id',
  camposImagen,
  editarInspeccion
);

router.delete(
  '/:id',
  borrarInspeccion
);

export default router;