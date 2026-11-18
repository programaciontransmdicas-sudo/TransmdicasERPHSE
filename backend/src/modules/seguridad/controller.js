import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fallo } from './validaciones.js';
import { construirExcel } from './excel.js';

export const manejar = accion => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      await accion(req, res);
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      const esquema = ['42P01', '3F000', '42703', '42501'].includes(error.code);
      const conexion = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01', '08006'].includes(error.code);
      const estado = error.status || (esquema || conexion ? 503 : 500);
      if (estado >= 500) console.error('Seguridad Patrimonial:', { codigo: error.code, mensaje: error.message });
      res.status(estado).json({ error: error.status ? error.message : esquema
        ? 'No se pudo acceder a TransReport. Revisa que el ERP use la misma base y tenga los permisos necesarios sobre el esquema transreport.'
        : conexion ? 'La conexión con la base de datos no está disponible. Vuelve a intentar.'
          : 'No se pudo completar la operación de Seguridad Patrimonial.' });
    }
};

export function crearControladores(servicio, cloudinary) {
  return {
    resumen: manejar(async (req, res) => res.json(await servicio.resumen(req.query))),
    listar: manejar(async (req, res) => res.json(await servicio.listar(req.params.tipo, req.query))),
    detalle: manejar(async (req, res) => res.json(await servicio.detalle(req.params.tipo, req.params.id))),
    exportar: manejar(async (req, res) => {
      const contenido = await construirExcel(await servicio.exportar(req.params.tipo, req.query));
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="seguridad-${req.params.tipo}.xlsx"`);
      res.send(Buffer.from(contenido));
    }),
    archivo: manejar(async (req, res) => {
      const archivo = await servicio.archivo(req.params.tipo, req.params.id, req.params.archivoId);
      const configuracion = cloudinary.config();
      if (!configuracion.cloud_name || !configuracion.api_key || !configuracion.api_secret) {
        throw fallo('Configura en el ERP la misma cuenta de Cloudinary que utiliza TransReport.', 503);
      }
      const url = cloudinary.url(archivo.public_id, {
        resource_type: archivo.recurso, type: 'authenticated', sign_url: true, secure: true,
        ...(archivo.recurso === 'image' ? { format: archivo.formato } : {}),
      });
      const cierre = new AbortController();
      const cancelar = () => { if (!res.writableFinished) cierre.abort(); };
      res.once('close', cancelar);
      try {
        const upstream = await fetch(url, { signal: AbortSignal.any([cierre.signal, AbortSignal.timeout(20000)]), redirect: 'error' });
        if (!upstream.ok || !upstream.body) throw fallo('No se pudo recuperar el archivo de Cloudinary.', 502);
        const imagen = ['image/jpeg', 'image/png', 'image/webp'].includes(archivo.mime);
        res.set('Content-Type', imagen ? archivo.mime : 'application/octet-stream');
        res.set('X-Content-Type-Options', 'nosniff');
        const nombre = encodeURIComponent(archivo.nombre).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
        res.set('Content-Disposition', `${imagen ? 'inline' : 'attachment'}; filename="archivo.${String(archivo.formato).replace(/[^a-z0-9]/gi, '')}"; filename*=UTF-8''${nombre}`);
        await pipeline(Readable.fromWeb(upstream.body), res, { signal: cierre.signal });
      } finally {
        res.removeListener('close', cancelar);
      }
    }),
  };
}
