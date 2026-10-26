-- SOLO LECTURA: identifica la última reprogramación iniciada sobre CAR-943.
-- No confunde sus movimientos derivados con una nueva acción del usuario.
WITH movimiento AS (
  SELECT a.*, u.placa
  FROM public.programacion_mantenimiento_ajustes a
  JOIN public.programa_mantenimiento_unidades u ON u.id = a.programa_unidad_id
  WHERE regexp_replace(upper(u.placa), '[^A-Z0-9]', '', 'g') = 'CAR943'
    AND a.tipo = 'REPROGRAMACION'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.cambios) c
      WHERE c->>'manual' = 'true'
    )
  ORDER BY a.id DESC
  LIMIT 1
)
SELECT a.id AS movimiento_id,
       a.placa,
       a.programa_id,
       a.programa_unidad_id,
       a.programacion_id AS visita_id,
       a.fecha AT TIME ZONE 'America/Lima' AS fecha_movimiento_peru,
       a.quincena_anterior,
       a.quincena_destino,
       a.motivo,
       jsonb_array_length(a.cambios) AS visitas_afectadas,
       p.estado AS estado_actual_visita,
       p.quincena_efectiva AS quincena_actual_visita,
       (SELECT count(*) FROM public.ordenes_trabajo o
        WHERE o.programacion_id IN (
          SELECT (c->'antes'->>'id')::integer
          FROM jsonb_array_elements(a.cambios) c
        )) AS ordenes_en_visitas_afectadas,
       (SELECT count(*) FROM public.programacion_mantenimiento_ajustes posterior
        WHERE posterior.programa_unidad_id = a.programa_unidad_id
          AND posterior.fecha > a.fecha) AS movimientos_posteriores,
       (SELECT jsonb_agg(jsonb_build_object(
          'visita_id', c->'antes'->'id',
          'quincena_antes', c->'antes'->>'quincena_efectiva',
          'quincena_despues', c->'despues'->>'quincena_efectiva'
        )) FROM jsonb_array_elements(a.cambios) c) AS detalle_quincenas
FROM movimiento a
LEFT JOIN public.programacion_mantenimiento p ON p.id = a.programacion_id;
