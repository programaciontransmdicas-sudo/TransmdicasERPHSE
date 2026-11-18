// Lecturas del esquema de TransReport. Los maestros del ERP no se duplican.
const ORIGEN = `
  SELECT id, 'vehiculos'::text AS tipo, base, creado_en, actualizado_en,
    estado, placa AS referencia, conductor AS persona, dni AS documento,
    COALESCE(datos, '{}'::jsonb) AS datos
  FROM transreport.controles_vehiculos
  UNION ALL
  SELECT id, tipo, base, creado_en, actualizado_en,
    datos->>'estado' AS estado,
    COALESCE(NULLIF(datos->>'placa', ''), NULLIF(datos->>'numero', ''), datos->>'tipo', '') AS referencia,
    COALESCE(datos->>'nombre', '') AS persona,
    COALESCE(datos->>'dni', datos->>'identificacion', '') AS documento,
    datos
  FROM transreport.registros
`;

const PERIODO = `
  ($1::text IS NULL OR base = $1)
  AND ($2::date IS NULL OR creado_en >= ($2::date::timestamp AT TIME ZONE 'America/Lima'))
  AND ($3::date IS NULL OR creado_en < (($3::date + 1)::timestamp AT TIME ZONE 'America/Lima'))
`;

export function crearRepositorio(pool) {
  return {
    async resumen(filtros) {
      const { rows } = await pool.query(`
        WITH origen AS (${ORIGEN})
        SELECT tipo, count(*)::integer AS total,
          count(*) FILTER (WHERE
            (tipo = 'vehiculos' AND estado = 'En base') OR
            (tipo IN ('personal', 'terceros') AND estado = 'En instalaciones') OR
            (tipo = 'llaves' AND estado = 'Fuera de garita')
          )::integer AS pendientes,
          count(*) FILTER (WHERE tipo = 'rondas' AND datos->>'presentaAnomalias' = 'Sí')::integer AS anomalias
        FROM origen WHERE ${PERIODO}
        GROUP BY tipo
      `, [filtros.base, filtros.desde, filtros.hasta]);
      return rows;
    },

    async listar(tipo, filtros, { exportar = false } = {}) {
      const { rows } = await pool.query(`
        WITH origen AS (${ORIGEN}), filtrados AS (
          SELECT * FROM origen WHERE ${PERIODO} AND tipo = $4
          AND ($5::text = '' OR
            strpos(translate(lower(concat_ws(' ', referencia, persona, documento, estado)),
              'áéíóúüñ', 'aeiouun'), translate(lower($5), 'áéíóúüñ', 'aeiouun')) > 0
            OR (regexp_replace($5, '[[:space:]-]', '', 'g') <> '' AND
              strpos(regexp_replace(lower(referencia), '[[:space:]-]', '', 'g'),
                regexp_replace(lower($5), '[[:space:]-]', '', 'g')) > 0))
        ), seleccion AS (
          SELECT * FROM filtrados WHERE ($6::text = '' OR estado = $6)
        ), pagina AS (
          SELECT id, tipo, base, creado_en, actualizado_en, estado, referencia, persona, documento
          FROM seleccion ORDER BY creado_en DESC, id DESC LIMIT $7 OFFSET $8
        )
        SELECT (SELECT count(*)::integer FROM seleccion) AS total,
          COALESCE((SELECT jsonb_agg(p ORDER BY p.creado_en DESC, p.id DESC) FROM pagina p), '[]'::jsonb) AS registros,
          COALESCE((SELECT jsonb_agg(e.estado ORDER BY e.estado) FROM
            (SELECT DISTINCT estado FROM filtrados WHERE estado IS NOT NULL AND estado <> '') e), '[]'::jsonb) AS estados
      `, [filtros.base, filtros.desde, filtros.hasta, tipo, filtros.busqueda, filtros.estado,
        exportar ? 5001 : filtros.limite, exportar ? 0 : (filtros.pagina - 1) * filtros.limite]);
      return rows[0];
    },

    async detalles(tipo, ids) {
      if (!ids.length) return [];
      if (tipo !== 'vehiculos') {
        return (await pool.query(`SELECT id, tipo, base, creado_en, actualizado_en, revision, datos
          FROM transreport.registros WHERE tipo = $1 AND id = ANY($2::uuid[])`, [tipo, ids])).rows;
      }
      const controles = (await pool.query(`SELECT *, 'vehiculos'::text AS tipo
        FROM transreport.controles_vehiculos WHERE id = ANY($1::uuid[])`, [ids])).rows;
      const movimientos = (await pool.query(`SELECT * FROM transreport.movimientos_vehiculos
        WHERE control_id = ANY($1::uuid[]) ORDER BY fecha, id`, [ids])).rows;
      const porControl = new Map();
      for (const m of movimientos) {
        if (!porControl.has(m.control_id)) porControl.set(m.control_id, []);
        porControl.get(m.control_id).push(m);
      }
      return controles.map(row => ({ ...row, datos: {
        placa: row.placa, carreta: row.carreta, conductor: row.conductor,
        dni: row.dni, operacion: row.operacion, estado: row.estado,
        ingresoRegistrado: row.ingreso_registrado,
        ...(row.datos || {}),
        movimientos: porControl.get(row.id) || [],
      } }));
    },

    async archivos(tipo, id, base) {
      return (await pool.query(`SELECT a.id, a.nombre, a.recurso, a.formato, a.mime, a.bytes,
          f.vista, m.tipo AS etapa, m.fecha AS fecha_movimiento
        FROM transreport.archivos a
        LEFT JOIN transreport.fotos_vehiculos f ON f.id = a.id
        LEFT JOIN transreport.movimientos_vehiculos m ON m.id = f.movimiento_id
        WHERE a.tipo = $1 AND a.registro_id = $2 AND a.base = $3
        ORDER BY a.creado_en, a.id`, [tipo, id, base])).rows;
    },

    async archivo(tipo, id, archivoId) {
      // El archivo debe pertenecer al registro solicitado y a la base de ese registro.
      return (await pool.query(`WITH origen AS (${ORIGEN})
        SELECT a.* FROM transreport.archivos a
        JOIN origen r ON r.id = a.registro_id AND r.tipo = a.tipo AND r.base = a.base
        WHERE a.tipo = $1 AND a.registro_id = $2 AND a.id = $3`, [tipo, id, archivoId])).rows[0];
    },
  };
}
