require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Adding estado column...");
    await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT \'activo\';');
    console.log("Column estado added successfully.");
  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    pool.end();
  }
}

run();
