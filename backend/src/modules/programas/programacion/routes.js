import {
  Router
} from 'express';

import {
  listarProgramacion,
  obtenerVisita,
  destinosReprogramacion,
  programar,
  programarLote,
  reprogramar,
  elevarNivel,
  cancelar
} from './controller.js';

import ordenesRoutes from './ordenes/routes.js';
import { descargarProgramaExcel } from './excel/controller.js';

// mergeParams para recibir :programaId del router padre.
const router = Router({
  mergeParams: true
});

// ==========================================
// PROGRAMACION DE MANTENIMIENTO (TI-PR-01)
// Montadas bajo /api/programas-mantenimiento/:programaId/programacion, asi que heredan la
// regla de autorizacion del modulo 'mantenimiento'.
//
// SIN POST: crear programacion es trabajo del generador, no de un alta manual por API.
// SIN DELETE: la base lo aceptaria -y programacion_mantenimiento_equipos tiene ON DELETE
// CASCADE, asi que se llevaria la evidencia del alcance-, pero borrar una visita no es una
// operacion del negocio. Una visita se reprograma o se cancela, y la fila permanece.
// ==========================================

router.get(
  '/',
  listarProgramacion
);

// Literal antes de /:id: la descarga no es un identificador de visita.
router.get('/exportar-excel', descargarProgramaExcel);

router.get(
  '/:id',
  obtenerVisita
);

// DESTINOS DE REPROGRAMACION · F4.2
//
// GET y no parte del detalle: el catalogo cuesta dos consultas por visita y solo lo necesita
// la visita que el operador tiene abierta, no las 886 del listado.
//
// Vive en este mismo router, dentro del modulo de programacion, porque es la misma regla que
// aplica PATCH /:id/reprogramar leida en vez de ejecutada. No es un modulo aparte.
//
// No colisiona con '/:id': son dos segmentos y el ultimo es un literal, el mismo patron que
// '/:id/programar'.
router.get(
  '/:id/destinos-reprogramacion',
  destinosReprogramacion
);

// PROGRAMACION POR LOTE · F4.1
//
// Se declara ANTES de las rutas de ':id' a proposito. No colisionan -'/programar-lote' es
// UN segmento y '/:id/programar' son DOS, asi que Express no puede confundirlas-, pero
// declararla primero deja la precedencia explicita en vez de depender de contar segmentos.
//
// PATCH y no POST: no crea nada. Confirma el estado de visitas que YA existen, igual que su
// hermana individual. La lista de ids va en el cuerpo porque una URL con 148 identificadores
// no es una URL.
//
// ATOMICA: o se confirman todas las visitas seleccionadas o ninguna. La regla por visita es
// la misma que la del PATCH individual -bloqueos() en el service-, no una copia.
router.patch(
  '/programar-lote',
  programarLote
);

// Programar confirma la visita. Reprogramar y elevar nivel usan una transacción por
// unidad: mueven las pendientes y recalculan la proyección sin alterar órdenes ni ciclos.
router.patch(
  '/:id/programar',
  programar
);

router.patch(
  '/:id/reprogramar',
  reprogramar
);

router.patch('/:id/nivel', elevarNivel);

router.patch(
  '/:id/cancelar',
  cancelar
);

// Las ordenes de trabajo cuelgan de la visita, que es de quien dependen por FK obligatoria.
// El parametro se llama :programacionId y no :id porque dentro de ese router conviven con
// el :otId de la propia orden, y dos ids sin nombre propio se confunden.
//
// No colisiona con las rutas de arriba: '/:id' exige un solo segmento, y las de dos
// segmentos terminan en un literal distinto -reprogramar, cancelar, programar-.
router.use(
  '/:programacionId/ordenes-trabajo',
  ordenesRoutes
);

export default router;
