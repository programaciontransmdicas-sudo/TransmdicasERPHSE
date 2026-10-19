export async function cargarEstado(client, programaId, visitaId, bloquear = false) {
  const inicial = await client.query(`SELECT programa_unidad_id FROM programacion_mantenimiento WHERE id = $1 AND programa_id = $2`, [visitaId, programaId]);
  if (!inicial.rows.length) return null;
  const unidadId = inicial.rows[0].programa_unidad_id;
  const unidad = await client.query(`SELECT id, placa FROM programa_mantenimiento_unidades WHERE id = $1 AND programa_id = $2 ${bloquear ? 'FOR UPDATE' : ''}`, [unidadId, programaId]);
  if (!unidad.rows.length) return null;
  const {
    rows: visitas
  } = await client.query(`
    SELECT p.*, p.quincena_programada::text AS quincena_programada,
      p.quincena_reprogramada::text AS quincena_reprogramada,
      p.quincena_efectiva::text AS quincena_efectiva,
      (SELECT count(*)::int FROM ordenes_trabajo o WHERE o.programacion_id = p.id) AS ot_total
    FROM programacion_mantenimiento p WHERE p.programa_unidad_id = $1
    ORDER BY p.id ${bloquear ? 'FOR UPDATE OF p' : ''}
  `, [unidadId]);
  const ids = visitas.map(v => v.id);
  const {
    rows: equipos
  } = await client.query(`SELECT * FROM programacion_mantenimiento_equipos WHERE programacion_id = ANY($1::int[]) ORDER BY id ${bloquear ? 'FOR UPDATE' : ''}`, [ids]);
  for (const v of visitas) v.equipos = equipos.filter(e => e.programacion_id === v.id);
  const {
    rows: referencias
  } = await client.query(`
    SELECT f.tipo_equipo, f.nivel_mantenimiento,
      COALESCE(c.ultima_quincena, a.quincena_ancla)::text AS quincena
    FROM programa_mantenimiento_frecuencias f
    LEFT JOIN programa_mantenimiento_unidad_ciclos c ON c.programa_unidad_id = $2
      AND c.tipo_equipo = f.tipo_equipo AND c.nivel_mantenimiento = f.nivel_mantenimiento
    LEFT JOIN programa_mantenimiento_unidad_anclas a ON a.programa_unidad_id = $2
      AND a.tipo_equipo = f.tipo_equipo AND a.nivel_mantenimiento = f.nivel_mantenimiento
    WHERE f.programa_id = $1
  `, [programaId, unidadId]);
  const {
    rows: frecuencias
  } = await client.query('SELECT tipo_equipo, nivel_mantenimiento, frecuencia_quincenas FROM programa_mantenimiento_frecuencias WHERE programa_id = $1', [programaId]);
  const {
    rows: versiones
  } = await client.query(`SELECT id, version, estado, vigencia_desde::text AS vigencia_desde, vigencia_hasta::text AS vigencia_hasta FROM programas_mantenimiento_versiones WHERE programa_id = $1`, [programaId]);
  const {
    rows: fecha
  } = await client.query(`SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS fecha_negocio`);
  return {
    programaId,
    unidadId,
    placa: unidad.rows[0].placa,
    visitas,
    referencias,
    frecuencias,
    versiones,
    fechaNegocio: fecha[0].fecha_negocio
  };
}
