import {
  Router
} from 'express';

import {
  listarProgramas,
  obtenerPrograma,
  listarTecnicosTi,
  registrarPrograma,
  editarPrograma,
  cambiarEstadoPrograma
} from './controller.js';

import unidadesRoutes from './unidades/routes.js';
import frecuenciasRoutes from './frecuencias/routes.js';
import programacionRoutes from './programacion/routes.js';

const router = Router();

// ==========================================
// PROGRAMAS DE MANTENIMIENTO (TI-PR-01)
// La autorizacion la aplica authorizeRequest con el modulo 'mantenimiento'.
// No hay DELETE: los programas se cierran o anulan cambiando su estado, y ademas
// fk_programa_unidad_programa, fk_frecuencia_programa y fk_version_programa son
// ON DELETE RESTRICT.
//
// POST responde 501 a proposito: crear un programa exige hoy escribir columnas que los
// cleanup 900/901 eliminan. El motivo va en la respuesta, en controller.js.
// ==========================================

router.get(
  '/',
  listarProgramas
);

// CATALOGO DE TECNICOS TI · F5.1
//
// SE DECLARA ANTES DE '/:id' Y ES OBLIGATORIO QUE SEA ASI: las dos son GET de UN segmento,
// asi que Express toma la primera que coincida. Si '/:id' fuera antes, 'tecnicos' entraria
// como id y normalizarId contestaria 400 'id debe ser un entero positivo'.
//
// No cuelga de /:id porque el catalogo no pertenece a un programa: es del dominio.
router.get(
  '/tecnicos',
  listarTecnicosTi
);

router.get(
  '/:id',
  obtenerPrograma
);

router.post(
  '/',
  registrarPrograma
);

router.put(
  '/:id',
  editarPrograma
);

router.patch(
  '/:id/estado',
  cambiarEstadoPrograma
);

// ==========================================
// UNIDADES DEL PROGRAMA
// ==========================================

router.use(
  '/:programaId/unidades',
  unidadesRoutes
);

// ==========================================
// FRECUENCIAS DEL PROGRAMA · solo lectura
// ==========================================

router.use(
  '/:programaId/frecuencias',
  frecuenciasRoutes
);

// ==========================================
// PROGRAMACION DEL PROGRAMA · consulta, reprogramar y cancelar
// ==========================================

router.use(
  '/:programaId/programacion',
  programacionRoutes
);

export default router;
