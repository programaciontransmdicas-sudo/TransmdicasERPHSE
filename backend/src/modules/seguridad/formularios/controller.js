import multer from 'multer';
import { manejar } from '../controller.js';
import { fallo } from '../validaciones.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 128 * 1024, parts: 2, fieldNameSize: 40 } });
export function crearCargaERP(req, res, next) {
  if (!['terceros', 'activos', 'llaves'].includes(req.params.tipo)) return res.status(400).json({ error: 'Este control no se registra desde el ERP.' });
  if (!req.is('multipart/form-data')) return res.status(415).json({ error: 'El formulario debe enviarse con sus archivos adjuntos.' });
  upload.single(req.params.tipo === 'terceros' ? 'sctr' : 'sustento')(req, res, error => {
    if (!error) return next();
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'El archivo admite hasta 5 MB.' : 'Envía un solo archivo y los datos del formulario.' });
  });
}

export function crearControladoresEscritura(servicio) {
  return {
    crear: manejar(async (req, res) => {
      if (Object.keys(req.body || {}).some(k => k !== 'datos') || typeof req.body?.datos !== 'string') throw fallo('Revisa los datos del formulario.');
      let datos;
      try { datos = JSON.parse(req.body.datos); } catch { throw fallo('No se pudieron leer los datos del formulario.'); }
      const resultado = await servicio.crear(req.params.tipo, datos, req.file, req.user, req.get('Idempotency-Key'));
      res.status(resultado.repetida ? 200 : 201).json(resultado);
    }),
    cerrar: manejar(async (req, res) => {
      if ((req.params.tipo === 'terceros' && req.params.accion !== 'salida') || (req.params.tipo === 'activos' && req.params.accion !== 'retorno') || (req.params.tipo === 'llaves' && req.params.accion !== 'devolucion')) throw fallo('La acción no corresponde a este control.');
      res.json(await servicio.cerrar(req.params.tipo, req.params.id, req.body, req.user, req.get('Idempotency-Key')));
    }),
  };
}
