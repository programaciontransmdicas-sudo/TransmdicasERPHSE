import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { exigir } from './primitivas.js';
import { fallo } from '../validaciones.js';

export async function identificarArchivo(file, tipo) {
  if (!file) {
    exigir(tipo !== 'activos', 'Adjunta el documento de sustento del movimiento.');
    return null;
  }
  let identificacion;
  try { identificacion = await fileTypeFromBuffer(file.buffer); } catch { /* Se rechaza abajo. */ }
  if (identificacion?.ext === 'cfb' && /\.doc$/i.test(file.originalname) && file.buffer.includes(Buffer.from('WordDocument', 'utf16le'))) identificacion = { ext: 'doc', mime: 'application/msword' };
  const permitidos = tipo === 'terceros' ? ['pdf', 'doc', 'docx'] : ['jpg', 'png', 'webp', 'pdf'];
  exigir(identificacion && permitidos.includes(identificacion.ext), tipo === 'terceros' ? 'El SCTR debe ser un documento PDF o Word válido.' : 'El sustento debe ser una imagen JPG, PNG o WebP, o un PDF válido.');
  exigir(file.buffer.length <= 5 * 1024 * 1024, 'El archivo admite hasta 5 MB.');
  return { buffer: file.buffer, formato: identificacion.ext, mime: identificacion.mime,
    recurso: ['jpg', 'png', 'webp'].includes(identificacion.ext) ? 'image' : 'raw',
    nombre: path.basename(file.originalname.replaceAll('\\', '/')).slice(0, 180) || `archivo.${identificacion.ext}`, bytes: file.buffer.length };
}

export function crearAlmacenERP(cloudinary) {
  return {
    async subir(archivo, publicId) {
      const config = cloudinary.config();
      if (!config.cloud_name || !config.api_key || !config.api_secret) throw fallo('Configura en el ERP la misma cuenta de Cloudinary que utiliza TransReport.', 503);
      try {
        await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: archivo.recurso,
            type: 'authenticated', overwrite: false, timeout: 20000,
            ...(archivo.recurso === 'image' ? { allowed_formats: ['jpg', 'png', 'webp'] } : {}) },
          (error, resultado) => error ? reject(error) : resolve(resultado));
          stream.on('error', reject); stream.end(archivo.buffer);
        });
      } catch (error) { if (error.status) throw error; throw fallo('No se pudo guardar el archivo de sustento. Vuelve a intentar el mismo envío.', 502); }
    },
    borrar: archivo => cloudinary.uploader.destroy(archivo.publicId, { resource_type: archivo.recurso, type: 'authenticated', invalidate: true }),
  };
}

export async function adjuntarArchivo(cliente, almacen, tipo, datos, archivo, intentadas) {
  if (!archivo) return [];
  const id = randomUUID();
  const publicId = `transreport/adjuntos/${tipo}/${datos.id}/${id}${archivo.recurso === 'raw' ? `.${archivo.formato}` : ''}`;
  intentadas.push({ publicId, recurso: archivo.recurso });
  await almacen.subir(archivo, publicId);
  await cliente.query(`INSERT INTO transreport.archivos(id,tipo,registro_id,base,nombre,public_id,recurso,formato,mime,bytes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, tipo, datos.id, datos.base, archivo.nombre, publicId, archivo.recurso, archivo.formato, archivo.mime, archivo.bytes]);
  return [{ id, nombre: archivo.nombre, tipo: archivo.mime, formato: archivo.formato, bytes: archivo.bytes, url: `/api/archivos/${id}` }];
}
