import { pool } from '../../config/database.js';
import { incorporarNuevaUnidad } from './altaProgramaRepository.js';

export async function buscarUnidadConAcceso(placaClave, accesoTotal, clienteOperacionIds, cliente = pool, bloquear = false) {
  const { rows } = await cliente.query(`
    SELECT v.* FROM vehiculos v
    WHERE regexp_replace(upper(btrim(v.placa)), '[-[:space:]]', '', 'g') = $1
      AND ($2::boolean OR v.cliente_operacion_id = ANY($3::integer[]))
    ${bloquear ? 'FOR UPDATE' : ''}
  `, [placaClave, Boolean(accesoTotal), clienteOperacionIds || []]);
  if (rows.length > 1) {
    throw Object.assign(new Error('La placa tiene registros duplicados. Solicite su revisión al administrador.'), { status: 409 });
  }
  return rows[0] || null;
}

export async function leerEquipos(placa, cliente = pool) {
  const { rows } = await cliente.query(`
    SELECT id, placa, tipo_equipo, estado_inventario, marca, modelo,
      numero_serie, fecha_instalacion::text AS fecha_instalacion, observaciones
    FROM vehiculo_equipos WHERE placa = $1 ORDER BY tipo_equipo
  `, [placa]);
  return rows;
}

export async function leerFamiliasConfirmadas(placa) {
  const { rows } = await pool.query(`
    SELECT DISTINCT unnest(familias_confirmadas) AS familia
    FROM programa_mantenimiento_unidades WHERE placa = $1 AND habilitado
    ORDER BY familia
  `, [placa]);
  return rows.map(r => r.familia);
}

async function escribirEquipos(cliente, placa, equipos) {
  for (const e of equipos) {
    await cliente.query(`
      INSERT INTO vehiculo_equipos(placa, tipo_equipo, estado_inventario,
        marca, modelo, numero_serie, fecha_instalacion, observaciones, fuente)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ERP')
      ON CONFLICT(placa, tipo_equipo) DO UPDATE SET
        estado_inventario=EXCLUDED.estado_inventario, marca=EXCLUDED.marca,
        modelo=EXCLUDED.modelo, numero_serie=EXCLUDED.numero_serie,
        fecha_instalacion=EXCLUDED.fecha_instalacion,
        observaciones=EXCLUDED.observaciones, fuente='ERP'
    `, [placa, e.tipo_equipo, e.estado_inventario, e.marca, e.modelo,
      e.numero_serie, e.fecha_instalacion, e.observaciones]);
  }
}

export async function crearVehiculoConEquipos(datos, equipos) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`alta_vehiculo:${datos.placa}`]);
    const existente = await buscarUnidadConAcceso(datos.placa, true, [], cliente);
    if (existente) throw Object.assign(new Error('La placa ya existe'), { status: 409 });
    const { rows } = await cliente.query(`
      INSERT INTO vehiculos(placa, operacion, tipo_vehiculo, cliente,
        marca_tracto, modelo_tracto, anio_fabricacion, cliente_operacion_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [datos.placa, datos.operacion, datos.tipo_vehiculo || null, datos.cliente,
      datos.marca_tracto || null, datos.modelo_tracto || null,
      datos.anio_fabricacion || null, datos.cliente_operacion_id]);
    await escribirEquipos(cliente, rows[0].placa, equipos);
    const inventario = await leerEquipos(rows[0].placa, cliente);
    const mantenimiento = await incorporarNuevaUnidad(cliente, rows[0].placa, inventario);
    await cliente.query('COMMIT');
    return { ...rows[0], equipos: inventario, mantenimiento };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

export async function guardarInventarioVehiculo(placaClave, equipos) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const vehiculo = await buscarUnidadConAcceso(placaClave, true, [], cliente, true);
    if (!vehiculo) throw Object.assign(new Error('Vehículo no encontrado'), { status: 404 });
    const anteriores = await leerEquipos(vehiculo.placa, cliente);
    await escribirEquipos(cliente, vehiculo.placa, equipos);
    const actuales = await leerEquipos(vehiculo.placa, cliente);
    await cliente.query('COMMIT');
    return { placa: vehiculo.placa, anteriores, actuales };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}
