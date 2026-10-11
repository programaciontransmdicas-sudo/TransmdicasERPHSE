import {Router} from 'express';

import {
    listarNotificaciones,
    leerNotificacion,
    leerTodasNotificaciones
} from './controller.js';

const router = Router();

router.get(
    '/',
    listarNotificaciones
);

router.patch(
    '/leer-todas',
    leerTodasNotificaciones
);

router.patch(
    '/:id/leida',
    leerNotificacion                       
);

export default router;