import { pool } from '../../config/database.js';

// ==========================================
// LEGACY
// ==========================================

export const obtenerEntregasLegacy =
  async () => {
    const result = await pool.query(
      'SELECT * FROM entregas_ti'
    );

    return result.rows;
  };

export const crearEntregaLegacy =
  async ({
    fecha_entrega,
    nombres,
    dni,
    cargo,
    operacion,
    condicion,
    marca,
    modelo,
    serie,
    precio,
    observaciones
  }) => {
    const result = await pool.query(
      `INSERT INTO entregas_ti (
         fecha_entrega,
         nombres,
         dni,
         cargo,
         operacion,
         condicion,
         marca,
         modelo,
         serie,
         precio,
         observaciones
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11
       )
       RETURNING *`,
      [
        fecha_entrega,
        nombres,
        dni,
        cargo,
        operacion,
        condicion,
        marca,
        modelo,
        serie,
        precio,
        observaciones
      ]
    );

    return result.rows[0];
  };

// ==========================================
// PERSONAL
// ==========================================

export const obtenerPersonalPorDni =
  async dni => {
    const result = await pool.query(
      `SELECT
         dni,
         nombre_completo,
         cargo,
         area
       FROM public.personal
       WHERE dni = $1`,
      [dni]
    );

    return result.rows[0] || null;
  };

export const obtenerClientesOperacionesEntregas =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         co.id,
         c.nombre AS cliente,
         co.nombre AS operacion
       FROM cliente_operaciones co
       INNER JOIN clientes c
         ON c.id = co.cliente_id
       WHERE co.activo = TRUE
         AND c.activo = TRUE
         AND (
           $1::boolean = TRUE
           OR co.id = ANY($2::integer[])
         )
       ORDER BY c.nombre, co.nombre`,
      [
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows;
  };

export const obtenerClienteOperacionEntrega =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         co.id,
         c.nombre AS cliente,
         co.nombre AS operacion
       FROM cliente_operaciones co
       INNER JOIN clientes c
         ON c.id = co.cliente_id
       WHERE co.id = $1
         AND co.activo = TRUE
         AND c.activo = TRUE
         AND (
           $2::boolean = TRUE
           OR co.id = ANY($3::integer[])
         )
       LIMIT 1`,
      [
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// INVENTARIO
// ==========================================

export const obtenerInventario =
  async ({
    puedeVerEntregas,
    puedeVerDevoluciones,
    accesoTotal,
    clienteOperacionIds
  }) => {
    let query =
      `SELECT
         e.*,
         c.nombre AS cliente
       FROM entregas_ti e
       LEFT JOIN cliente_operaciones co
         ON co.id = e.cliente_operacion_id
       LEFT JOIN clientes c
         ON c.id = co.cliente_id
       WHERE (
         $1::boolean = TRUE
         OR e.cliente_operacion_id =
            ANY($2::integer[])
       )`;

    const params = [
      Boolean(accesoTotal),
      clienteOperacionIds || []
    ];

    if (
      puedeVerEntregas &&
      !puedeVerDevoluciones
    ) {
      query += `
        AND (
          tipo_movimiento IS NULL
          OR TRIM(tipo_movimiento) = ''
          OR LOWER(TRIM(tipo_movimiento)) = 'entrega'
        )
      `;
    } else if (
      !puedeVerEntregas &&
      puedeVerDevoluciones
    ) {
      query += `
        AND LOWER(
          TRIM(tipo_movimiento)
        ) IN (
          'devolución',
          'devolucion'
        )
      `;
    }

    query += ' ORDER BY id DESC';

    const result =
      await pool.query(
        query,
        params
      );

    return result.rows;
  };

// ==========================================
// CREAR
// ==========================================

export const crearMovimiento =
  async ({
    fecha,
    encargado,
    nombre,
    dni,
    cargo,
    operacion,
    cliente_operacion_id,
    condicion,
    equipo_tipo,
    marca,
    modelo,
    serie,
    laptop,
    mouse,
    cargador,
    motivo,
    observaciones,
    precio,
    tipo_movimiento,
    documento_url
  }) => {
    const result = await pool.query(
      `INSERT INTO entregas_ti (
         fecha,
         encargado,
         nombre,
         dni,
         cargo,
         operacion,
         cliente_operacion_id,
         condicion,
         equipo_tipo,
         marca,
         modelo,
         serie,
         laptop,
         mouse,
         cargador,
         motivo,
         observaciones,
         precio,
         tipo_movimiento,
         documento_url
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20
       )
       RETURNING *`,
      [
        fecha,
        encargado,
        nombre,
        dni,
        cargo,
        operacion,
        cliente_operacion_id,
        condicion,
        equipo_tipo,
        marca,
        modelo,
        serie,
        laptop,
        mouse,
        cargador,
        motivo,
        observaciones,
        precio,
        tipo_movimiento,
        documento_url
      ]
    );

    return result.rows[0];
  };

// ==========================================
// CONSULTAS PARA ACTUALIZAR
// ==========================================

export const obtenerMovimientoPorId =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT *
       FROM entregas_ti
       WHERE id = $1
         AND (
           $2::boolean = TRUE
           OR cliente_operacion_id =
              ANY($3::integer[])
         )`,
      [
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

export const actualizarMovimiento =
  async ({
    id,
    fecha,
    encargado,
    nombre,
    dni,
    cargo,
    operacion,
    cliente_operacion_id,
    condicion,
    equipo_tipo,
    marca,
    modelo,
    serie,
    laptop,
    mouse,
    cargador,
    motivo,
    observaciones,
    precio,
    tipo_movimiento,
    documento_url,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `UPDATE entregas_ti
       SET
         fecha = $1,
         encargado = $2,
         nombre = $3,
         dni = $4,
         cargo = $5,
         operacion = $6,
         cliente_operacion_id = $7,
         condicion = $8,
         equipo_tipo = $9,
         marca = $10,
         modelo = $11,
         serie = $12,
         laptop = $13,
         mouse = $14,
         cargador = $15,
         motivo = $16,
         observaciones = $17,
         precio = $18,
         tipo_movimiento = $19,
         documento_url =
           COALESCE(
             $20,
             documento_url
           )
       WHERE id = $21
         AND (
           $22::boolean = TRUE
           OR cliente_operacion_id =
              ANY($23::integer[])
         )
       RETURNING *`,
      [
        fecha,
        encargado,
        nombre,
        dni,
        cargo,
        operacion,
        cliente_operacion_id,
        condicion,
        equipo_tipo,
        marca,
        modelo,
        serie,
        laptop,
        mouse,
        cargador,
        motivo,
        observaciones,
        precio,
        tipo_movimiento,
        documento_url,
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// ELIMINAR
// ==========================================

export const eliminarMovimiento =
  async id => {
    const result = await pool.query(
      `DELETE FROM entregas_ti
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows[0] || null;
  };
  // ==========================================
// EXPORTAR EXCEL
// ==========================================

export const obtenerMovimientosParaExportar =
  async ({
    tipo,
    categoria,
    fechaInicio,
    fechaFin,
    accesoTotal,
    clienteOperacionIds
  }) => {
    let query = `
      SELECT *
      FROM entregas_ti
      WHERE (
        $1::boolean = TRUE
        OR cliente_operacion_id =
           ANY($2::integer[])
      )
    `;

    const params = [
      Boolean(accesoTotal),
      clienteOperacionIds || []
    ];

    if (
      tipo === 'Devolución'
    ) {
      params.push(
        'Devolución'
      );

      query += `
        AND tipo_movimiento =
            $${params.length}
      `;
    } else if (
      tipo === 'Entrega'
    ) {
      params.push(
        'Entrega'
      );

      query += `
        AND (
          tipo_movimiento =
            $${params.length}
          OR tipo_movimiento IS NULL
          OR tipo_movimiento = ''
        )
      `;
    }

    if (categoria) {
      params.push(
        `%${categoria}%`
      );

      query += `
        AND equipo_tipo
            ILIKE
            $${params.length}
      `;
    }

    params.push(
      fechaInicio,
      fechaFin
    );

    query += `
      AND NULLIF(
        BTRIM(fecha::text),
        ''
      )::date
      BETWEEN
        $${params.length - 1}::date
      AND
        $${params.length}::date
    `;

    query +=
      ' ORDER BY id ASC';

    const result =
      await pool.query(
        query,
        params
      );

    return result.rows;
  };
