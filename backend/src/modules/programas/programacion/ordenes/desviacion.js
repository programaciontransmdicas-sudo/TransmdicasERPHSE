import { pool } from '../../../../config/database.js';
import { logAction } from '../../../../services/auditService.js';
import { subirEvidenciaAutenticada, destruirEvidenciaAutenticada, urlFirmadaEvidencia } from '../../../../services/cloudinaryService.js';
import { LIMITE_EVIDENCIA_TI_BYTES } from '../../../../middlewares/upload.js';
import { manejar, normalizarId, noEncontrado, ValidationError, esUsuarioTi, esUsuarioAdmin } from '../../comun.js';
import { obtenerOrdenPorId, obtenerOrdenParaEscritura } from './repository.js';
import { validarArchivoEvidencia } from './service.js';

const ids = req => [normalizarId('programaId', req.params.programaId), normalizarId('programacionId', req.params.programacionId), normalizarId('otId', req.params.otId)];
const presentar = row => row ? { existe: row.existe, descripcion: row.descripcion, tiene_imagen: Boolean(row.imagen_public_id), actualizado_en: row.actualizado_en } : null;

export const obtenerDesviacion = manejar(async (req, res) => {
  const [programaId, programacionId, otId] = ids(req);
  if (!await obtenerOrdenPorId(programaId, programacionId, otId)) throw noEncontrado('La orden no existe');
  const result = await pool.query('SELECT * FROM ordenes_trabajo_desviaciones WHERE orden_trabajo_id=$1', [otId]);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ desviacion: presentar(result.rows[0]) });
}, { mensajeGenerico: 'No se pudo consultar la desviación' });

export const guardarDesviacion = manejar(async (req, res) => {
  if (!req.user?.id || (!esUsuarioTi(req.user) && !esUsuarioAdmin(req.user))) throw new ValidationError('Solo TI o un administrador pueden registrar la desviación', 403);
  const [programaId, programacionId, otId] = ids(req);
  if (!['true', 'false'].includes(req.body?.existe)) throw new ValidationError('Selecciona si se encontró una desviación');
  const existe = req.body.existe === 'true';
  const descripcion = String(req.body.descripcion || '').trim();
  if (existe && (!descripcion || descripcion.length > 4000)) throw new ValidationError('Describe la desviación, con un máximo de 4000 caracteres');
  if (!existe && req.file) throw new ValidationError('Una orden sin desviación no admite fotografía de desviación');
  const ordenPrevia = await obtenerOrdenPorId(programaId, programacionId, otId);
  if (!ordenPrevia) throw noEncontrado('La orden no existe');
  if (ordenPrevia.estado !== 'ABIERTA') throw new ValidationError('Solo se puede editar una orden abierta', 409);
  let subida = null, guardada = false, imagenAnterior = null;
  try {
    if (req.file) {
      validarArchivoEvidencia(req.file, LIMITE_EVIDENCIA_TI_BYTES);
      subida = await subirEvidenciaAutenticada(req.file.buffer);
    }
    const client = await pool.connect();
    let registro;
    try {
      await client.query('BEGIN');
      const orden = await obtenerOrdenParaEscritura(programaId, programacionId, otId, client);
      if (!orden) throw noEncontrado('La orden no existe');
      if (orden.estado !== 'ABIERTA') throw new ValidationError('Solo se puede editar una orden abierta', 409);
      const anterior = (await client.query('SELECT * FROM ordenes_trabajo_desviaciones WHERE orden_trabajo_id=$1 FOR UPDATE', [otId])).rows[0];
      imagenAnterior = anterior?.imagen_public_id || null;
      const imagen = existe ? (subida?.public_id || imagenAnterior) : null;
      registro = (await client.query(`INSERT INTO ordenes_trabajo_desviaciones (orden_trabajo_id, existe, descripcion, imagen_public_id, actualizado_por_id)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (orden_trabajo_id) DO UPDATE SET existe=EXCLUDED.existe,
        descripcion=EXCLUDED.descripcion, imagen_public_id=EXCLUDED.imagen_public_id, actualizado_por_id=EXCLUDED.actualizado_por_id, actualizado_en=now() RETURNING *`,
      [otId, existe, existe ? descripcion : null, imagen, req.user.id])).rows[0];
      await logAction(req.user.id, `Actualizó la desviación adicional de la OT ${otId}`, 'ordenes_trabajo_desviaciones', req, anterior || null, registro, { client, propagarError: true });
      await client.query('COMMIT');
      guardada = true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    if (imagenAnterior && imagenAnterior !== registro.imagen_public_id) {
      await destruirEvidenciaAutenticada(imagenAnterior).catch(error => console.error('Error retirando imagen anterior:', error));
    }
    return res.json({ success: true, desviacion: presentar(registro) });
  } finally {
    if (subida && !guardada) await destruirEvidenciaAutenticada(subida.public_id);
  }
}, { mensajeGenerico: 'No se pudo guardar la desviación' });

export const imagenDesviacion = manejar(async (req, res) => {
  const [programaId, programacionId, otId] = ids(req);
  if (!await obtenerOrdenPorId(programaId, programacionId, otId)) throw noEncontrado('La orden no existe');
  const result = await pool.query('SELECT imagen_public_id FROM ordenes_trabajo_desviaciones WHERE orden_trabajo_id=$1 AND existe=true', [otId]);
  if (!result.rows[0]?.imagen_public_id) throw noEncontrado('La desviación no tiene fotografía');
  const respuesta = await fetch(urlFirmadaEvidencia(result.rows[0].imagen_public_id));
  if (!respuesta.ok) throw new ValidationError('No se pudo recuperar la fotografía', 502);
  const contenido = Buffer.from(await respuesta.arrayBuffer());
  res.setHeader('Content-Type', respuesta.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.send(contenido);
}, { mensajeGenerico: 'No se pudo consultar la fotografía' });
