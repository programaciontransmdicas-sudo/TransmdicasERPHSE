import { pool } from '../../../../config/database.js';
import { logAction } from '../../../../services/auditService.js';
import { manejar, normalizarId, noEncontrado, ValidationError, esUsuarioTi, esUsuarioAdmin } from '../../comun.js';
import { obtenerOrdenPorId, obtenerOrdenParaEscritura } from './repository.js';

export const prepararActividadChecklist = datos => {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)
      || Object.keys(datos).some(k => !['estado', 'observacion'].includes(k))) {
    throw new ValidationError('Los datos de la actividad no son válidos');
  }
  if (!['PENDIENTE', 'REALIZADO', 'NO_APLICA'].includes(datos.estado)) {
    throw new ValidationError('El estado de la actividad no es válido');
  }
  if (datos.observacion !== null && typeof datos.observacion !== 'string') {
    throw new ValidationError('Envíe la observación o un valor vacío');
  }
  const observacion = datos.observacion?.trim() || null;
  if (observacion && observacion.length > 4000) throw new ValidationError('La observación admite hasta 4000 caracteres');
  return { estado: datos.estado, observacion };
};
const autorizar = usuario => {
  if (!usuario?.id) throw new ValidationError('Se requiere una sesión válida', 401);
  if (!esUsuarioTi(usuario) && !esUsuarioAdmin(usuario)) {
    throw new ValidationError('Solo TI y administradores pueden consultar o actualizar este checklist', 403);
  }
};
const ids = req => [
  normalizarId('programaId', req.params.programaId),
  normalizarId('programacionId', req.params.programacionId),
  normalizarId('otId', req.params.otId)
];

export const listarChecklistOrden = manejar(async (req, res) => {
  autorizar(req.user);
  const [programaId, programacionId, otId] = ids(req);
  const orden = await obtenerOrdenPorId(programaId, programacionId, otId);
  if (!orden) throw noEncontrado('La orden no existe en esta programación');
  const result = await pool.query(`
    SELECT d.id AS detalle_id, e.tipo_equipo, e.nivel_mantenimiento AS nivel_programado,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'descripcion', a.descripcion_snapshot,
        'nivel_origen', a.nivel_origen_snapshot, 'orden', a.orden_snapshot,
        'estado', a.estado, 'observacion', a.observacion,
        'actualizado_en', a.actualizado_en, 'exigible_al_cierre', a.exigible_al_cierre
      ) ORDER BY a.nivel_origen_snapshot,a.orden_snapshot,a.id)
      FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb) AS actividades
    FROM ordenes_trabajo_detalle d
    JOIN programacion_mantenimiento_equipos e ON e.id=d.programacion_equipo_id
    LEFT JOIN ordenes_trabajo_detalle_actividades a ON a.orden_trabajo_detalle_id=d.id
    WHERE d.orden_trabajo_id=$1
  AND e.tipo_equipo IN (
    'CAMARAS',
    'COPILOTO',
    'RADIO_BASE',
    'GPS'
  )
    GROUP BY d.id,e.tipo_equipo,e.nivel_mantenimiento ORDER BY d.id`, [otId]);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ orden_trabajo_id: otId, editable: orden.estado === 'ABIERTA', apartados: result.rows });
}, { mensajeGenerico: 'No se pudo consultar el checklist' });

export const editarActividadChecklist = manejar(async (req, res) => {
  autorizar(req.user);
  const [programaId, programacionId, otId] = ids(req);
  const actividadId = normalizarId('actividadId', req.params.actividadId);
  const datos = prepararActividadChecklist(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orden = await obtenerOrdenParaEscritura(programaId, programacionId, otId, client);
    if (!orden) throw noEncontrado('La orden no existe en esta programación');
    if (orden.estado !== 'ABIERTA') throw new ValidationError('El checklist de una orden cerrada o anulada es de solo lectura', 409);
    const previo = await client.query(`SELECT a.* FROM ordenes_trabajo_detalle_actividades a
      JOIN ordenes_trabajo_detalle d ON d.id=a.orden_trabajo_detalle_id
      WHERE a.id=$1 AND d.orden_trabajo_id=$2 FOR UPDATE OF a`, [actividadId, otId]);
    if (!previo.rows[0]) throw noEncontrado('La actividad no pertenece a esta orden');
    const actualizado = await client.query(`UPDATE ordenes_trabajo_detalle_actividades
      SET estado=$2, observacion=$3, actualizado_por_id=$4
      WHERE id=$1 RETURNING *`, [actividadId, datos.estado, datos.observacion, req.user.id]);
    await logAction(req.user.id, `Actualizó la actividad ${actividadId} del checklist de la OT ${otId}`,
      'ordenes_trabajo_detalle_actividades', req, previo.rows[0], actualizado.rows[0],
      { client, propagarError: true });
    await client.query('COMMIT');
    const a = actualizado.rows[0];
    return res.json({ success: true, actividad: { id: a.id, estado: a.estado, observacion: a.observacion, actualizado_en: a.actualizado_en } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}, { mensajeGenerico: 'No se pudo actualizar la actividad' });

export const validarChecklistAlCerrar = async (otId, client) => {
  const resultado = await client.query(`SELECT a.id,a.descripcion_snapshot AS descripcion,
    a.estado,e.tipo_equipo,d.id AS detalle_id
    FROM ordenes_trabajo_detalle_actividades a
    JOIN ordenes_trabajo_detalle d ON d.id=a.orden_trabajo_detalle_id
    JOIN programacion_mantenimiento_equipos e ON e.id=d.programacion_equipo_id
    WHERE d.orden_trabajo_id=$1 AND a.exigible_al_cierre
      AND a.estado IN ('PENDIENTE','NO_APLICA')
      AND NULLIF(BTRIM(a.observacion),'') IS NULL
    ORDER BY d.id,a.nivel_origen_snapshot,a.orden_snapshot,a.id`, [otId]);
  if (resultado.rows.length) {
    const error = new ValidationError('Añade un motivo a las actividades pendientes o no aplicables antes de cerrar', 409, 'CHECKLIST_INCOMPLETO');
    error.incumplimientos = resultado.rows.map(a => ({ ...a, falta: 'CHECKLIST' }));
    throw error;
  }
};
