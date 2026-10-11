import pg from 'pg';

const connectionString = process.env.ERP_NEON_URL;
if (!connectionString) throw new Error('Falta configurar ERP_NEON_URL en esta terminal.');
const erpDbUrl = new URL(connectionString);
erpDbUrl.searchParams.set('sslmode', 'verify-full');

const pool = new pg.Pool({
  connectionString: erpDbUrl.toString()
});

const relaciones = [
  ['inspecciones_flota', 'placa', 'vehiculos', 'placa'],
  ['mantenimientos_tecnicos', 'placa', 'vehiculos', 'placa'],
  ['incidentes_soporte', 'placa', 'vehiculos', 'placa'],
  ['entregas_ti', 'dni', 'personal', 'dni'],
  ['audit_logs', 'user_id', 'usuarios', 'id']
];

async function run() {
  let client;
  let descartar = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");

    const resultados = [];

    for (const [tabla, columna, padre, clave] of relaciones) {
      const { rows } = await client.query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE t.${columna} IS NULL) AS nulos,
          COUNT(*) FILTER (WHERE BTRIM(t.${columna}::text) = '') AS vacios,
          COUNT(*) FILTER (
            WHERE BTRIM(t.${columna}::text) <> ''
              AND NOT EXISTS (
                SELECT 1 FROM public.${padre} p WHERE p.${clave} = t.${columna}
              )
          ) AS sin_correspondencia
        FROM public.${tabla} t
      `);

      resultados.push({
        relacion: `${tabla}.${columna} -> ${padre}.${clave}`,
        ...rows[0]
      });
    }

    await client.query('COMMIT');
    console.table(resultados);
    console.log('Revision de lectura terminada. No se modificaron registros ni se crearon claves foraneas.');
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { descartar = true; }
    }
    throw error;
  } finally {
    if (client) client.release(descartar);
    await pool.end();
  }
}

run().catch(error => {
  console.error('No se completo la revision. Codigo:', error.code || 'SIN_CODIGO');
  process.exitCode = 1;
});