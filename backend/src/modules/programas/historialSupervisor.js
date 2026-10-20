import { pool } from '../../config/database.js';
import { normalizarFiltros } from './programacion/service.js';

// El historial de todas las unidades se lee en la misma instantánea.
// No se publican usuarios, auditoría, enlaces de fotografías ni acciones de edición.
export const SQL_HISTORIAL_SUPERVISOR = `
  WITH accesibles AS (
    SELECT p.id, p.programa_id, p.programa_unidad_id, p.estado,
           p.quincena_programada::text, p.quincena_reprogramada::text,
           p.quincena_efectiva::text, p.fecha_ejecucion::text,
           u.placa, COALESCE(c.nombre, v.cliente) AS cliente,
           COALESCE(co.nombre, v.operacion) AS operacion,
           GREATEST(p.updated_at, p.created_at,
             (SELECT MAX(GREATEST(o.fecha_cierre, o.fecha_apertura, o.updated_at))
              FROM ordenes_trabajo o WHERE o.programacion_id = p.id)) AS sello
    FROM programacion_mantenimiento p
    INNER JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
    INNER JOIN vehiculos v ON v.placa = u.placa
    LEFT JOIN cliente_operaciones co ON co.id = v.cliente_operacion_id
    LEFT JOIN clientes c ON c.id = co.cliente_id
    WHERE (p.estado = 'CANCELADO' OR EXISTS (
        SELECT 1 FROM ordenes_trabajo o WHERE o.programacion_id = p.id
      ))
      AND ($1::date IS NULL OR COALESCE(p.quincena_efectiva, p.quincena_programada) >= $1::date)
      AND ($2::date IS NULL OR COALESCE(p.quincena_efectiva, p.quincena_programada) <= $2::date)
  ), pagina AS (
    SELECT * FROM accesibles ORDER BY sello DESC NULLS LAST, id DESC
    LIMIT $3::integer OFFSET $4::integer
  )
  SELECT (SELECT COUNT(*)::integer FROM accesibles) AS total,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'programa_id', p.programa_id,
      'programa_unidad_id', p.programa_unidad_id, 'estado', p.estado,
      'quincena_programada', p.quincena_programada,
      'quincena_reprogramada', p.quincena_reprogramada,
      'quincena_efectiva', p.quincena_efectiva, 'fecha_ejecucion', p.fecha_ejecucion,
      'unidad', jsonb_build_object('id', p.programa_unidad_id, 'placa', p.placa,
                                  'cliente', p.cliente, 'operacion', p.operacion),
      'equipos', jsonb_build_object('items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', e.id, 'tipo_equipo', e.tipo_equipo,
                           'nivel_mantenimiento', e.nivel_mantenimiento) ORDER BY e.id)
        FROM programacion_mantenimiento_equipos e WHERE e.programacion_id = p.id
      ), '[]'::jsonb)),
      'ordenes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id, 'programacion_id', o.programacion_id, 'estado', o.estado,
          'fecha_apertura', o.fecha_apertura, 'fecha_cierre', o.fecha_cierre,
          'updated_at', o.updated_at, 'minutos', o.minutos,
          'motivo_anulacion', o.motivo_anulacion, 'observaciones', o.observaciones,
          'detalles', jsonb_build_object('items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', d.id, 'tipo_equipo', e.tipo_equipo,
              'nivel_programado', e.nivel_mantenimiento,
              'estado', d.estado, 'nivel_completado', d.nivel_completado
            ) ORDER BY d.id)
            FROM ordenes_trabajo_detalle d
            INNER JOIN programacion_mantenimiento_equipos e
              ON e.id = d.programacion_equipo_id AND e.programacion_id = p.id
            WHERE d.orden_trabajo_id = o.id AND d.programacion_id = p.id
          ), '[]'::jsonb))
        ) ORDER BY o.fecha_apertura DESC, o.id DESC)
        FROM ordenes_trabajo o WHERE o.programacion_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY p.sello DESC NULLS LAST, p.id DESC), '[]'::jsonb) AS visitas
  FROM pagina p
`;

export const validarConsultaHistorial = (usuario, query = {}) => {
  if (String(usuario?.rol || '').trim().toLowerCase() !== 'supervisor') {
    throw Object.assign(new Error('Este historial corresponde al rol supervisor'), { status: 403 });
  }
  const usuarioId = Number(usuario.id);
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw Object.assign(new Error('La sesión del supervisor no es válida'), { status: 403 });
  }
  const permitidos = new Set(['desde', 'hasta', 'limite', 'desplazamiento']);
  if (Object.keys(query).some(clave => !permitidos.has(clave))) {
    throw Object.assign(new Error('Los filtros enviados no son válidos'), { status: 400 });
  }
  const filtros = normalizarFiltros(query);
  if (!Number.isSafeInteger(filtros.desplazamiento) || filtros.desplazamiento > 2147483647) {
    throw Object.assign(new Error('El desplazamiento no es válido'), { status: 400 });
  }
  if (filtros.limite < 1) {
    throw Object.assign(new Error('El límite debe ser mayor que cero'), { status: 400 });
  }
  return { usuarioId, filtros };
};

export const listarHistorialSupervisor = async (req, res) => {
  try {
    const { filtros } = validarConsultaHistorial(req.user, req.query);
    const resultado = await pool.query(SQL_HISTORIAL_SUPERVISOR, [
      filtros.desde, filtros.hasta,
      filtros.limite, filtros.desplazamiento
    ]);
    const { total = 0, visitas: filas = [] } = resultado.rows[0] || {};
    const ordenes = filas.flatMap(fila => fila.ordenes);
    const visitas = filas.map(({ ordenes: propias, ...visita }) => ({
      ...visita, ordenes_trabajo: { total: propias.length }
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ total, visitas, ordenes, filtros });
  } catch (error) {
    if ([400, 403].includes(error.status)) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error obteniendo historial de mantenimiento del supervisor:', error.message);
    return res.status(500).json({ error: 'No se pudo cargar el historial de mantenimientos' });
  }
};
