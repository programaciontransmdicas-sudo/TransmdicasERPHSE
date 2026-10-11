import { isIP } from 'node:net';
import { pool } from '../config/database.js';

const CAMPOS_SENSIBLES_AUDITORIA = new Set([
  'password',
  'password_hash',
  'token',
  'jwt',
  'jwt_secret',
  'authorization',
  'api_key',
  'api_secret',
  'secret'
]);

const limpiarValoresAuditoria = valor => {
  if (valor === null || valor === undefined) {
    return null;
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (Buffer.isBuffer(valor)) {
    return '[BUFFER OMITIDO]';
  }

  if (Array.isArray(valor)) {
    return valor.map(limpiarValoresAuditoria);
  }

  if (typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => {
        if (
          CAMPOS_SENSIBLES_AUDITORIA.has(
            clave.toLowerCase()
          )
        ) {
          return [clave, '[PROTEGIDO]'];
        }

        return [
          clave,
          limpiarValoresAuditoria(contenido)
        ];
      })
    );
  }

  return valor;
};

const obtenerIpCliente = req => {
  if (!req) {
    return null;
  }

  const ip =
    req.ip ||
    req.socket?.remoteAddress ||
    null;

  if (
    typeof ip !== 'string' ||
    !ip.trim()
  ) {
    return null;
  }

  const ipNormalizada = ip
    .trim()
    .replace(/^::ffff:/, '');

  return isIP(ipNormalizada)
    ? ipNormalizada
    : null;
};

// ==========================================
// REGISTRO DE AUDITORIA
// ==========================================
//
// Dos modos, UNA sola implementacion del INSERT. Lo unico que cambia es quien ejecuta la
// consulta, porque pool.query y client.query tienen la misma firma.
//
// LEGACY -sin opciones.client-. Es como ha funcionado siempre y no se toca: el INSERT va
// por el pool, en su propia conexion, y un fallo se registra en consola sin llegar al
// llamador. No es un descuido en este modo: medido, ninguna de las 32 llamadas actuales
// corre dentro de una transaccion, asi que cuando logAction se ejecuta el cambio de negocio
// YA ESTA CONFIRMADO. Relanzar convertiria en error HTTP una operacion que de hecho se
// aplico. Lo que si es una carencia es que el llamador no pueda enterarse; para eso esta
// propagarError, que se puede pedir explicitamente tambien en este modo.
//
// TRANSACCIONAL -con opciones.client-. El INSERT viaja por el MISMO client del flujo de
// negocio, asi que entra en su transaccion: si el llamador hace ROLLBACK, el audit_log se
// va con él, y si hace COMMIT, se confirman los dos juntos o ninguno.
//
// En este modo el error se RELANZA por defecto, y no por gusto: si el INSERT falla, la
// transaccion del llamador ya quedo ABORTADA por PostgreSQL. Tragarse el error devolveria el
// control a un llamador convencido de que todo va bien pero con la transaccion muerta: cada
// sentencia posterior fallaria con 25P02 en un sitio arbitrario y el COMMIT seria en
// realidad un ROLLBACK silencioso. Relanzar es la unica opcion honesta.
//
//   opciones.client        client de pg ya dentro de BEGIN. Por defecto: el pool.
//   opciones.propagarError fuerza o desactiva la propagacion. Por defecto: true si hay
//                          client, false si no.
//
// La firma mantiene los seis parametros posicionales y añade un septimo opcional, asi que
// las 32 llamadas existentes siguen siendo validas sin tocarlas y logAction.length no cambia.
export const logAction = async (
  userId,
  accion,
  tablaAfectada,
  req = null,
  valoresAnteriores = null,
  valoresActuales = null,
  opciones = {}
) => {
  const {
    client = null,
    propagarError = client !== null
  } = opciones;

  // pool y client exponen el mismo .query(texto, valores): el SQL y los parametros de abajo
  // son los mismos en los dos modos.
  const ejecutor = client ?? pool;

  try {
    const ipAddress = obtenerIpCliente(req);

    const anterioresLimpios =
      limpiarValoresAuditoria(valoresAnteriores);

    const actualesLimpios =
      limpiarValoresAuditoria(valoresActuales);

    await ejecutor.query(
      `INSERT INTO audit_logs (
        user_id,
        accion,
        tabla_afectada,
        fecha,
        ip_address,
        valores_anteriores,
        valores_actuales
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW(),
        $4::inet,
        $5::jsonb,
        $6::jsonb
      )`,
      [
        userId || null,
        accion,
        tablaAfectada,
        ipAddress,
        anterioresLimpios === null
          ? null
          : JSON.stringify(anterioresLimpios),
        actualesLimpios === null
          ? null
          : JSON.stringify(actualesLimpios)
      ]
    );
  } catch (error) {
    // Modo transaccional: la transaccion del llamador ya esta abortada. Se relanza para que
    // decida -lo normal, un ROLLBACK- en vez de dejarle una transaccion muerta en la mano.
    if (propagarError) {
      throw error;
    }

    console.error(
      'Error guardando la auditoría:',
      error
    );
  }
};
