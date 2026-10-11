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

pool.on('error', error => {
  console.error(
    'Error inesperado en la conexión PostgreSQL:',
    error
  );
});