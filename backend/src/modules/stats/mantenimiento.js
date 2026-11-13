import { pool } from '../../config/database.js';
import { tieneAccesoTotalFlota, obtenerClienteOperacionIds } from '../../middlewares/auth.js';
import { obtenerSoporteStats, obtenerInventarioAgrupado, obtenerTotalInventario } from './repository.js';
import { obtenerTrabajosTI } from '../publico/repository.js';
import { finQuincena } from '../programas/programacion/excel/service.js';

const PENDIENTES = new Set(['PROYECTADO', 'PROGRAMADO', 'REPROGRAMADO']);
const ymd = fecha => fecha.toISOString().slice(0, 10);

// Se compara el final de la quincena efectiva con la fecha de negocio de Perú.
// Una quincena sin programación futura no demuestra que la unidad esté al día.
export function estadoMantenimiento(visitas, hoy) {
  const fechas = visitas.filter(v => PENDIENTES.has(v.estado) && v.quincena_efectiva)
    .map(v => finQuincena(v.quincena_efectiva)).sort();
  if (!fechas.length) return { estado: 'SIN INFORMACIÓN', plazo: null };
  const plazo = fechas[0];
  const hasta = new Date(`${hoy}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 7);
  if (plazo < hoy) return { estado: 'VENCIDA', plazo };
  if (plazo <= ymd(hasta)) return { estado: 'POR VENCER', plazo };
  return { estado: 'AL DÍA', plazo };
}

// Todos los datos se leen en una misma instantánea. No se escriben visitas ni OT.
export async function leerIndicadoresMantenimiento(alcance, conexion = pool) {
  const client = await conexion.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const params = [Boolean(alcance.accesoTotal), alcance.clienteOperacionIds || [], alcance.placa || null];
    const fecha = await client.query("SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS hoy");
    const unidades = await client.query(`
      SELECT v.placa, v.cliente, v.operacion,
        COALESCE(jsonb_agg(jsonb_build_object('estado', p.estado,
          'quincena_efectiva', p.quincena_efectiva::text)) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS visitas
      FROM vehiculos v
      LEFT JOIN programa_mantenimiento_unidades u ON u.placa = v.placa AND u.habilitado
      LEFT JOIN programas_mantenimiento pm ON pm.id = u.programa_id AND pm.codigo = 'TI-PR-01' AND pm.estado = 'ACTIVO'
      LEFT JOIN programacion_mantenimiento p ON p.programa_unidad_id = u.id AND p.programa_id = pm.id AND p.estado <> 'CANCELADO'
      WHERE ($1::boolean OR v.cliente_operacion_id = ANY($2::integer[])) AND ($3::text IS NULL OR v.placa = $3)
      GROUP BY v.placa, v.cliente, v.operacion ORDER BY v.placa`, params);
    const ordenes = await client.query(`
      SELECT o.id, p.id AS programacion_id, u.placa, p.fecha_ejecucion::text AS fecha, p.quincena_efectiva::text AS quincena_efectiva, p.estado AS resultado,
        (o.fecha_cierre AT TIME ZONE 'America/Lima')::date::text AS fecha_cierre,
        to_char(o.fecha_cierre AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora,
        COALESCE(jsonb_agg(jsonb_build_object('tipo', e.tipo_equipo, 'estado', d.estado)
          ORDER BY e.tipo_equipo) FILTER (WHERE d.id IS NOT NULL), '[]'::jsonb) AS equipos
      FROM ordenes_trabajo o
      JOIN programacion_mantenimiento p ON p.id = o.programacion_id
      JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
      JOIN programas_mantenimiento pm ON pm.id = p.programa_id AND pm.codigo = 'TI-PR-01'
      JOIN vehiculos v ON v.placa = u.placa
      LEFT JOIN ordenes_trabajo_detalle d ON d.orden_trabajo_id = o.id
      LEFT JOIN programacion_mantenimiento_equipos e ON e.id = d.programacion_equipo_id
      WHERE o.estado = 'CERRADA' AND ($1::boolean OR v.cliente_operacion_id = ANY($2::integer[])) AND ($3::text IS NULL OR v.placa = $3)
      GROUP BY o.id, p.id, u.placa, p.fecha_ejecucion, p.estado
      ORDER BY p.fecha_ejecucion DESC NULLS LAST, o.id DESC`, params);
    await client.query('COMMIT');
    const hoy = fecha.rows[0].hoy;
    const resumen = unidades.rows.map(({ visitas, ...unidad }) => ({ ...unidad, ...estadoMantenimiento(visitas, hoy), visitas_periodo: visitas }));
    return { fecha_negocio: hoy, unidades: resumen, ordenes: ordenes.rows };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* conserva el error */ }
    throw error;
  } finally { client.release(); }
}

export async function indicadoresMantenimiento(req, res) {
  try {
    const alcance = { accesoTotal: tieneAccesoTotalFlota(req), clienteOperacionIds: obtenerClienteOperacionIds(req) || [] };
    const [datos, soporte, trabajos] = await Promise.all([
      leerIndicadoresMantenimiento(alcance), obtenerSoporteStats(alcance), obtenerTrabajosTI(alcance)
    ]);
    let inventario;
    try { inventario = (await obtenerInventarioAgrupado(alcance)).map(x => ({name:x.tipo_movimiento,value:Number(x.cantidad)})); }
    catch { inventario = [{name:'Entregas Registradas',value:await obtenerTotalInventario(alcance)}]; }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ...datos, soporte:soporte.map(x => ({name:x.estado,value:Number(x.cantidad)})), inventario,
      trabajosTI:trabajos.map(x => ({id:x.id,placa:x.placa,tipo:x.tipo_solicitud})) });
  } catch (error) {
    console.error('Error consultando indicadores de mantenimiento:', error.message);
    return res.status(500).json({ error: 'No se pudieron consultar los indicadores de mantenimiento.' });
  }
}
