import { listarChecklistOrden, editarActividadChecklist } from './checklist.js';
import { listarAuditoriaOrden } from './auditoria.js';

import {
  Router
} from 'express';

import {
  abrirOrden,
  listarOrdenes,
  obtenerOrden,
  editarOrden,
  editarDetalle,
  cerrarOrdenTrabajo,
  anularOrdenTrabajo,
  subirEvidencia,
  listarEvidencias,
  obtenerImagenEvidencia,
  retirarEvidenciaDeOrden
} from './controller.js';

// El multer propio de la evidencia: un archivo, 10 MB, solo JPEG/PNG/WEBP. Sus errores
// -LIMIT_FILE_SIZE e INVALID_FILE_TYPE- ya los traduce middlewares/errors.js, igual que
// para entregas, inspecciones y tickets.
import {
  receiveEvidenciaOrden
} from '../../../../middlewares/upload.js';

// mergeParams para recibir :programaId y :programacionId de los routers padres.
const router = Router({
  mergeParams: true
});

// ==========================================
// ORDENES DE TRABAJO (TI-PR-01)
// Montadas bajo /api/programas-mantenimiento/:programaId/programacion/:programacionId/
// ordenes-trabajo, asi que heredan la regla de autorizacion del modulo 'mantenimiento' que
// ya declara security.js para toda la familia. No hace falta tocar app.js ni security.js.
//
// ETAPA 4.3: abrir, listar, obtener, editar la cabecera, registrar el resultado de un
// equipo, cerrar y anular. El ciclo de vida completo de una orden.
//
// SIN POST de detalles, ni ahora ni despues: el conjunto de detalles es exactamente el de
// los equipos previstos de la visita, y se materializa al abrir, en la misma transaccion.
// Anadir uno a mano permitiria una OT con un alcance distinto al que congelo 016 R2.
//
// SIN DELETE: la regla R1 de 20260928_016 prohibe borrar una OT en cualquier estado, porque
// su existencia es lo que vuelve historico el alcance de la visita. Una OT abierta por
// error se anula, con su motivo.
// ==========================================

router.post(
  '/',
  abrirOrden
);

router.get(
  '/',
  listarOrdenes
);

router.get(
  '/:otId',
  obtenerOrden
);

router.get('/:otId/auditoria', listarAuditoriaOrden);
router.get('/:otId/checklist', listarChecklistOrden);
router.patch('/:otId/checklist/:actividadId', editarActividadChecklist);

// PATCH y no PUT: cada uno toca un subconjunto declarado de campos y deja el resto intacto.
router.patch(
  '/:otId',
  editarOrden
);

// El resultado se registra POR EQUIPO. No hay POST ni DELETE de detalles: el conjunto es
// exactamente el de los equipos previstos y se materializo al abrir la orden.
router.patch(
  '/:otId/detalles/:detalleId',
  editarDetalle
);

// POST y no PATCH: cerrar no es editar un campo. Es una transicion con efectos en tres
// tablas -la visita, los ciclos y la propia orden- que ejecuta cerrar_orden_trabajo() en la
// base. No es idempotente: cerrar dos veces es un conflicto, no una repeticion inocua.
router.post(
  '/:otId/cerrar',
  cerrarOrdenTrabajo
);

// PATCH y no DELETE: anular NO borra. La orden permanece con su motivo y con todos sus
// detalles, porque su existencia es lo que vuelve historico el alcance de la visita
// (016 R1). Repetirlo SI es idempotente: la situacion final es la misma.
router.patch(
  '/:otId/anular',
  anularOrdenTrabajo
);

// ==========================================
// EVIDENCIA FOTOGRAFICA · F5.2
// ==========================================
// Cuelgan de la orden porque la evidencia pertenece a su APARTADO, que es una fila de
// ordenes_trabajo_detalle. La subida cuelga del detalle; la lectura y el retiro de la
// orden, porque la galeria se consulta entera y una evidencia ya sabe a que apartado va.
//
// Heredan la autorizacion del modulo 'mantenimiento' como el resto de la familia: no hace
// falta tocar app.js ni security.js. Quien puede SUBIR o RETIRAR se comprueba ademas por
// rol dentro de cada endpoint -TI para subir, TI o ADMIN para retirar segun el estado de la
// orden-, porque el modulo de permiso no distingue eso.
//
// SIN DELETE: retirar es un cambio de estado con autor, fecha y motivo, no un borrado.
// SIN PUT: una evidencia no se reemplaza; se retira y se sube otra.
// SIN endpoint de descarga, ni ahora ni despues.

// La subida va al APARTADO. Un archivo por peticion, en el campo `imagen`.
router.post(
  '/:otId/detalles/:detalleId/evidencias',
  receiveEvidenciaOrden,
  subirEvidencia
);

// La galeria de la orden: solo ACTIVAS, agrupadas por apartado.
router.get(
  '/:otId/evidencias',
  listarEvidencias
);

// LA IMAGEN LA SIRVE EL ERP. El cliente nunca recibe la URL de Cloudinary: pide esta ruta,
// el backend comprueba el acceso, firma internamente y devuelve los bytes con
// Content-Disposition inline y sin cache compartida.
//
// Se declara ANTES de ninguna ruta de un solo segmento bajo /evidencias para que la
// precedencia quede explicita; hoy no hay colision posible porque son tres segmentos.
router.get(
  '/:otId/evidencias/:evidenciaId/imagen',
  obtenerImagenEvidencia
);

router.patch(
  '/:otId/evidencias/:evidenciaId/retirar',
  retirarEvidenciaDeOrden
);

export default router;
