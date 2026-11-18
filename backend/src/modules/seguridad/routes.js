import { Router } from 'express';
import { buscarCatalogo } from './catalogos.js';
import { v2 as cloudinary } from 'cloudinary';
import { pool } from '../../config/database.js';
import { crearRepositorio } from './repository.js';
import { crearServicio } from './service.js';
import { crearControladores } from './controller.js';
import { requireAdmin, requirePermiso } from '../../middlewares/auth.js';
import { crearAlmacenERP } from './formularios/archivos.js';
import { crearEscrituraService } from './formularios/service.js';
import { crearCargaERP, crearControladoresEscritura } from './formularios/controller.js';

const router = Router();
router.use(requireAdmin);
const controller = crearControladores(crearServicio(crearRepositorio(pool)), cloudinary);
const escritura = crearControladoresEscritura(crearEscrituraService({ pool, almacen: crearAlmacenERP(cloudinary) }));

// Se monta después del JWT y de authorizeRequest del ERP.
router.get('/catalogos/:tipo', requirePermiso('seguridad', 'editar'), buscarCatalogo);
router.get('/resumen', controller.resumen);
router.get('/registros/:tipo/exportar', controller.exportar);
router.get('/registros/:tipo/:id/archivos/:archivoId', controller.archivo);
router.get('/registros/:tipo/:id', controller.detalle);
router.get('/registros/:tipo', controller.listar);
router.post('/registros/:tipo', requirePermiso('seguridad', 'editar'), crearCargaERP, escritura.crear);
router.post('/registros/:tipo/:id/:accion', requirePermiso('seguridad', 'editar'), escritura.cerrar);

export default router;
