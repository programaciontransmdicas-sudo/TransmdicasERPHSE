require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Migrating usuarios table...");
    // Add permisos column
    await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT \'{}\'::jsonb');
    console.log("Column permisos added successfully.");
    
    // Set default permissions for admin if not already set
    const adminPerms = {
      resumen: { ver: true, editar: true },
      maestros: { ver: true, editar: true },
      dashboard: { ver: true, editar: true },
      tickets: { ver: true, editar: true },
      entregas: { ver: true, editar: true },
      devoluciones: { ver: true, editar: true },
      mantenimiento: { ver: true, editar: true },
      reportes: { ver: true, editar: true },
      usuarios: { ver: true, editar: true }
    };
    
    // Update admin user (assuming there is an admin user with rol 'admin' or username 'admin')
    await pool.query('UPDATE usuarios SET permisos = $1 WHERE rol = $2', [adminPerms, 'admin']);
    console.log("Admin permissions updated.");
    
  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    pool.end();
  }
}

run();
