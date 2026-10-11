import {
  Router
} from 'express';

import {
  listarEquipos,
  listarCiclos
} from './controller.js';

// mergeParams para recibir :programaId y :id de los routers padres.
const router = Router({
  mergeParams: true
});

// ==========================================
// INSUMOS DE UNA UNIDAD (TI-PR-01)
// Montadas bajo /api/programas-mantenimiento/:programaId/unidades/:id, así que heredan la
// regla de autorización del módulo 'mantenimiento'.
//
// SOLO LECTURA, sin excepción. Los ciclos los mueve cerrar_orden_trabajo(); las anclas las
// siembra el loader inicial. Aquí solo se exponen.
// ==========================================

router.get(
  '/equipos',
  listarEquipos
);

router.get(
  '/ciclos',
  listarCiclos
);

export default router;
