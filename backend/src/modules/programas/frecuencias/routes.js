import {
  Router
} from 'express';

import {
  listarFrecuencias
} from './controller.js';

// mergeParams para recibir :programaId del router padre.
const router = Router({
  mergeParams: true
});

// ==========================================
// FRECUENCIAS DE UN PROGRAMA (TI-PR-01)
// Montadas bajo /api/programas-mantenimiento/:programaId/frecuencias, así que heredan la
// regla de autorización del módulo 'mantenimiento'.
//
// SOLO LECTURA. La tabla es configuración del programa, cargada por
// backend/scripts/ti-pr-01/cargar-fase-b.mjs desde el cajetín del documento. Cambiar una
// periodicidad por API movería todos los vencimientos futuros del generador sin tocar un
// solo ciclo ya ejecutado, y eso es una decisión de negocio que no está tomada.
// ==========================================

router.get(
  '/',
  listarFrecuencias
);

export default router;
