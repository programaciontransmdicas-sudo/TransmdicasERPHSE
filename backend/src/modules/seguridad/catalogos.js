import { pool } from '../../config/database.js';
import { obtenerClienteOperacionIds } from '../../middlewares/auth.js';
import { manejar } from './controller.js';
import { fallo } from './validaciones.js';

// Solo lectura: devuelve un máximo de diez coincidencias activas dentro del alcance
// del usuario. El texto del usuario siempre se envía como parámetro SQL.
export const buscarCatalogo = manejar(async (req, res) => {
  const tipo = req.params.tipo;
  const valor = req.query.q;
  if (!['personal', 'vehiculos'].includes(tipo) || typeof valor !== 'string') {
    throw fallo('Tipo de búsqueda o texto no válido.');
  }
  const texto = valor.trim();
  if (texto.length < 2) return res.json([]);
  if (texto.length > 80) throw fallo('La búsqueda admite hasta 80 caracteres.');
  const operaciones = obtenerClienteOperacionIds(req); // null = acceso total; [] = sin alcance.
  if (Array.isArray(operaciones) && !operaciones.length) return res.json([]);

  const consulta = tipo === 'personal' ? `
    SELECT p.id, p.nombre_completo, p.dni, p.cargo
    FROM public.personal p
    WHERE LOWER(BTRIM(p.estado)) = 'activo'
      AND ($2::integer[] IS NULL OR p.cliente_operacion_id = ANY($2::integer[]))
      AND (POSITION(lower($1) IN lower(COALESCE(p.nombre_completo, ''))) > 0
        OR POSITION($1 IN COALESCE(p.dni::text, '')) > 0)
    ORDER BY p.nombre_completo, p.id LIMIT 10` : `
    SELECT v.placa
    FROM public.vehiculos v
    WHERE v.activo = TRUE
      AND ($2::integer[] IS NULL OR v.cliente_operacion_id = ANY($2::integer[]))
      AND POSITION(regexp_replace(upper($1), '[[:space:]-]', '', 'g')
        IN regexp_replace(upper(v.placa), '[[:space:]-]', '', 'g')) > 0
    ORDER BY v.placa LIMIT 10`;
  if (tipo === 'vehiculos' && texto.replace(/[\s-]/g, '').length < 2) return res.json([]);
  const { rows } = await pool.query(consulta, [texto, operaciones]);
  res.json(rows);
});
