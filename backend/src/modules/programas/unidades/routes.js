import {
  Router
} from 'express';

import {
  listarUnidades,
  obtenerUnidad,
  agregarUnidad,
  editarUnidad
} from './controller.js';

import insumosRoutes from './insumos/routes.js';

// mergeParams para recibir :programaId del router padre.
const router = Router({
  mergeParams: true
});

// ==========================================
// UNIDADES DE UN PROGRAMA (TI-PR-01)
// Montadas bajo /api/programas-mantenimiento/:programaId/unidades, asi que heredan la
// regla de autorizacion del modulo 'mantenimiento'.
// Sin DELETE: dar de baja una unidad arrastraria sus ciclos, sus anclas y su programacion.
// La politica de baja se define junto con programacion_mantenimiento.
// ==========================================

router.get(
  '/',
  listarUnidades
);

router.get(
  '/:id',
  obtenerUnidad
);

router.post(
  '/',
  agregarUnidad
);

router.put(
  '/:id',
  editarUnidad
);

// ==========================================
// INSUMOS DE LA UNIDAD · inventario TI, ciclos y anclas
// Va al final: router.get('/:id') solo casa con la ruta exacta, asi que /:id/equipos y
// /:id/ciclos caen aqui. Un solo parametro de unidad, sin duplicar rutas.
// ==========================================

router.use(
  '/:id',
  insumosRoutes
);

export default router;
