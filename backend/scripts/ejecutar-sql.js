import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { pool } from '../src/config/database.js';

const archivo = process.argv[2];

if (!archivo) {
  console.error(
    'Indica un archivo SQL: node scripts/ejecutar-sql.js ruta/archivo.sql'
  );

  process.exitCode = 1;
  await pool.end();
} else {
  try {
    const ruta = resolve(archivo);
    const sql = await readFile(ruta, 'utf8');

    const resultado = await pool.query(sql);

    const resultados = Array.isArray(resultado)
      ? resultado
      : [resultado];

    for (const item of resultados) {
      console.log(
        `${item.command}: ${item.rowCount ?? 0} registro(s)`
      );

      if (item.rows?.length) {
        console.table(item.rows);
      }
    }

    console.log('Archivo SQL ejecutado correctamente.');
  } catch (error) {
    console.error('Error ejecutando SQL:', error.message);

    if (error.code) {
      console.error('Código:', error.code);
    }

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}