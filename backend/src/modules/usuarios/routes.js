import {
  Router
} from 'express';

import {
  requireAdmin
} from '../../middlewares/auth.js';

import {
  listarOperaciones,
  listarClientesOperaciones,
  listarPersonalAdministrativo,
  listarUsuarios,
  registrarUsuario,
  actualizarUsuario,
  cambiarEstado
} from './controller.js';

const router = Router();

router.use(
  requireAdmin
);

// Temporal: se mantiene por compatibilidad.
router.get(
  '/operaciones',
  listarOperaciones
);

// Nuevo catálogo normalizado.
router.get(
  '/clientes-operaciones',
  listarClientesOperaciones
);

router.get(
  '/personal-administrativo',
  listarPersonalAdministrativo
);

router.get(
  '/',
  listarUsuarios
);

router.post(
  '/',
  registrarUsuario
);

router.put(
  '/:id',
  actualizarUsuario
);

router.patch(
  '/:id/estado',
  cambiarEstado
);

export default router;