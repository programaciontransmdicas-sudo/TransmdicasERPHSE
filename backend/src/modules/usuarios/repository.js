import { pool } from '../../config/database.js';

// ==========================================
// CATÁLOGO ANTIGUO DE OPERACIONES
// Se mantiene temporalmente por compatibilidad.
// ==========================================

export const obtenerOperaciones = async () => {
  const result = await pool.query(
    `SELECT MIN(BTRIM(operacion)) AS operacion
     FROM vehiculos
     WHERE operacion IS NOT NULL
       AND LOWER(BTRIM(operacion)) NOT IN (
         '',
         'test',
         'text',
         'null',
         'undefined',
         'sin operacion',
         'sin operación',
         'falta identificar'
       )
     GROUP BY LOWER(BTRIM(operacion))
     ORDER BY operacion ASC`
  );

  return result.rows.map(
    row => row.operacion
  );
};

// ==========================================
// NUEVO CATÁLOGO CLIENTE - OPERACIONES
// No devuelve operaciones internas.
// ==========================================

export const obtenerClientesConOperaciones =
  async () => {
    const result = await pool.query(
      `SELECT
         c.id,
         c.nombre,
         c.es_interno,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', co.id,
               'nombre', co.nombre
             )
             ORDER BY co.nombre
           ) FILTER (
             WHERE co.id IS NOT NULL
           ),
           '[]'::jsonb
         ) AS operaciones
       FROM clientes c
       LEFT JOIN cliente_operaciones co
         ON co.cliente_id = c.id
        AND co.activo = TRUE
       WHERE c.activo = TRUE
         AND c.es_interno = FALSE
       GROUP BY
         c.id,
         c.nombre,
         c.es_interno
       ORDER BY c.nombre`
    );

    return result.rows;
  };

// ==========================================
// PERSONAL ADMINISTRATIVO
// ==========================================

export const obtenerPersonalAdministrativo =
  async () => {
    const result = await pool.query(
      `SELECT
         id,
         dni,
         nombre_completo
       FROM personal
       WHERE LOWER(
         BTRIM(COALESCE(modalidad, ''))
       ) = 'administrativo'
         AND LOWER(
           BTRIM(COALESCE(estado, ''))
         ) = 'activo'
       ORDER BY nombre_completo`
    );

    return result.rows;
  };

export const obtenerPersonalAdministrativoPorDni =
  async dni => {
    const result = await pool.query(
      `SELECT
         id,
         dni,
         nombre_completo
       FROM personal
       WHERE BTRIM(dni) = $1
         AND LOWER(
           BTRIM(COALESCE(modalidad, ''))
         ) = 'administrativo'
         AND LOWER(
           BTRIM(COALESCE(estado, ''))
         ) = 'activo'
       LIMIT 1`,
      [dni]
    );

    return result.rows[0] || null;
  };

// ==========================================
// BÚSQUEDAS Y VALIDACIONES
// ==========================================

export const obtenerUsuarioPorPersonaId =
  async personaId => {
    const result = await pool.query(
      `SELECT
         id,
         username
       FROM usuarios
       WHERE persona_id = $1
       LIMIT 1`,
      [personaId]
    );

    return result.rows[0] || null;
  };

export const obtenerUsuarioPorUsername =
  async username => {
    const result = await pool.query(
      `SELECT
         id,
         username
       FROM usuarios
       WHERE LOWER(BTRIM(username)) =
             LOWER(BTRIM($1))
       LIMIT 1`,
      [username]
    );

    return result.rows[0] || null;
  };

// ==========================================
// LISTADO DE USUARIOS CON ASIGNACIONES
// ==========================================

export const obtenerUsuarios = async () => {
  const result = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.rol,
       u.estado,
       u.permisos,
       u.operacion,
       u.persona_id,
       u.created_at,
       p.dni,
       p.nombre_completo,
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'cliente_operacion_id',
                 co.id,
               'cliente_id',
                 c.id,
               'cliente',
                 c.nombre,
               'operacion',
                 co.nombre
             )
             ORDER BY
               c.nombre,
               co.nombre
           )
           FROM supervisor_asignaciones sa
           INNER JOIN cliente_operaciones co
             ON co.id =
                sa.cliente_operacion_id
           INNER JOIN clientes c
             ON c.id =
                co.cliente_id
           WHERE sa.usuario_id = u.id
         ),
         '[]'::jsonb
       ) AS asignaciones
     FROM usuarios u
     LEFT JOIN personal p
       ON p.id = u.persona_id
     ORDER BY u.id DESC`
  );

  return result.rows;
};

// ==========================================
// CONSULTA INDIVIDUAL
// ==========================================

const obtenerUsuarioPorIdConConexion =
  async (id, conexion) => {
    const result = await conexion.query(
      `SELECT
         u.id,
         u.username,
         u.rol,
         u.estado,
         u.operacion,
         u.permisos,
         u.persona_id,
         p.dni,
         p.nombre_completo,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'cliente_operacion_id',
                   co.id,
                 'cliente_id',
                   c.id,
                 'cliente',
                   c.nombre,
                 'operacion',
                   co.nombre
               )
               ORDER BY
                 c.nombre,
                 co.nombre
             )
             FROM supervisor_asignaciones sa
             INNER JOIN cliente_operaciones co
               ON co.id =
                  sa.cliente_operacion_id
             INNER JOIN clientes c
               ON c.id =
                  co.cliente_id
             WHERE sa.usuario_id = u.id
           ),
           '[]'::jsonb
         ) AS asignaciones
       FROM usuarios u
       LEFT JOIN personal p
         ON p.id = u.persona_id
       WHERE u.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  };

export const obtenerUsuarioPorId =
  async id =>
    obtenerUsuarioPorIdConConexion(
      id,
      pool
    );

// ==========================================
// CREACIÓN DE USUARIO
// ==========================================

export const crearUsuario =
  async (
    {
      personaId,
      username,
      passwordHash,
      rol,
      permisos,
      estado,
      operacion
    },
    conexion = pool
  ) => {
    const result = await conexion.query(
      `INSERT INTO usuarios (
         username,
         password_hash,
         rol,
         permisos,
         estado,
         operacion,
         persona_id
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7
       )
       RETURNING
         id,
         username,
         rol,
         estado,
         operacion,
         permisos,
         persona_id`,
      [
        username,
        passwordHash,
        rol,
        permisos,
        estado,
        operacion,
        personaId
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// REEMPLAZAR ASIGNACIONES
// ==========================================

export const reemplazarAsignacionesSupervisor =
  async (
    usuarioId,
    clienteOperacionIds,
    conexion = pool
  ) => {
    await conexion.query(
      `DELETE FROM supervisor_asignaciones
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (
      !Array.isArray(clienteOperacionIds) ||
      clienteOperacionIds.length === 0
    ) {
      return [];
    }

    const idsUnicos = [
      ...new Set(
        clienteOperacionIds.map(Number)
      )
    ];

    const result = await conexion.query(
      `INSERT INTO supervisor_asignaciones (
         usuario_id,
         cliente_operacion_id
       )
       SELECT
         $1,
         asignacion_id
       FROM unnest($2::integer[])
         AS asignacion_id
       ON CONFLICT DO NOTHING
       RETURNING
         usuario_id,
         cliente_operacion_id`,
      [
        usuarioId,
        idsUnicos
      ]
    );

    return result.rows;
  };

// ==========================================
// CREACIÓN TRANSACCIONAL
// ==========================================

export const crearUsuarioConAsignaciones =
  async ({
    personaId,
    username,
    passwordHash,
    rol,
    permisos,
    estado,
    clienteOperacionIds
  }) => {
    const conexion =
      await pool.connect();

    try {
      await conexion.query('BEGIN');

      const usuarioCreado =
        await crearUsuario(
          {
            personaId,
            username,
            passwordHash,
            rol,
            permisos,
            estado,

            // Ya no será la fuente de permisos.
            operacion: null
          },
          conexion
        );

      if (rol === 'supervisor') {
        await reemplazarAsignacionesSupervisor(
          usuarioCreado.id,
          clienteOperacionIds,
          conexion
        );
      }

      const usuarioCompleto =
        await obtenerUsuarioPorIdConConexion(
          usuarioCreado.id,
          conexion
        );

      await conexion.query('COMMIT');

      return usuarioCompleto;
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  };

// ==========================================
// CAMBIO DE ESTADO
// ==========================================

export const actualizarEstadoUsuario =
  async (id, estado) => {
    const result = await pool.query(
      `UPDATE usuarios
       SET estado = $1
       WHERE id = $2
       RETURNING
         id,
         username,
         rol,
         estado,
         operacion,
         permisos`,
      [
        estado,
        id
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// ACTUALIZACIÓN DE USUARIO
// ==========================================

export const actualizarUsuarioPorId =
  async (
    {
      id,
      passwordHash,
      rol,
      permisos,
      estado,
      operacion
    },
    conexion = pool
  ) => {
    const result = await conexion.query(
      `UPDATE usuarios
       SET
         password_hash = COALESCE(
           $2::text,
           password_hash
         ),
         rol = $3,
         permisos = $4,
         estado = $5,
         operacion = $6
       WHERE id = $1
       RETURNING
         id,
         username,
         rol,
         estado,
         operacion,
         permisos,
         persona_id`,
      [
        id,
        passwordHash,
        rol,
        permisos,
        estado,
        operacion
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// ACTUALIZACIÓN TRANSACCIONAL
// ==========================================

export const actualizarUsuarioConAsignaciones =
  async ({
    id,
    passwordHash,
    rol,
    permisos,
    estado,
    clienteOperacionIds
  }) => {
    const conexion =
      await pool.connect();

    try {
      await conexion.query('BEGIN');

      const usuarioActualizado =
        await actualizarUsuarioPorId(
          {
            id,
            passwordHash,
            rol,
            permisos,
            estado,
            operacion: null
          },
          conexion
        );

      if (!usuarioActualizado) {
        await conexion.query('ROLLBACK');
        return null;
      }

      await reemplazarAsignacionesSupervisor(
        id,
        rol === 'supervisor'
          ? clienteOperacionIds
          : [],
        conexion
      );

      const usuarioCompleto =
        await obtenerUsuarioPorIdConConexion(
          id,
          conexion
        );

      await conexion.query('COMMIT');

      return usuarioCompleto;
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  };
  export const contarClienteOperacionesAsignables =
  async clienteOperacionIds => {
    if (
      !Array.isArray(clienteOperacionIds) ||
      clienteOperacionIds.length === 0
    ) {
      return 0;
    }

    const result = await pool.query(
      `SELECT COUNT(*)::integer AS cantidad
       FROM cliente_operaciones co
       INNER JOIN clientes c
         ON c.id = co.cliente_id
       WHERE co.id = ANY($1::integer[])
         AND co.activo = TRUE
         AND c.activo = TRUE
         AND c.es_interno = FALSE`,
      [clienteOperacionIds]
    );

    return result.rows[0]?.cantidad || 0;
  };