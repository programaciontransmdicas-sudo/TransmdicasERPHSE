import { pool } from '../../../../config/database.js';
import { obtenerProgramaPorId, obtenerVersionAplicable } from '../../repository.js';
import { noEncontrado, ValidationError } from '../../comun.js';

// Una fotografía consistente del programa. Solo SELECT, sin paginación ni consultas
// por placa. Un cierre o una reprogramación concurrente no puede mezclar dos versiones.
export async function leerProgramaExcel(programaId, conexion = pool) {
  const client = await conexion.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { programa } = await obtenerProgramaPorId(programaId, client);
    if (!programa) throw noEncontrado('Programa de mantenimiento no encontrado');
    const { version, fecha_negocio } = await obtenerVersionAplicable(programaId, client);
    if (!version?.periodo_inicio || !version?.periodo_fin) {
      throw new ValidationError('El programa no tiene una versión aplicable con período definido.', 409);
    }
    const { rows: unidades } = await client.query(`
      SELECT u.id, u.placa, u.quincena_incorporacion::text AS quincena_incorporacion,
        u.observaciones, v.tipo_vehiculo, v.marca_tracto, v.modelo_tracto,
        v.anio_fabricacion, COALESCE(co.nombre, v.operacion) AS operacion,
        COALESCE(c.nombre, v.cliente) AS cliente
      FROM programa_mantenimiento_unidades u
      JOIN vehiculos v ON v.placa = u.placa
      LEFT JOIN cliente_operaciones co ON co.id = v.cliente_operacion_id
      LEFT JOIN clientes c ON c.id = co.cliente_id
      WHERE u.programa_id = $1 ORDER BY u.placa, u.id
    `, [programaId]);
    const { rows: visitas } = await client.query(`
      SELECT p.id, p.programa_unidad_id, p.estado,
        p.quincena_programada::text AS quincena_programada,
        p.quincena_reprogramada::text AS quincena_reprogramada,
        p.quincena_efectiva::text AS quincena_efectiva,
        p.fecha_ejecucion::text AS fecha_ejecucion, p.observaciones,
        COALESCE(e.items, '[]'::jsonb) AS equipos,
        COALESCE(o.items, '[]'::jsonb) AS resultados,
        COALESCE(a.items, '[]'::jsonb) AS ajustes
      FROM programacion_mantenimiento p
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', e.id, 'tipo_equipo', e.tipo_equipo,
          'nivel_mantenimiento', e.nivel_mantenimiento) ORDER BY e.id) AS items
        FROM programacion_mantenimiento_equipos e WHERE e.programacion_id = p.id
      ) e ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('equipo_id', d.programacion_equipo_id,
          'estado', d.estado, 'nivel_completado', d.nivel_completado,
          'ot_id', o.id) ORDER BY o.id, d.id) AS items
        FROM ordenes_trabajo o JOIN ordenes_trabajo_detalle d ON d.orden_trabajo_id = o.id
        WHERE o.programacion_id = p.id AND o.estado = 'CERRADA'
      ) o ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo,
          'origen', a.quincena_anterior::text, 'destino', a.quincena_destino::text,
          'motivo', a.motivo) ORDER BY a.id) AS items
        FROM programacion_mantenimiento_ajustes a WHERE a.programacion_id = p.id
      ) a ON true
      WHERE p.programa_id = $1 ORDER BY p.quincena_efectiva, p.id
    `, [programaId]);
    const { rows: ciclos } = await client.query(`
      SELECT programa_unidad_id, tipo_equipo, nivel_mantenimiento,
        ultima_quincena::text AS ultima_quincena,
        ultima_fecha_real::text AS ultima_fecha_real
      FROM programa_mantenimiento_unidad_ciclos WHERE programa_id = $1
    `, [programaId]);
    await client.query('COMMIT');
    return { programa, version, fecha_negocio, unidades, visitas, ciclos };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
