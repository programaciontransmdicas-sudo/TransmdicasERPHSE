import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { 
login,
listarUsuariosActivosLogin
} from './controller.js';

const router = Router();

const limitarBusquedaUsuariosLogin=
  rateLimit({
    windowMs: 15 * 60* 100,
    limit:120,
    standardHeaders:'draft-8',
    legacyHeaders:false,
    message:{
      error:
      'Demasiadas busquedas. Espera unos minutos'
    }
  });

const limitarIntentosLogin = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 20,

  skipSuccessfulRequests: true,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    error:
      'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.'
  }
});
router.get(
  '/usuarios-activos',
  limitarBusquedaUsuariosLogin,
  listarUsuariosActivosLogin
);
router.post(
  '/login',
  limitarIntentosLogin,
  login
);

export default router;