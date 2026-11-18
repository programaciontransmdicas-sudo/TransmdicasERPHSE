import { Router } from 'express';

const CATALOGO = 'entregas_tipo_equipo';
export function puedeConfigurarTipos(user) {
  return ['admin', 'administrador', 'ti'].includes(String(user?.rol || '').trim().toLowerCase());
}
export function normalizarTipo(valor) {
  if (typeof valor !== 'string') return null;
  const nombre = valor.trim().replace(/\s+/g, ' ').toUpperCase();
  return nombre.length >= 1 && nombre.length <= 100 && !/[\u0000-\u001f\u007f]/.test(nombre) ? nombre : null;
}
export function crearRutasTipos(pool, logger = console) {
  const router = Router();
  const permiso = (req, res, next) => puedeConfigurarTipos(req.user)
    ? next() : res.status(403).json({ error: 'Solo Admin y TI pueden gestionar los dispositivos.' });
  router.get('/', async (req, res) => {
    const todos = req.query.todos === '1';
    if (todos && !puedeConfigurarTipos(req.user)) return res.status(403).json({ error: 'No autorizado.' });
    try {
      const r = await pool.query('SELECT id, valor, activo FROM public.erp_catalogo_opciones WHERE catalogo=$1 AND ($2::boolean OR activo) ORDER BY valor, id', [CATALOGO, todos]);
      res.set('Cache-Control', 'private, no-store');
      return res.json({ tipos: r.rows });
    } catch (error) {
      logger.error('Error consultando catálogo de entregas:', error.code);
      return res.status(503).json({ error: 'No se pudo cargar el catálogo de dispositivos. Revise que la migración esté aplicada.' });
    }
  });
  router.post('/', permiso, async (req, res) => {
    const valor = normalizarTipo(req.body?.valor);
    if (!valor) return res.status(400).json({ error: 'Ingrese un nombre válido de hasta 100 caracteres.' });
    try {
      const r = await pool.query('INSERT INTO public.erp_catalogo_opciones (catalogo, valor) VALUES ($1,$2) RETURNING id, valor, activo', [CATALOGO, valor]);
      return res.status(201).json(r.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'El dispositivo ya existe. Si está inactivo, vuelva a activarlo.' });
      logger.error('Error creando dispositivo:', error.code);
      return res.status(500).json({ error: 'No se pudo agregar el dispositivo.' });
    }
  });
  router.patch('/:id', permiso, async (req, res) => {
    const id = String(req.params.id);
    if (!/^[1-9]\d{0,17}$/.test(id) || typeof req.body?.activo !== 'boolean') return res.status(400).json({ error: 'Datos inválidos.' });
    try {
      const r = await pool.query('UPDATE public.erp_catalogo_opciones SET activo=$1, actualizado_en=now() WHERE id=$2 AND catalogo=$3 RETURNING id, valor, activo', [req.body.activo, id, CATALOGO]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Dispositivo no encontrado.' });
      return res.json(r.rows[0]);
    } catch (error) {
      if (error.code === '23514') return res.status(409).json({ error: 'PULSERA debe permanecer activa para los reportes de pulseras.' });
      logger.error('Error actualizando dispositivo:', error.code);
      return res.status(500).json({ error: 'No se pudo actualizar el dispositivo.' });
    }
  });
  return router;
}
