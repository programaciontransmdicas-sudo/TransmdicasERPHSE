import { pool } from '../../config/database.js';
import { logAction } from '../../services/auditService.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../../services/cloudinaryService.js';
import { crearMovimiento } from '../entregas/repository.js';
import { contextoTicket } from './service.js';

const fallo = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

export function idReportePulsera(valor) {
  if (!/^[1-9]\d*$/.test(String(valor ?? '')) || !Number.isSafeInteger(Number(valor))) {
    throw fallo('El identificador del reporte de pulsera no es válido');
  }
  return Number(valor);
}

async function exigirGestion(req) {
  const contexto = await contextoTicket(req, 'gestionar');
  if (!['admin', 'ti'].includes(contexto.rol)) throw fallo('Solo TI o el administrador pueden cerrar reportes de pulseras', 403);
  return contexto;
}

async function transaccion(trabajo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await trabajo(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* conservar el error original */ }
    throw error;
  } finally { client.release(); }
}

async function bloquearReporte(client, id) {
  const result = await client.query(`
    SELECT pu.*, p.dni AS receptor_dni, p.nombre_completo AS receptor_nombre,
           p.cargo AS receptor_cargo, p.estado AS receptor_estado
    FROM pulseras pu JOIN personal p ON p.id = pu.receptor_persona_id
    WHERE pu.id = $1 FOR UPDATE OF pu`, [id]);
  const reporte = result.rows[0];
  if (!reporte) throw fallo('El reporte de pulsera no existe', 404);
  if (reporte.estado === 'Resuelto') throw fallo('El reporte ya está resuelto. Actualiza la lista.', 409);
  return reporte;
}

export async function registrarEntregaCambioPulsera({ req, reporteId, datos }) {
  const contexto = await exigirGestion(req);
  const id = idReportePulsera(reporteId);
  if (datos.tipo_movimiento !== 'Entrega' || String(datos.equipo_tipo || '').trim().toUpperCase() !== 'PULSERA') {
    throw fallo('El cambio requiere registrar una entrega de pulsera');
  }
  const fecha = String(datos.fecha || '');
  const fechaReal = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null;
  if (!fechaReal || !Number.isFinite(fechaReal.getTime()) || fechaReal.toISOString().slice(0, 10) !== fecha) {
    throw fallo('Ingrese una fecha de entrega válida');
  }

  return transaccion(async client => {
    const reporte = await bloquearReporte(client, id);
    if (String(reporte.receptor_estado || '').trim().toLowerCase() !== 'activo') {
      throw fallo('La persona receptora está inactiva. Revisa su registro antes de entregar la pulsera.', 409);
    }
    if (String(datos.dni || '').trim() !== String(reporte.receptor_dni || '').trim()
      || Number(datos.cliente_operacion_id) !== Number(reporte.cliente_operacion_id)) {
      throw fallo('El receptor o la operación no coinciden con el reporte de pulsera', 409);
    }
    const entrega = await crearMovimiento({ ...datos,
      dni: reporte.receptor_dni, nombre: reporte.receptor_nombre, cargo: reporte.receptor_cargo,
      encargado: contexto.nombreSolicitante || req.user.username,
      equipo_tipo: 'PULSERA', tipo_movimiento: 'Entrega',
      motivo: `Cambio de pulsera por reporte #${id}`
    }, client);
    if (!entrega?.id) throw new Error('No se pudo registrar la entrega de pulsera');
    const result = await client.query(`UPDATE pulseras SET estado = 'Resuelto', aplica_cambio = TRUE,
      entrega_ti_id = $2, cerrada_por = $3, fecha_cierre = CURRENT_TIMESTAMP,
      motivo_sin_cambio = NULL, evidencia_cierre_url = NULL
      WHERE id = $1 RETURNING *`, [id, entrega.id, req.user.id]);
    await logAction(req.user.id, 'Creó entrega TI por cambio de pulsera', 'entregas_ti', req, null, entrega, { client });
    await logAction(req.user.id, `Cerró reporte de pulsera #${id} con entrega #${entrega.id}`, 'pulseras', req, reporte, result.rows[0], { client });
    return { ...entrega, reporte_pulsera_id: id, reporte_pulsera: result.rows[0] };
  });
}

export async function cerrarPulseraSinCambio(req) {
  await exigirGestion(req);
  const id = idReportePulsera(req.params.id);
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
  if (!motivo || motivo.length > 4000) throw fallo('Explique el motivo del cierre sin cambio (máximo 4000 caracteres)');
  const archivo = req.file;
  if (!Buffer.isBuffer(archivo?.buffer) || !archivo.buffer.length || !String(archivo.mimetype || '').startsWith('image/')) {
    throw fallo('Adjunte una fotografía de evidencia para cerrar sin cambio');
  }
  if (archivo.buffer.length > 5 * 1024 * 1024) throw fallo('La fotografía debe pesar como máximo 5 MB');

  const evidenciaUrl = await uploadToCloudinary(archivo.buffer, 'pulseras/evidencias_cierre', 'image');
  try {
    return await transaccion(async client => {
      const anterior = await bloquearReporte(client, id);
      const result = await client.query(`UPDATE pulseras SET estado = 'Resuelto', aplica_cambio = FALSE,
        motivo_sin_cambio = $2, evidencia_cierre_url = $3, entrega_ti_id = NULL,
        cerrada_por = $4, fecha_cierre = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, motivo, evidenciaUrl, req.user.id]);
      await logAction(req.user.id, `Cerró reporte de pulsera #${id} sin cambio`, 'pulseras', req, anterior, result.rows[0], { client });
      return result.rows[0];
    });
  } catch (error) {
    await deleteFromCloudinary(evidenciaUrl).catch(() => {});
    throw error;
  }
}
