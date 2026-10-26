-- TI-PR-01 | 19/10/2026 | diagnóstico previo a la corrección autorizada.
-- 9 programas del Excel + 10 altas M1 (16/10/2026) + VAM846 vendida.
-- Este archivo solo consulta. No inserta visitas, no cambia inventario ni cancela OTs.
-- No se sustituyen letras O por números 0. V0R775 queda fuera del cambio solicitado.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'America/Lima';
SET LOCAL statement_timeout='60s';

-- 1. Programa, versiones y periodo de la base conectada.
SELECT current_database() AS base,
       (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima') AS consulta_peru,
       p.id AS programa_id, p.codigo, p.estado AS estado_programa,
       v.id AS version_id, v.version, v.estado AS estado_version,
       v.periodo_inicio::text, v.periodo_fin::text,
       v.vigencia_desde::text, v.vigencia_hasta::text
FROM public.programas_mantenimiento p
LEFT JOIN public.programas_mantenimiento_versiones v ON v.programa_id=p.id
WHERE p.codigo='TI-PR-01'
ORDER BY p.id, v.vigencia_desde;

WITH objetivo(placa_clave, accion) AS (
  VALUES
    ('B6Z714','COPIAR_EXCEL'),
    ('B8D793','COPIAR_EXCEL'),
    ('BJB753','COPIAR_EXCEL'),
    ('BUW928','COPIAR_EXCEL'),
    ('V8A799','COPIAR_EXCEL'),
    ('V9T961','COPIAR_EXCEL'),
    ('V9U834','COPIAR_EXCEL'),
    ('V7L872','COPIAR_EXCEL'),
    ('VCP879','COPIAR_EXCEL'),
    ('V8A796','CREAR_M1_2026_10_16'),
    ('V0R757','CREAR_M1_2026_10_16'),
    ('V0R915','CREAR_M1_2026_10_16'),
    ('V0R941','CREAR_M1_2026_10_16'),
    ('V6V880','CREAR_M1_2026_10_16'),
    ('V7L943','CREAR_M1_2026_10_16'),
    ('V8A809','CREAR_M1_2026_10_16'),
    ('V9V867','CREAR_M1_2026_10_16'),
    ('VBU734','CREAR_M1_2026_10_16'),
    ('VCW921','CREAR_M1_2026_10_16'),
    ('VAM846','VENDIDA')
), programa AS (
  SELECT id, codigo FROM public.programas_mantenimiento WHERE codigo='TI-PR-01'
), unidades AS (
  SELECT t.placa_clave, t.accion, u.*, p.codigo
  FROM objetivo t CROSS JOIN programa p
  JOIN public.programa_mantenimiento_unidades u ON u.programa_id=p.id
   AND regexp_replace(upper(btrim(u.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
)
-- 2. Las 20 placas: registros reales, inventario y OTs que pueden afectar la carga.
SELECT t.placa_clave AS placa, t.accion,
       (SELECT count(*)::int FROM public.vehiculos v
        WHERE regexp_replace(upper(btrim(v.placa)), '[-[:space:]]', '', 'g')=t.placa_clave) AS filas_flota,
       (SELECT string_agg(v.placa, ', ' ORDER BY v.placa) FROM public.vehiculos v
        WHERE regexp_replace(upper(btrim(v.placa)), '[-[:space:]]', '', 'g')=t.placa_clave) AS placa_real,
       (SELECT count(*)::int FROM unidades u WHERE u.placa_clave=t.placa_clave) AS filas_programa,
       (SELECT string_agg(u.id::text, ', ' ORDER BY u.id) FROM unidades u WHERE u.placa_clave=t.placa_clave) AS ids_unidad,
       (SELECT string_agg(COALESCE(u.quincena_incorporacion::text, 'SIN FECHA'), ', ' ORDER BY u.id)
        FROM unidades u WHERE u.placa_clave=t.placa_clave) AS incorporacion,
       (SELECT count(*)::int FROM public.vehiculo_equipos e
        WHERE regexp_replace(upper(btrim(e.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
          AND e.estado_inventario='INSTALADO') AS fisicos_instalados,
       (SELECT count(*)::int FROM public.programacion_mantenimiento m JOIN unidades u ON u.id=m.programa_unidad_id
        WHERE u.placa_clave=t.placa_clave AND m.estado<>'CANCELADO') AS visitas_activas,
       (SELECT count(*)::int FROM public.ordenes_trabajo o
        JOIN public.programacion_mantenimiento m ON m.id=o.programacion_id
        JOIN unidades u ON u.id=m.programa_unidad_id
        WHERE u.placa_clave=t.placa_clave AND o.estado='ABIERTA') AS ot_abiertas,
       (SELECT count(*)::int FROM public.ordenes_trabajo o
        JOIN public.programacion_mantenimiento m ON m.id=o.programacion_id
        JOIN unidades u ON u.id=m.programa_unidad_id
        WHERE u.placa_clave=t.placa_clave AND o.estado='CERRADA') AS ot_cerradas
FROM objetivo t ORDER BY t.accion, t.placa_clave;

WITH objetivo(placa_clave, accion) AS (
  VALUES
    ('B6Z714','COPIAR_EXCEL'),
    ('B8D793','COPIAR_EXCEL'),
    ('BJB753','COPIAR_EXCEL'),
    ('BUW928','COPIAR_EXCEL'),
    ('V8A799','COPIAR_EXCEL'),
    ('V9T961','COPIAR_EXCEL'),
    ('V9U834','COPIAR_EXCEL'),
    ('V7L872','COPIAR_EXCEL'),
    ('VCP879','COPIAR_EXCEL'),
    ('V8A796','CREAR_M1_2026_10_16'),
    ('V0R757','CREAR_M1_2026_10_16'),
    ('V0R915','CREAR_M1_2026_10_16'),
    ('V0R941','CREAR_M1_2026_10_16'),
    ('V6V880','CREAR_M1_2026_10_16'),
    ('V7L943','CREAR_M1_2026_10_16'),
    ('V8A809','CREAR_M1_2026_10_16'),
    ('V9V867','CREAR_M1_2026_10_16'),
    ('VBU734','CREAR_M1_2026_10_16'),
    ('VCW921','CREAR_M1_2026_10_16'),
    ('VAM846','VENDIDA')
), programa AS (
  SELECT id, codigo FROM public.programas_mantenimiento WHERE codigo='TI-PR-01'
), unidades AS (
  SELECT t.placa_clave, t.accion, u.*, p.codigo
  FROM objetivo t CROSS JOIN programa p
  JOIN public.programa_mantenimiento_unidades u ON u.programa_id=p.id
   AND regexp_replace(upper(btrim(u.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
)
-- 3. Aplicabilidad: misma regla de inventario que emplea el generador del ERP.
-- CAMARAS = cámara interna o externa; DVR no agrega una familia de mantenimiento.
SELECT t.placa_clave AS placa, t.accion, f.familia,
       CASE WHEN count(e.id)=0 THEN 'SIN_FILA'
            WHEN bool_or(e.estado_inventario='INSTALADO') THEN 'APLICA'
            WHEN bool_and(e.estado_inventario='NO_APLICA') THEN 'NO_APLICA'
            ELSE 'POR_VALIDAR' END AS aplicabilidad,
       string_agg(e.tipo_equipo||'='||e.estado_inventario, '; ' ORDER BY e.tipo_equipo) AS detalle_inventario
FROM objetivo t
CROSS JOIN (VALUES ('CAMARAS', ARRAY['CAMARA_INTERNA','CAMARA_EXTERNA']::text[]),
                   ('COPILOTO', ARRAY['COPILOTO']::text[]),
                   ('RADIO_BASE', ARRAY['RADIO_BASE']::text[]),
                   ('GPS', ARRAY['GPS']::text[]),
                   ('ADAS', ARRAY['ADAS']::text[])) f(familia,fisicos)
LEFT JOIN public.vehiculo_equipos e
  ON regexp_replace(upper(btrim(e.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
 AND e.tipo_equipo=ANY(f.fisicos)
GROUP BY t.placa_clave,t.accion,f.familia
ORDER BY t.placa_clave,f.familia;

WITH objetivo(placa_clave, accion) AS (
  VALUES
    ('B6Z714','COPIAR_EXCEL'),
    ('B8D793','COPIAR_EXCEL'),
    ('BJB753','COPIAR_EXCEL'),
    ('BUW928','COPIAR_EXCEL'),
    ('V8A799','COPIAR_EXCEL'),
    ('V9T961','COPIAR_EXCEL'),
    ('V9U834','COPIAR_EXCEL'),
    ('V7L872','COPIAR_EXCEL'),
    ('VCP879','COPIAR_EXCEL'),
    ('V8A796','CREAR_M1_2026_10_16'),
    ('V0R757','CREAR_M1_2026_10_16'),
    ('V0R915','CREAR_M1_2026_10_16'),
    ('V0R941','CREAR_M1_2026_10_16'),
    ('V6V880','CREAR_M1_2026_10_16'),
    ('V7L943','CREAR_M1_2026_10_16'),
    ('V8A809','CREAR_M1_2026_10_16'),
    ('V9V867','CREAR_M1_2026_10_16'),
    ('VBU734','CREAR_M1_2026_10_16'),
    ('VCW921','CREAR_M1_2026_10_16'),
    ('VAM846','VENDIDA')
), programa AS (
  SELECT id, codigo FROM public.programas_mantenimiento WHERE codigo='TI-PR-01'
), unidades AS (
  SELECT t.placa_clave, t.accion, u.*, p.codigo
  FROM objetivo t CROSS JOIN programa p
  JOIN public.programa_mantenimiento_unidades u ON u.programa_id=p.id
   AND regexp_replace(upper(btrim(u.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
)
-- 4. Visitas actuales; se incluyen anualidades, canceladas e historial para no pisarlos.
SELECT u.placa_clave AS placa, u.accion, m.id AS visita_id,
       m.quincena_programada::text, m.quincena_reprogramada::text,
       m.quincena_efectiva::text, m.estado, m.fecha_ejecucion::text,
       (SELECT string_agg(e.tipo_equipo||'/'||e.nivel_mantenimiento, '; ' ORDER BY e.tipo_equipo)
        FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=m.id) AS equipos,
       (SELECT string_agg(o.id::text||'/'||o.estado, '; ' ORDER BY o.id)
        FROM public.ordenes_trabajo o WHERE o.programacion_id=m.id) AS ordenes,
       (SELECT count(*)::int FROM public.programacion_mantenimiento_ajustes a
        WHERE a.programacion_id=m.id) AS ajustes
FROM unidades u JOIN public.programacion_mantenimiento m ON m.programa_unidad_id=u.id
ORDER BY u.placa_clave,m.quincena_efectiva,m.id;

WITH objetivo(placa_clave, accion) AS (
  VALUES
    ('B6Z714','COPIAR_EXCEL'),
    ('B8D793','COPIAR_EXCEL'),
    ('BJB753','COPIAR_EXCEL'),
    ('BUW928','COPIAR_EXCEL'),
    ('V8A799','COPIAR_EXCEL'),
    ('V9T961','COPIAR_EXCEL'),
    ('V9U834','COPIAR_EXCEL'),
    ('V7L872','COPIAR_EXCEL'),
    ('VCP879','COPIAR_EXCEL'),
    ('V8A796','CREAR_M1_2026_10_16'),
    ('V0R757','CREAR_M1_2026_10_16'),
    ('V0R915','CREAR_M1_2026_10_16'),
    ('V0R941','CREAR_M1_2026_10_16'),
    ('V6V880','CREAR_M1_2026_10_16'),
    ('V7L943','CREAR_M1_2026_10_16'),
    ('V8A809','CREAR_M1_2026_10_16'),
    ('V9V867','CREAR_M1_2026_10_16'),
    ('VBU734','CREAR_M1_2026_10_16'),
    ('VCW921','CREAR_M1_2026_10_16'),
    ('VAM846','VENDIDA')
), programa AS (
  SELECT id, codigo FROM public.programas_mantenimiento WHERE codigo='TI-PR-01'
), unidades AS (
  SELECT t.placa_clave, t.accion, u.*, p.codigo
  FROM objetivo t CROSS JOIN programa p
  JOIN public.programa_mantenimiento_unidades u ON u.programa_id=p.id
   AND regexp_replace(upper(btrim(u.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
)
-- 5. Referencias reales y anclas: se leen por separado, sin fingir ejecuciones.
SELECT u.placa_clave AS placa, f.tipo_equipo, f.nivel_mantenimiento,
       f.frecuencia_quincenas,
       c.ultima_quincena::text AS ciclo_quincena,
       c.ultima_fecha_real::text AS ciclo_fecha_real,
       c.fuente AS ciclo_fuente, c.orden_trabajo_detalle_id,
       a.quincena_ancla::text, a.origen AS origen_ancla,
       COALESCE(c.ultima_quincena,a.quincena_ancla)::text AS referencia_efectiva
FROM unidades u
JOIN public.programa_mantenimiento_frecuencias f ON f.programa_id=u.programa_id
LEFT JOIN public.programa_mantenimiento_unidad_ciclos c
  ON c.programa_unidad_id=u.id AND c.tipo_equipo=f.tipo_equipo
 AND c.nivel_mantenimiento=f.nivel_mantenimiento
LEFT JOIN public.programa_mantenimiento_unidad_anclas a
  ON a.programa_unidad_id=u.id AND a.tipo_equipo=f.tipo_equipo
 AND a.nivel_mantenimiento=f.nivel_mantenimiento
ORDER BY u.placa_clave,f.tipo_equipo,f.nivel_mantenimiento;

WITH objetivo(placa_clave, accion) AS (
  VALUES
    ('B6Z714','COPIAR_EXCEL'),
    ('B8D793','COPIAR_EXCEL'),
    ('BJB753','COPIAR_EXCEL'),
    ('BUW928','COPIAR_EXCEL'),
    ('V8A799','COPIAR_EXCEL'),
    ('V9T961','COPIAR_EXCEL'),
    ('V9U834','COPIAR_EXCEL'),
    ('V7L872','COPIAR_EXCEL'),
    ('VCP879','COPIAR_EXCEL'),
    ('V8A796','CREAR_M1_2026_10_16'),
    ('V0R757','CREAR_M1_2026_10_16'),
    ('V0R915','CREAR_M1_2026_10_16'),
    ('V0R941','CREAR_M1_2026_10_16'),
    ('V6V880','CREAR_M1_2026_10_16'),
    ('V7L943','CREAR_M1_2026_10_16'),
    ('V8A809','CREAR_M1_2026_10_16'),
    ('V9V867','CREAR_M1_2026_10_16'),
    ('VBU734','CREAR_M1_2026_10_16'),
    ('VCW921','CREAR_M1_2026_10_16'),
    ('VAM846','VENDIDA')
), programa AS (
  SELECT id, codigo FROM public.programas_mantenimiento WHERE codigo='TI-PR-01'
), unidades AS (
  SELECT t.placa_clave, t.accion, u.*, p.codigo
  FROM objetivo t CROSS JOIN programa p
  JOIN public.programa_mantenimiento_unidades u ON u.programa_id=p.id
   AND regexp_replace(upper(btrim(u.placa)), '[-[:space:]]', '', 'g')=t.placa_clave
), deseado(placa_clave, quincena, nivel, origen) AS (
  VALUES
    ('B6Z714','2026-09-16'::date,'M1','TI-PR-01!R169'),
    ('B6Z714','2026-10-01'::date,'M1','TI-PR-01!S169'),
    ('B6Z714','2026-10-16'::date,'M1','TI-PR-01!T169'),
    ('B6Z714','2026-11-01'::date,'M1','TI-PR-01!U169'),
    ('B6Z714','2026-11-16'::date,'M1','TI-PR-01!V169'),
    ('B6Z714','2026-12-01'::date,'M2','TI-PR-01!W169'),
    ('B6Z714','2026-12-16'::date,'M1','TI-PR-01!X169'),
    ('B8D793','2026-09-16'::date,'M1','TI-PR-01!R170'),
    ('B8D793','2026-10-01'::date,'M1','TI-PR-01!S170'),
    ('B8D793','2026-10-16'::date,'M1','TI-PR-01!T170'),
    ('B8D793','2026-11-01'::date,'M1','TI-PR-01!U170'),
    ('B8D793','2026-11-16'::date,'M1','TI-PR-01!V170'),
    ('B8D793','2026-12-01'::date,'M2','TI-PR-01!W170'),
    ('B8D793','2026-12-16'::date,'M1','TI-PR-01!X170'),
    ('BJB753','2026-09-01'::date,'M1','TI-PR-01!Q55'),
    ('BJB753','2026-09-16'::date,'M1','TI-PR-01!R55'),
    ('BJB753','2026-10-01'::date,'M1','TI-PR-01!S55'),
    ('BJB753','2026-10-16'::date,'M2','TI-PR-01!T55'),
    ('BJB753','2026-11-01'::date,'M1','TI-PR-01!U55'),
    ('BJB753','2026-11-16'::date,'M1','TI-PR-01!V55'),
    ('BJB753','2026-12-01'::date,'M1','TI-PR-01!W55'),
    ('BJB753','2026-12-16'::date,'M1','TI-PR-01!X55'),
    ('BUW928','2026-09-16'::date,'M1','TI-PR-01!R61'),
    ('BUW928','2026-10-01'::date,'M1','TI-PR-01!S61'),
    ('BUW928','2026-10-16'::date,'M1','TI-PR-01!T61'),
    ('BUW928','2026-11-01'::date,'M1','TI-PR-01!U61'),
    ('BUW928','2026-11-16'::date,'M1','TI-PR-01!V61'),
    ('BUW928','2026-12-01'::date,'M2','TI-PR-01!W61'),
    ('BUW928','2026-12-16'::date,'M1','TI-PR-01!X61'),
    ('V8A799','2026-10-01'::date,'M1','TI-PR-01!S37'),
    ('V8A799','2026-10-16'::date,'M1','TI-PR-01!T37'),
    ('V8A799','2026-11-01'::date,'M1','TI-PR-01!U37'),
    ('V8A799','2026-11-16'::date,'M1','TI-PR-01!V37'),
    ('V8A799','2026-12-01'::date,'M1','TI-PR-01!W37'),
    ('V8A799','2026-12-16'::date,'M2','TI-PR-01!X37'),
    ('V9T961','2026-09-16'::date,'M1','TI-PR-01!R175'),
    ('V9T961','2026-10-01'::date,'M1','TI-PR-01!S175'),
    ('V9T961','2026-10-16'::date,'M1','TI-PR-01!T175'),
    ('V9T961','2026-11-01'::date,'M1','TI-PR-01!U175'),
    ('V9T961','2026-11-16'::date,'M1','TI-PR-01!V175'),
    ('V9T961','2026-12-01'::date,'M2','TI-PR-01!W175'),
    ('V9T961','2026-12-16'::date,'M1','TI-PR-01!X175'),
    ('V9U834','2026-10-01'::date,'M1','TI-PR-01!S176'),
    ('V9U834','2026-10-16'::date,'M1','TI-PR-01!T176'),
    ('V9U834','2026-11-01'::date,'M1','TI-PR-01!U176'),
    ('V9U834','2026-11-16'::date,'M1','TI-PR-01!V176'),
    ('V9U834','2026-12-01'::date,'M1','TI-PR-01!W176'),
    ('V9U834','2026-12-16'::date,'M2','TI-PR-01!X176'),
    ('V7L872','2026-11-01'::date,'M1','TI-PR-01!U26'),
    ('V7L872','2026-11-16'::date,'M1','TI-PR-01!V26'),
    ('V7L872','2026-12-01'::date,'M1','TI-PR-01!W26'),
    ('V7L872','2026-12-16'::date,'M1','TI-PR-01!X26'),
    ('VCP879','2026-12-16'::date,'M1','TI-PR-01!X99'),
    ('V8A796','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A796','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A796','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A796','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A796','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R757','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R757','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R757','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R757','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R757','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R915','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R915','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R915','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R915','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R915','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R941','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R941','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R941','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R941','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V0R941','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V6V880','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V6V880','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V6V880','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V6V880','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V6V880','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V7L943','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V7L943','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V7L943','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V7L943','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V7L943','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A809','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A809','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A809','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A809','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V8A809','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V9V867','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V9V867','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V9V867','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V9V867','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('V9V867','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VBU734','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VBU734','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VBU734','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VBU734','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VBU734','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VCW921','2026-10-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VCW921','2026-11-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VCW921','2026-11-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VCW921','2026-12-01'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026'),
    ('VCW921','2026-12-16'::date,'M1','ALTA M1 AUTORIZADA 19/10/2026')
)
-- 6. Calendario objetivo autorizado frente a cada visita actual.
-- SOLO_ANUAL no se elimina: la futura carga debe conservar ese alcance independiente.
SELECT d.placa_clave AS placa, d.quincena::text, d.nivel AS regular_solicitado,
       d.origen, u.id AS programa_unidad_id, m.id AS visita_actual_id,
       m.estado AS estado_visita_actual,
       (SELECT string_agg(e.tipo_equipo||'/'||e.nivel_mantenimiento, '; ' ORDER BY e.tipo_equipo)
        FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=m.id
          AND e.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE')) AS regulares_actuales,
       (SELECT string_agg(e.tipo_equipo||'/'||e.nivel_mantenimiento, '; ' ORDER BY e.tipo_equipo)
        FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=m.id
          AND e.tipo_equipo IN ('GPS','ADAS')) AS anuales_a_conservar,
       (SELECT string_agg(o.id::text||'/'||o.estado, '; ' ORDER BY o.id)
        FROM public.ordenes_trabajo o WHERE o.programacion_id=m.id) AS ordenes
FROM deseado d LEFT JOIN unidades u ON u.placa_clave=d.placa_clave
LEFT JOIN public.programacion_mantenimiento m ON m.programa_unidad_id=u.id
 AND m.quincena_efectiva=d.quincena AND m.estado<>'CANCELADO'
ORDER BY d.placa_clave,d.quincena,m.id;

COMMIT;
