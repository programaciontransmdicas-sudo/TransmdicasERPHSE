import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta configurar DATABASE_URL en backend/.env.'
  );
}

let erpDatabaseUrl;

try {
  erpDatabaseUrl = new URL(process.env.DATABASE_URL);

  if (
    !['postgres:', 'postgresql:'].includes(
      erpDatabaseUrl.protocol
    )
  ) {
    throw new Error();
  }
} catch {
  throw new Error(
    'DATABASE_URL no tiene un formato PostgreSQL válido.'
  );
}

// Neon requiere una conexión SSL segura.
erpDatabaseUrl.searchParams.set('sslmode', 'verify-full');

export const pool = new Pool({
  connectionString: erpDatabaseUrl.toString(),
  connectionTimeoutMillis: 10000
});
// Atiende errores de cada conexión, incluso mientras está en uso.
pool.on('connect', client => {
  client.on('error', error => {
    console.error(
      'Se interrumpió una conexión PostgreSQL:',
      error.message
    );
  });
});
pool.on('error', error => {
  console.error(
    'Error en una conexión PostgreSQL inactiva:',
    error.message
  );
});