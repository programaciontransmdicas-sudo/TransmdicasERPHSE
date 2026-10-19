import { pool } from '../config/database.js';

export const esAdministrador = req => ['admin', 'administrador'].includes(
  String(req.user?.rol || '').trim().toLowerCase()
);

export async function obtenerCatalogoClientesOperaciones() {
  const { rows } = await pool.query(`
    SELECT co.id, c.nombre AS cliente, co.nombre AS operacion
    FROM cliente_operaciones co
    JOIN clientes c ON c.id = co.cliente_id
    WHERE co.activo = TRUE AND c.activo = TRUE
    ORDER BY c.nombre, co.nombre
  `);
  return rows;
}

export async function resolverClienteOperacion(datos, obligatorio = false) {
  const enviado = ['cliente_operacion_id', 'cliente', 'operacion']
    .some(campo => Object.hasOwn(datos || {}, campo));
  if (!enviado && !obligatorio) return null;
  const id = Number(datos?.cliente_operacion_id);
  let result;
  if (Object.hasOwn(datos || {}, 'cliente_operacion_id')) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw Object.assign(new Error('Seleccione un cliente y una operación válidos'), { status: 400 });
    }
    result = await pool.query(`
      SELECT co.id, c.nombre AS cliente, co.nombre AS operacion
      FROM cliente_operaciones co JOIN clientes c ON c.id = co.cliente_id
      WHERE co.id = $1 AND co.activo = TRUE AND c.activo = TRUE
    `, [id]);
  } else {
    if (!datos?.cliente || !datos?.operacion) {
      throw Object.assign(new Error('Seleccione el cliente y la operación juntos'), { status: 400 });
    }
    result = await pool.query(`
      SELECT co.id, c.nombre AS cliente, co.nombre AS operacion
      FROM cliente_operaciones co JOIN clientes c ON c.id = co.cliente_id
      WHERE LOWER(c.nombre) = LOWER($1) AND LOWER(co.nombre) = LOWER($2)
        AND co.activo = TRUE AND c.activo = TRUE
    `, [datos.cliente.trim(), datos.operacion.trim()]);
  }
  const relacion = result.rows[0];
  if (!relacion) throw Object.assign(new Error('La combinación de cliente y operación no está disponible'), { status: 400 });
  if ((datos.cliente && datos.cliente.trim() !== relacion.cliente) ||
      (datos.operacion && datos.operacion.trim() !== relacion.operacion)) {
    throw Object.assign(new Error('El cliente y la operación no coinciden con la selección'), { status: 400 });
  }
  return { cliente_operacion_id: relacion.id, cliente: relacion.cliente, operacion: relacion.operacion };
}

export function restringirEdicionTI(req, permitidos) {
  if (String(req.user?.rol || '').toLowerCase() !== 'ti') return;
  const rechazados = Object.keys(req.body || {}).filter(campo => !permitidos.includes(campo));
  if (rechazados.length) throw Object.assign(
    new Error('TI solo puede editar el cliente y la operación. Utilice la acción de desactivar para registrar una baja.'),
    { status: 403 }
  );
}
