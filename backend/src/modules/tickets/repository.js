import { pool } from '../../config/database.js';


// ==========================================
// CONTEXTO DEL USUARIO
// ==========================================

export const obtenerUsuarioTicket =
  async userId => {
    const result = await pool.query(
      `SELECT
         u.rol,
         u.estado,
         u.operacion,
         u.persona_id,
         COALESCE(
           p.nombre_completo,
           u.username
         ) AS nombre_solicitante
       FROM usuarios u
       LEFT JOIN personal p
         ON p.id = u.persona_id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  };
// ==========================================
// OPCIONES DE TICKETS
// ==========================================

export const obtenerVehiculosTickets =
  async ({
    accesoTotal,
    clienteOperacionIds,
    operacionesInvalidas
  }) => {
    const result = await pool.query(
      `SELECT
         v.placa,
         BTRIM(v.cliente) AS cliente,
         BTRIM(v.operacion) AS operacion,
         v.cliente_operacion_id
       FROM vehiculos v
       WHERE LOWER(
         BTRIM(
           COALESCE(v.operacion, '')
         )
       ) <> ALL($3::text[])
         AND (
           $1::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($2::integer[])
         )
       ORDER BY
         v.cliente,
         v.operacion,
         v.placa`,
      [
        Boolean(accesoTotal),
        clienteOperacionIds || [],
        operacionesInvalidas
      ]
    );

    return result.rows;
  };

export const obtenerVehiculoTicketPorPlaca =
  async ({
    placa,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         v.placa,
         v.cliente,
         v.operacion,
         v.cliente_operacion_id
       FROM vehiculos v
       WHERE UPPER(BTRIM(v.placa)) =
             UPPER(BTRIM($1))
         AND (
           $2::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($3::integer[])
         )
       LIMIT 1`,
      [
        placa,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

export const obtenerPersonalTickets =
  async () => {
    const result = await pool.query(
      `SELECT
         id,
         dni,
         nombre_completo,
         operacion
       FROM personal
       WHERE estado = 'Activo'
       ORDER BY nombre_completo ASC`
    );

    return result.rows;
  };

// ==========================================
// VALIDACIONES
// ==========================================

export const obtenerPersonaActivaPorId =
  async personaId => {
    const result = await pool.query(
      `SELECT
         id,
         dni,
         nombre_completo,
         operacion
       FROM personal
       WHERE id = $1
         AND estado = 'Activo'
       LIMIT 1`,
      [personaId]
    );

    return result.rows[0] || null;
  };

// ==========================================
// CREACIÓN
// ==========================================

export const insertarTicket =
  async ({
    placa,
    personaId,
    tipoSolicitud,
    descripcion,
    implemento,
    evidencias,
    fechaLlegadaUnidad,
    horaLlegadaUnidad,
    creadoPor
  }) => {
    const result = await pool.query(
      `INSERT INTO tickets_unidades (
         placa,
         persona_id,
         tipo_solicitud,
         descripcion,
         implemento,
         evidencias,
         fecha_llegada_unidad,
         hora_llegada_unidad,
         creado_por
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6::jsonb,
         $7,
         $8,
         $9
       )
       RETURNING *`,
      [
        placa,
        personaId,
        tipoSolicitud,
        descripcion,
        implemento,
        JSON.stringify(
          evidencias || []
        ),
        fechaLlegadaUnidad,
        horaLlegadaUnidad,
        creadoPor
      ]
    );

    return result.rows[0] || null;
  };
// ==========================================
// CREACIÓN DE PULSERAS
// ==========================================

export const insertarPulsera =
  async ({
    solicitantePersonaId,
    receptorPersonaId,
    operacion,
    clienteOperacionId,
    motivoRenovacion,
    evidenciaUrl,
    creadoPor,
    fechaLlegadaPersonal,
    horaLlegadaPersonal
  }) => {
    const result = await pool.query(
      `INSERT INTO pulseras (
         solicitante_persona_id,
         receptor_persona_id,
         operacion,
         cliente_operacion_id,
         motivo_renovacion,
         evidencia_url,
         creado_por,
         fecha_llegada_personal,
        hora_llegada_personal
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9
       )
       RETURNING *`,
      [
        solicitantePersonaId,
        receptorPersonaId,
        operacion,
        clienteOperacionId,
        motivoRenovacion,
        evidenciaUrl,
        creadoPor,
        fechaLlegadaPersonal,
        horaLlegadaPersonal
      ]
    );

    return result.rows[0] || null;
  };
// =========================================
//  REPORTES DE PULSERAS
// =========================================
// ==========================================
// REPORTES DE PULSERAS
// ==========================================

export const obtenerReportesPulseras =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         pu.id,
         pu.operacion,
         pu.cliente_operacion_id,
         pu.motivo_renovacion,
         pu.evidencia_url,
         pu.estado,
         pu.fecha_creacion,
         pu.fecha_cierre,
         pu.fecha_llegada_personal,
         pu.hora_llegada_personal,

         solicitante.nombre_completo
           AS nombre_solicitante,

         receptor.nombre_completo
           AS nombre_receptor,

         COALESCE(
           creador.nombre_completo,
           u.username
         ) AS nombre_creado_por

       FROM pulseras pu

       INNER JOIN personal solicitante
         ON solicitante.id =
            pu.solicitante_persona_id

       INNER JOIN personal receptor
         ON receptor.id =
            pu.receptor_persona_id

       LEFT JOIN usuarios u
         ON u.id = pu.creado_por

       LEFT JOIN personal creador
         ON creador.id = u.persona_id

       WHERE
         $1::boolean = TRUE
         OR pu.cliente_operacion_id =
            ANY($2::integer[])

       ORDER BY
         pu.fecha_creacion DESC,
         pu.id DESC`,
      [
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows;
  };

export const actualizarEstadoReportePulsera =
  async ({
    id,
    estado,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `UPDATE pulseras
       SET
  estado = $1::varchar,
  fecha_cierre =
    CASE
      WHEN $1::text = 'Resuelto'
             THEN CURRENT_TIMESTAMP
             ELSE NULL
           END
       WHERE id = $2
         AND (
           $3::boolean = TRUE
           OR cliente_operacion_id =
              ANY($4::integer[])
         )
       RETURNING *`,
      [
        estado,
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };
// ==========================================
// SOLICITUDES DE DESCARGA DE VIDEOS
// ==========================================
export const insertarSolicitudDescargaVideos =
  async ({
    clienteOperacionId,
    operacion,
    placas,
    fechaLlegadaUnidad,
    horaLlegadaUnidad,
    fechaDescarga,
    horaInicio,
    horaFin,
    motivo,
    solicitadoPor
  }) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const solicitudResult =
        await client.query(
          `INSERT INTO solicitudes_descarga_videos (
             cliente_operacion_id,
             operacion,
             fecha_llegada_unidad,
             hora_llegada_unidad,
             fecha_descarga,
             hora_inicio,
             hora_fin,
             motivo,
             solicitado_por
           )
           VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9
           )
           RETURNING *`,
          [
            clienteOperacionId,
            operacion,
            fechaLlegadaUnidad,
            horaLlegadaUnidad,
            fechaDescarga,
            horaInicio,
            horaFin,
            motivo,
            solicitadoPor
          ]
        );

      const solicitud =
        solicitudResult.rows[0];

      await client.query(
        `INSERT INTO solicitud_descarga_video_placas (
           solicitud_id,
           placa
         )
         SELECT
           $1,
           UNNEST($2::text[])`,
        [
          solicitud.id,
          placas
        ]
      );

      await client.query('COMMIT');

      return {
        ...solicitud,
        placas
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

// ==========================================
// LISTAR SOLICITUDES DE DESCARGA DE VIDEOS
// ==========================================

export const obtenerSolicitudesDescargaVideos =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `SELECT
           s.id,
           s.operacion,
           s.fecha_descarga,
           s.hora_inicio,
           s.hora_fin,
           s.motivo,
           s.estado,
           s.fecha_ingreso,
           s.solicitado_por,

           COALESCE(
             p.nombre_completo,
             u.username
           ) AS nombre_solicitante,

           COALESCE(
             JSON_AGG(
               sp.placa
               ORDER BY sp.placa
             ) FILTER (
               WHERE sp.placa IS NOT NULL
             ),
             '[]'::json
           ) AS placas

         FROM solicitudes_descarga_videos s

         INNER JOIN usuarios u
           ON u.id = s.solicitado_por

         LEFT JOIN personal p
           ON p.id = u.persona_id

         LEFT JOIN solicitud_descarga_video_placas sp
           ON sp.solicitud_id = s.id

         WHERE
           $1::boolean = TRUE
           OR (
             EXISTS (
               SELECT 1
               FROM solicitud_descarga_video_placas alcance_sp
               INNER JOIN vehiculos alcance_v
                 ON alcance_v.placa = alcance_sp.placa
               WHERE alcance_sp.solicitud_id = s.id
             )
             AND NOT EXISTS (
               SELECT 1
               FROM solicitud_descarga_video_placas fuera_sp
               INNER JOIN vehiculos fuera_v
                 ON fuera_v.placa = fuera_sp.placa
               WHERE fuera_sp.solicitud_id = s.id
                 AND NOT (
                   fuera_v.cliente_operacion_id =
                   ANY($2::integer[])
                 )
             )
           )

         GROUP BY
           s.id,
           u.username,
           p.nombre_completo

         ORDER BY
           s.fecha_ingreso DESC,
           s.id DESC`,
        [
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows;
  };


// ==========================================
// CAMBIAR ESTADO DE SOLICITUD
// ==========================================

export const actualizarEstadoSolicitudDescargaVideos =
  async ({
    id,
    estado,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result =
      await pool.query(
        `UPDATE solicitudes_descarga_videos
         SET estado = $1
         WHERE id = $2
           AND (
             $3::boolean = TRUE
             OR (
               EXISTS (
                 SELECT 1
                 FROM solicitud_descarga_video_placas alcance_sp
                 WHERE alcance_sp.solicitud_id = solicitudes_descarga_videos.id
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM solicitud_descarga_video_placas fuera_sp
                 INNER JOIN vehiculos fuera_v
                   ON fuera_v.placa = fuera_sp.placa
                 WHERE fuera_sp.solicitud_id = solicitudes_descarga_videos.id
                   AND NOT (
                     fuera_v.cliente_operacion_id =
                     ANY($4::integer[])
                   )
               )
             )
           )
         RETURNING *`,
        [
          estado,
          id,
          Boolean(accesoTotal),
          clienteOperacionIds || []
        ]
      );

    return result.rows[0] || null;
  };
// ==========================================
// LISTADO
// ==========================================

export const obtenerTickets =
  async ({
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         t.*,
         p.nombre_completo,
         p.dni,
         v.cliente,
         v.operacion,
         v.cliente_operacion_id
       FROM tickets_unidades t
       INNER JOIN personal p
         ON p.id = t.persona_id
       INNER JOIN vehiculos v
         ON v.placa = t.placa
       WHERE $1::boolean = TRUE
          OR v.cliente_operacion_id =
             ANY($2::integer[])
       ORDER BY t.id DESC`,
      [
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows;
  };

// ==========================================
// ACTUALIZACIÓN
// ==========================================

export const obtenerTicketPorId =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `SELECT
         t.*,
         p.nombre_completo,
         p.dni,
         v.cliente,
         v.operacion,
         v.cliente_operacion_id
       FROM tickets_unidades t
       INNER JOIN personal p
         ON p.id = t.persona_id
       INNER JOIN vehiculos v
         ON v.placa = t.placa
       WHERE t.id = $1
         AND (
           $2::boolean = TRUE
           OR v.cliente_operacion_id =
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

export const actualizarEstadoTicket =
  async ({
    id,
    estado,
    evidencia,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `UPDATE tickets_unidades
       SET
         estado = $1,
         evidencias =
           CASE
             WHEN $2::text IS NULL
               THEN evidencias
             ELSE evidencias ||
                  jsonb_build_array(
                    jsonb_build_object(
                      'tipo',
                      'cierre',
                      'url',
                      $2::text
                    )
                  )
           END
       FROM vehiculos v
       WHERE tickets_unidades.id = $3
         AND v.placa = tickets_unidades.placa
         AND (
           $4::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($5::integer[])
         )
       RETURNING tickets_unidades.*`,
      [
        estado,
        evidencia,
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// INSPECCIÓN RELACIONADA
// ==========================================

export const obtenerUltimaInspeccion =
  async placa => {
    const result = await pool.query(
      `SELECT *,
              fecha_hora::date::text AS fecha,
to_char(fecha_hora, 'HH24:MI') AS hora
       FROM inspecciones_flota
       WHERE placa = $1
       ORDER BY id DESC
       LIMIT 1`,
      [placa]
    );

    return result.rows[0] || null;
  };

export const actualizarInspeccionTicket =
  async ({
    id,
    tablet,
    radio,
    camaras,
    observaciones
  }) => {
    const result = await pool.query(
      `UPDATE inspecciones_flota
       SET tablet = $1,
           radio = $2,
           camaras = $3,
           observaciones = $4
       WHERE id = $5
       RETURNING *,
                 fecha_hora::date::text AS fecha,
to_char(fecha_hora, 'HH24:MI') AS hora`,
      [
        tablet,
        radio,
        camaras,
        observaciones,
        id
      ]
    );

    return result.rows[0] || null;
  };

// ==========================================
// ELIMINACIÓN
// ==========================================

export const eliminarTicketPorId =
  async ({
    id,
    accesoTotal,
    clienteOperacionIds
  }) => {
    const result = await pool.query(
      `DELETE FROM tickets_unidades t
       USING vehiculos v
       WHERE t.id = $1
         AND v.placa = t.placa
         AND (
           $2::boolean = TRUE
           OR v.cliente_operacion_id =
              ANY($3::integer[])
         )
       RETURNING t.*`,
      [
        id,
        Boolean(accesoTotal),
        clienteOperacionIds || []
      ]
    );

    return result.rows[0] || null;
  };
