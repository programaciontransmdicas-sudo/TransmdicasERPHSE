import { pool } from '../../../../config/database.js';
import { manejar, normalizarId, noEncontrado, ValidationError, esUsuarioAdmin } from '../../comun.js';
import { obtenerOrdenPorId } from './repository.js';

const fechaValida = valor => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

export const filtrosAuditoria = (query = {}) => {
  const entero = (nombre, defecto, maximo) => {
    const valor = query[nombre] ?? String(defecto);
    if (typeof valor !== 'string' || !/^(0|[1-9]\d*)$/.test(valor)) throw new ValidationError(`${nombre} no es válido`);
    const numero = Number(valor);
    if (!Number.isSafeInteger(numero) || numero > maximo || (nombre === 'limite' && !numero)) throw new ValidationError(`${nombre} no es válido`);
    return numero;
  };
  const texto = query.busqueda ?? '';
  if (typeof texto !== 'string' || texto.length > 120) throw new ValidationError('La búsqueda admite hasta 120 caracteres');
  const desde = query.desde || null, hasta = query.hasta || null;
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && desde > hasta)) {
    throw new ValidationError('El rango de fechas no es válido');
  }
  return { busqueda: texto.trim(), desde, hasta, limite: entero('limite', 25, 100), desplazamiento: entero('desplazamiento', 0, 1000000) };
};

// Se vinculan registros mediante IDs estructurados, nunca mediante texto de la acción.
// No se publican IP, snapshots JSON, identificadores ni enlaces de Cloudinary.
export const SQL_AUDITORIA_ORDEN = `
WITH detalles AS (
  SELECT id::text FROM ordenes_trabajo_detalle WHERE orden_trabajo_id = $1
), relacionadas AS (
  SELECT a.id, a.user_id, a.accion, a.tabla_afectada,
    CASE WHEN pg_typeof(a.fecha)::text = 'timestamp without time zone'
      THEN a.fecha::timestamp AT TIME ZONE current_setting('TimeZone')
      ELSE a.fecha::timestamptz END AS fecha,
    u.username, p.nombre_completo AS nombre
  FROM audit_logs a
  LEFT JOIN usuarios u ON u.id = a.user_id
  LEFT JOIN personal p ON p.id = u.persona_id
  WHERE (
    (a.tabla_afectada = 'ordenes_trabajo' AND (
      a.valores_anteriores->>'id' = $1::text OR a.valores_actuales->>'id' = $1::text OR
      a.valores_anteriores->'orden'->>'id' = $1::text OR a.valores_actuales->'orden'->>'id' = $1::text
    )) OR
    (a.tabla_afectada = 'ordenes_trabajo_detalle' AND (
      a.valores_anteriores->>'orden_trabajo_id' = $1::text OR a.valores_actuales->>'orden_trabajo_id' = $1::text OR
      a.valores_anteriores->>'id' IN (SELECT id FROM detalles) OR a.valores_actuales->>'id' IN (SELECT id FROM detalles)
    )) OR
    (a.tabla_afectada = 'ordenes_trabajo_detalle_actividades' AND (
      a.valores_anteriores->>'orden_trabajo_detalle_id' IN (SELECT id FROM detalles) OR
      a.valores_actuales->>'orden_trabajo_detalle_id' IN (SELECT id FROM detalles)
    )) OR
    (a.tabla_afectada = 'ordenes_trabajo_evidencias' AND (
      a.valores_anteriores->>'detalle_id' IN (SELECT id FROM detalles) OR a.valores_actuales->>'detalle_id' IN (SELECT id FROM detalles)
    )) OR
    (a.tabla_afectada = 'programacion_mantenimiento' AND (
      a.valores_anteriores->>'id' = $2::text OR a.valores_actuales->>'id' = $2::text
    ))
  )
), filtradas AS (
  SELECT * FROM relacionadas
  WHERE ($3::text = '' OR accion ILIKE '%' || $3 || '%' OR username ILIKE '%' || $3 || '%' OR nombre ILIKE '%' || $3 || '%')
    AND ($4::date IS NULL OR (fecha AT TIME ZONE 'America/Lima')::date >= $4)
    AND ($5::date IS NULL OR (fecha AT TIME ZONE 'America/Lima')::date <= $5)
), pagina AS (
  SELECT id, user_id, username, nombre, accion, tabla_afectada, fecha
  FROM filtradas ORDER BY fecha DESC NULLS LAST, id DESC LIMIT $6 OFFSET $7
)
SELECT (SELECT count(*)::int FROM filtradas) AS total,
  COALESCE((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY fecha DESC NULLS LAST, id DESC) FROM pagina), '[]'::jsonb) AS movimientos
`;

export const listarAuditoriaOrden = manejar(async (req, res) => {
  if (!req.user?.id) throw new ValidationError('Se requiere una sesión válida', 401);
  if (!esUsuarioAdmin(req.user)) {
    throw new ValidationError('Solo un administrador puede consultar la auditoría', 403);
  }
  const programaId = normalizarId('programaId', req.params.programaId);
  const programacionId = normalizarId('programacionId', req.params.programacionId);
  const otId = normalizarId('otId', req.params.otId);
  const filtros = filtrosAuditoria(req.query);
  const orden = await obtenerOrdenPorId(programaId, programacionId, otId);
  if (!orden) throw noEncontrado('La orden de trabajo no existe en esta programación');
  const resultado = await pool.query(SQL_AUDITORIA_ORDEN, [otId, programacionId, filtros.busqueda, filtros.desde, filtros.hasta, filtros.limite, filtros.desplazamiento]);
  return res.json({ orden_trabajo_id: otId, programacion_id: programacionId, ...resultado.rows[0], filtros });
}, { mensajeGenerico: 'No se pudieron consultar los movimientos de la orden' });
