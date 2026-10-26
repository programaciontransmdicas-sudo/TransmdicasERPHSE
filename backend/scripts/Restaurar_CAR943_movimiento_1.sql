-- Corrección autorizada: regresar CAR-943 al estado anterior al movimiento 1.
-- Restaura las cinco visitas completas. Conserva respaldo y auditoría de la corrección.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.respaldo_reversion_programacion (
  movimiento_id integer PRIMARY KEY,
  placa text NOT NULL,
  fecha_reversion timestamptz NOT NULL DEFAULT now(),
  ejecutado_por_db text NOT NULL DEFAULT session_user,
  motivo text NOT NULL,
  datos jsonb NOT NULL
);

DO $$
DECLARE
  mov public.programacion_mantenimiento_ajustes%ROWTYPE;
  cambio jsonb;
  antes jsonb;
  despues jsonb;
  equipo jsonb;
  ids integer[];
  movimientos jsonb;
  estado_previo jsonb;
  estado_restaurado jsonb;
  temporal date;
  contador integer := 0;
BEGIN
  -- Siempre se bloquea primero la unidad, como en las operaciones del backend.
  PERFORM 1 FROM public.programa_mantenimiento_unidades
  WHERE id = 2754 AND programa_id = 90
    AND regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = 'CAR943'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No coincide CAR-943, programa 90, unidad 2754. No se restauró nada.';
  END IF;

  SELECT * INTO mov FROM public.programacion_mantenimiento_ajustes WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.respaldo_reversion_programacion
               WHERE movimiento_id = 1 AND placa = 'CAR943') THEN
      RAISE NOTICE 'El movimiento 1 ya fue revertido; no se repite la corrección.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'No existe el movimiento 1 ni un respaldo de su reversión.';
  END IF;

  IF mov.programa_id <> 90 OR mov.programa_unidad_id <> 2754
     OR mov.programacion_id <> 12511 OR mov.tipo <> 'REPROGRAMACION'
     OR mov.quincena_anterior <> DATE '2026-10-01'
     OR mov.quincena_destino <> DATE '2026-11-01'
     OR jsonb_array_length(mov.cambios) <> 5 THEN
    RAISE EXCEPTION 'El movimiento 1 no coincide con el diagnóstico esperado. No se restauró nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.respaldo_reversion_programacion WHERE movimiento_id = 1) THEN
    RAISE EXCEPTION 'Ya existe un respaldo para el movimiento 1, pero el movimiento sigue activo. Revisar antes de continuar.';
  END IF;

  SELECT array_agg((c->'antes'->>'id')::integer) INTO ids
  FROM jsonb_array_elements(mov.cambios) c;
  IF cardinality(ids) <> 5 OR
     (SELECT count(DISTINCT x) FROM unnest(ids) x) <> 5 THEN
    RAISE EXCEPTION 'El respaldo no contiene exactamente cinco visitas distintas.';
  END IF;

  PERFORM 1 FROM public.programacion_mantenimiento
  WHERE programa_unidad_id = 2754 ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.programacion_mantenimiento_equipos
  WHERE programacion_id = ANY(ids) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.programacion_mantenimiento_ajustes
  WHERE programa_unidad_id = 2754 ORDER BY id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE programacion_id = ANY(ids)) THEN
    RAISE EXCEPTION 'Alguna de las cinco visitas ya tiene una OT. No se restauró nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.programacion_mantenimiento_ajustes
             WHERE programa_unidad_id = 2754 AND fecha > mov.fecha) THEN
    RAISE EXCEPTION 'Hay movimientos posteriores para CAR-943. No se restauró nada.';
  END IF;

  -- Compara el estado actual con la fotografía DESPUÉS del movimiento.
  -- No sobrescribe ediciones posteriores de fechas, estado, notas, versión o equipos.
  FOR cambio IN SELECT value FROM jsonb_array_elements(mov.cambios) LOOP
    antes := cambio->'antes'; despues := cambio->'despues';
    IF antes->>'id' IS DISTINCT FROM despues->>'id'
       OR (antes->>'programa_id')::integer IS DISTINCT FROM 90
       OR (antes->>'programa_unidad_id')::integer IS DISTINCT FROM 2754
       OR antes->>'estado' NOT IN ('PROYECTADO','PROGRAMADO','REPROGRAMADO') THEN
      RAISE EXCEPTION 'Fotografía inválida de una visita. No se restauró nada.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.programacion_mantenimiento p
      WHERE p.id = (antes->>'id')::integer AND p.programa_id = 90 AND p.programa_unidad_id = 2754
        AND p.quincena_programada::text = antes->>'quincena_programada'
        AND p.quincena_efectiva::text = despues->>'quincena_efectiva'
        AND p.quincena_reprogramada::text IS NOT DISTINCT FROM despues->>'quincena_reprogramada'
        AND p.estado = despues->>'estado'
        AND p.version_programa_id IS NOT DISTINCT FROM (despues->>'version_programa_id')::integer
        AND p.nivel_regular_forzado IS NOT DISTINCT FROM despues->>'nivel_regular_forzado'
        AND p.planificacion_ajustada IS NOT DISTINCT FROM (despues->>'planificacion_ajustada')::boolean
        AND p.observaciones IS NOT DISTINCT FROM despues->>'observaciones'
        AND p.fecha_ejecucion IS NULL
    ) THEN
      RAISE EXCEPTION 'La visita % cambió después de la reprogramación. No se restauró nada.', antes->>'id';
    END IF;
    IF jsonb_typeof(antes->'equipos') IS DISTINCT FROM 'array'
       OR jsonb_typeof(despues->'equipos') IS DISTINCT FROM 'array'
       OR jsonb_array_length(antes->'equipos') <> jsonb_array_length(despues->'equipos')
       OR (SELECT count(*) FROM public.programacion_mantenimiento_equipos
           WHERE programacion_id = (antes->>'id')::integer) <> jsonb_array_length(despues->'equipos') THEN
      RAISE EXCEPTION 'El alcance de la visita % ya no coincide.', antes->>'id';
    END IF;
    FOR equipo IN SELECT value FROM jsonb_array_elements(despues->'equipos') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.programacion_mantenimiento_equipos e
        WHERE e.id = (equipo->>'id')::integer AND e.programacion_id = (antes->>'id')::integer
          AND e.tipo_equipo = equipo->>'tipo_equipo'
          AND e.nivel_mantenimiento = equipo->>'nivel_mantenimiento'
      ) OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(antes->'equipos') e
        WHERE e->>'id' = equipo->>'id' AND e->>'tipo_equipo' = equipo->>'tipo_equipo'
      ) THEN
        RAISE EXCEPTION 'Un equipo de la visita % fue modificado. No se restauró nada.', antes->>'id';
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT count(DISTINCT c->'antes'->>'quincena_efectiva')
      FROM jsonb_array_elements(mov.cambios) c) <> 5 THEN
    RAISE EXCEPTION 'Las fechas originales no son cinco quincenas distintas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.programacion_mantenimiento p
    WHERE p.programa_unidad_id = 2754 AND p.estado <> 'CANCELADO' AND NOT (p.id = ANY(ids))
      AND p.quincena_efectiva IN (
        SELECT (c->'antes'->>'quincena_efectiva')::date FROM jsonb_array_elements(mov.cambios) c
      )
  ) THEN
    RAISE EXCEPTION 'Otra visita ocupa una fecha que se debe recuperar. No se restauró nada.';
  END IF;

  -- Archiva el movimiento principal y sus filas derivadas antes de retirarlos del plan activo.
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO movimientos
  FROM public.programacion_mantenimiento_ajustes a
  WHERE a.programa_unidad_id = 2754 AND a.fecha = mov.fecha;
  IF EXISTS (
    SELECT 1 FROM public.programacion_mantenimiento_ajustes a
    WHERE a.programa_unidad_id = 2754 AND a.fecha = mov.fecha
      AND (NOT (a.programacion_id = ANY(ids)) OR a.tipo NOT IN ('REPROGRAMACION','RECALCULO_PLAN'))
  ) THEN
    RAISE EXCEPTION 'Hay ajustes ajenos con la misma marca de tiempo. No se restauró nada.';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('visita', to_jsonb(p), 'equipos', (
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
    FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id = p.id
  )) ORDER BY p.id) INTO estado_previo
  FROM public.programacion_mantenimiento p WHERE p.id = ANY(ids);

  INSERT INTO public.respaldo_reversion_programacion(movimiento_id,placa,motivo,datos)
  VALUES (1,'CAR943','Reversión solicitada para recuperar el plan anterior a la prueba de reprogramación.',
    jsonb_build_object('movimientos_originales',movimientos,'estado_antes_de_revertir',estado_previo,
                       'fotografia_a_restaurar',mov.cambios));

  -- Fechas temporales solo dentro de la transacción para conservar el índice único activo.
  SELECT (date_trunc('year',max(quincena_efectiva)) + interval '2 years')::date INTO temporal
  FROM public.programacion_mantenimiento WHERE programa_unidad_id = 2754;
  FOREACH contador IN ARRAY ids LOOP
    UPDATE public.programacion_mantenimiento SET quincena_reprogramada = temporal WHERE id = contador;
    temporal := (temporal + interval '1 month')::date;
  END LOOP;

  FOR cambio IN SELECT value FROM jsonb_array_elements(mov.cambios) LOOP
    antes := cambio->'antes';
    UPDATE public.programacion_mantenimiento
    SET quincena_reprogramada = (antes->>'quincena_reprogramada')::date,
        estado = antes->>'estado',
        version_programa_id = (antes->>'version_programa_id')::integer,
        nivel_regular_forzado = antes->>'nivel_regular_forzado',
        planificacion_ajustada = COALESCE((antes->>'planificacion_ajustada')::boolean,false),
        observaciones = antes->>'observaciones'
    WHERE id = (antes->>'id')::integer;
    FOR equipo IN SELECT value FROM jsonb_array_elements(antes->'equipos') LOOP
      UPDATE public.programacion_mantenimiento_equipos
      SET nivel_mantenimiento = equipo->>'nivel_mantenimiento'
      WHERE id = (equipo->>'id')::integer;
    END LOOP;
  END LOOP;

  DELETE FROM public.programacion_mantenimiento_ajustes
  WHERE programa_unidad_id = 2754 AND fecha = mov.fecha;

  SELECT jsonb_agg(jsonb_build_object('visita',to_jsonb(p),'equipos',(
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
    FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id = p.id
  )) ORDER BY p.id) INTO estado_restaurado
  FROM public.programacion_mantenimiento p WHERE p.id = ANY(ids);

  INSERT INTO public.audit_logs
    (user_id,accion,tabla_afectada,fecha,ip_address,valores_anteriores,valores_actuales)
  VALUES (NULL,'Corrección SQL autorizada: reversión del movimiento 1 de CAR943; cinco visitas restauradas. Ejecutor DB: ' || session_user,
    'programacion_mantenimiento',now(),NULL,estado_previo,estado_restaurado);
END $$;

COMMIT;

SELECT movimiento_id,placa,fecha_reversion,
       jsonb_array_length(datos->'fotografia_a_restaurar') AS visitas_restauradas,
       NOT EXISTS (SELECT 1 FROM public.programacion_mantenimiento_ajustes WHERE id=1) AS movimiento_revertido
FROM public.respaldo_reversion_programacion WHERE movimiento_id=1;

SELECT p.id AS visita_id,p.estado,p.quincena_programada,p.quincena_reprogramada,p.quincena_efectiva,
       e.tipo_equipo,e.nivel_mantenimiento
FROM public.programacion_mantenimiento p
JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
WHERE p.id IN (
  SELECT (c->'antes'->>'id')::integer
  FROM public.respaldo_reversion_programacion r,
       jsonb_array_elements(r.datos->'fotografia_a_restaurar') c
  WHERE r.movimiento_id=1
)
ORDER BY p.quincena_efectiva,e.tipo_equipo;
