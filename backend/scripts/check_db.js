import dotenv from 'dotenv';
import pkg from 'pg';
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const inv = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'entregas_ti'");
  console.table(inv.rows);
  pool.end();
}

run();

