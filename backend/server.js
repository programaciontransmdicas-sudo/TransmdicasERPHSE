import 'dotenv/config';

import app from './src/app.js';

import {
  pool
} from './src/config/database.js'

import {
  initDb
} from './src/config/initDb.js'

const port =
  process.env.PORT || 8000;

const detenerArranque = async (
  error
) => {
  console.error(
    'Arranque detenido:',
    error.message
  );

  process.exitCode = 1;

  try {
    await pool.end();
  } catch (cierreError) {
    console.error(
      'Error cerrando la conexion:',
      cierreError.code ||
        'SIN_CODIGO'
    );
  }
};

const iniciarServidor = async () => {
  await initDb();

  const servidor = app.listen(
    port,
    () => {
      console.log(
        `Servidor backend corriendo en el puerto ${port}`
      );
    }
  );

  servidor.once(
    'error',
    detenerArranque
  );
};

iniciarServidor().catch(
  detenerArranque
);
