-- TI-PR-01 | Corrección autorizada por Pedro y el ingeniero, 19/10/2026.
-- 9 calendarios EXACTOS del Excel + 10 altas M1 desde 16/10/2026 + VAM846 vendida.
-- El alcance confirmado es CAMARAS / COPILOTO / RADIO_BASE.
-- No se inventa ubicación interna/externa, marca, serie o fecha de instalación de cámaras.
-- La programación no afirma ejecución: no se escriben ciclos ni OTs.
BEGIN;
SET LOCAL TIME ZONE 'America/Lima';
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtext('ti_pr01_programacion_19102026_v1'));
LOCK TABLE public.programas_mantenimiento, public.programas_mantenimiento_versiones,
 public.programa_mantenimiento_unidades, public.programa_mantenimiento_frecuencias,
 public.programa_mantenimiento_unidad_anclas, public.programa_mantenimiento_unidad_ciclos,
 public.programacion_mantenimiento, public.programacion_mantenimiento_equipos,
 public.programacion_mantenimiento_ajustes, public.ordenes_trabajo,
 public.vehiculos, public.vehiculo_equipos IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _ti_objetivo(placa_clave text PRIMARY KEY,accion text NOT NULL,
 incorporacion date,ancla_m1 date,ancla_m2 date,ancla_m3 date) ON COMMIT DROP;
INSERT INTO _ti_objetivo VALUES
  ('B6Z714', 'COPIAR_EXCEL', '2026-09-16'::date, '2026-09-01'::date, '2026-09-01'::date, '2026-09-01'::date),
  ('B8D793', 'COPIAR_EXCEL', '2026-09-16'::date, '2026-09-01'::date, '2026-09-01'::date, '2026-09-01'::date),
  ('BJB753', 'COPIAR_EXCEL', '2026-09-01'::date, '2026-07-16'::date, '2026-07-16'::date, '2026-07-16'::date),
  ('BUW928', 'COPIAR_EXCEL', '2026-09-16'::date, '2026-09-01'::date, '2026-09-01'::date, '2026-09-01'::date),
  ('V8A799', 'COPIAR_EXCEL', '2026-10-01'::date, '2026-09-16'::date, '2026-09-16'::date, '2026-09-16'::date),
  ('V9T961', 'COPIAR_EXCEL', '2026-09-16'::date, '2026-09-01'::date, '2026-09-01'::date, '2026-09-01'::date),
  ('V9U834', 'COPIAR_EXCEL', '2026-10-01'::date, '2026-09-16'::date, '2026-09-16'::date, '2026-09-16'::date),
  ('V7L872', 'COPIAR_EXCEL', '2026-11-01'::date, '2026-10-16'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('VCP879', 'COPIAR_EXCEL', '2026-12-16'::date, '2026-12-01'::date, '2026-12-01'::date, '2026-12-01'::date),
  ('V8A796', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V0R757', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V0R915', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V0R941', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V6V880', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V7L943', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V8A809', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('V9V867', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('VBU734', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('VCW921', 'ALTA_M1', '2026-10-16'::date, '2026-10-01'::date, '2026-10-16'::date, '2026-10-16'::date),
  ('VAM846', 'VENDIDA', NULL, NULL, NULL, NULL);
CREATE TEMP TABLE _ti_plan(placa_clave text,quincena date,nivel text,origen text,
 PRIMARY KEY(placa_clave,quincena)) ON COMMIT DROP;
INSERT INTO _ti_plan VALUES
  ('B6Z714', '2026-09-16'::date, 'M1', 'TI-PR-01!R169'),
  ('B6Z714', '2026-10-01'::date, 'M1', 'TI-PR-01!S169'),
  ('B6Z714', '2026-10-16'::date, 'M1', 'TI-PR-01!T169'),
  ('B6Z714', '2026-11-01'::date, 'M1', 'TI-PR-01!U169'),
  ('B6Z714', '2026-11-16'::date, 'M1', 'TI-PR-01!V169'),
  ('B6Z714', '2026-12-01'::date, 'M2', 'TI-PR-01!W169'),
  ('B6Z714', '2026-12-16'::date, 'M1', 'TI-PR-01!X169'),
  ('B8D793', '2026-09-16'::date, 'M1', 'TI-PR-01!R170'),
  ('B8D793', '2026-10-01'::date, 'M1', 'TI-PR-01!S170'),
  ('B8D793', '2026-10-16'::date, 'M1', 'TI-PR-01!T170'),
  ('B8D793', '2026-11-01'::date, 'M1', 'TI-PR-01!U170'),
  ('B8D793', '2026-11-16'::date, 'M1', 'TI-PR-01!V170'),
  ('B8D793', '2026-12-01'::date, 'M2', 'TI-PR-01!W170'),
  ('B8D793', '2026-12-16'::date, 'M1', 'TI-PR-01!X170'),
  ('BJB753', '2026-09-01'::date, 'M1', 'TI-PR-01!Q55'),
  ('BJB753', '2026-09-16'::date, 'M1', 'TI-PR-01!R55'),
  ('BJB753', '2026-10-01'::date, 'M1', 'TI-PR-01!S55'),
  ('BJB753', '2026-10-16'::date, 'M2', 'TI-PR-01!T55'),
  ('BJB753', '2026-11-01'::date, 'M1', 'TI-PR-01!U55'),
  ('BJB753', '2026-11-16'::date, 'M1', 'TI-PR-01!V55'),
  ('BJB753', '2026-12-01'::date, 'M1', 'TI-PR-01!W55'),
  ('BJB753', '2026-12-16'::date, 'M1', 'TI-PR-01!X55'),
  ('BUW928', '2026-09-16'::date, 'M1', 'TI-PR-01!R61'),
  ('BUW928', '2026-10-01'::date, 'M1', 'TI-PR-01!S61'),
  ('BUW928', '2026-10-16'::date, 'M1', 'TI-PR-01!T61'),
  ('BUW928', '2026-11-01'::date, 'M1', 'TI-PR-01!U61'),
  ('BUW928', '2026-11-16'::date, 'M1', 'TI-PR-01!V61'),
  ('BUW928', '2026-12-01'::date, 'M2', 'TI-PR-01!W61'),
  ('BUW928', '2026-12-16'::date, 'M1', 'TI-PR-01!X61'),
  ('V8A799', '2026-10-01'::date, 'M1', 'TI-PR-01!S37'),
  ('V8A799', '2026-10-16'::date, 'M1', 'TI-PR-01!T37'),
  ('V8A799', '2026-11-01'::date, 'M1', 'TI-PR-01!U37'),
  ('V8A799', '2026-11-16'::date, 'M1', 'TI-PR-01!V37'),
  ('V8A799', '2026-12-01'::date, 'M1', 'TI-PR-01!W37'),
  ('V8A799', '2026-12-16'::date, 'M2', 'TI-PR-01!X37'),
  ('V9T961', '2026-09-16'::date, 'M1', 'TI-PR-01!R175'),
  ('V9T961', '2026-10-01'::date, 'M1', 'TI-PR-01!S175'),
  ('V9T961', '2026-10-16'::date, 'M1', 'TI-PR-01!T175'),
  ('V9T961', '2026-11-01'::date, 'M1', 'TI-PR-01!U175'),
  ('V9T961', '2026-11-16'::date, 'M1', 'TI-PR-01!V175'),
  ('V9T961', '2026-12-01'::date, 'M2', 'TI-PR-01!W175'),
  ('V9T961', '2026-12-16'::date, 'M1', 'TI-PR-01!X175'),
  ('V9U834', '2026-10-01'::date, 'M1', 'TI-PR-01!S176'),
  ('V9U834', '2026-10-16'::date, 'M1', 'TI-PR-01!T176'),
  ('V9U834', '2026-11-01'::date, 'M1', 'TI-PR-01!U176'),
  ('V9U834', '2026-11-16'::date, 'M1', 'TI-PR-01!V176'),
  ('V9U834', '2026-12-01'::date, 'M1', 'TI-PR-01!W176'),
  ('V9U834', '2026-12-16'::date, 'M2', 'TI-PR-01!X176'),
  ('V7L872', '2026-11-01'::date, 'M1', 'TI-PR-01!U26'),
  ('V7L872', '2026-11-16'::date, 'M1', 'TI-PR-01!V26'),
  ('V7L872', '2026-12-01'::date, 'M1', 'TI-PR-01!W26'),
  ('V7L872', '2026-12-16'::date, 'M1', 'TI-PR-01!X26'),
  ('VCP879', '2026-12-16'::date, 'M1', 'TI-PR-01!X99'),
  ('V8A796', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A796', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A796', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A796', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A796', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R757', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R757', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R757', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R757', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R757', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R915', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R915', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R915', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R915', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R915', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R941', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R941', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R941', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R941', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V0R941', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V6V880', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V6V880', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V6V880', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V6V880', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V6V880', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V7L943', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V7L943', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V7L943', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V7L943', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V7L943', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A809', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A809', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A809', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A809', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V8A809', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V9V867', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V9V867', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V9V867', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V9V867', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('V9V867', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VBU734', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VBU734', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VBU734', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VBU734', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VBU734', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VCW921', '2026-10-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VCW921', '2026-11-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VCW921', '2026-11-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VCW921', '2026-12-01'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026'),
  ('VCW921', '2026-12-16'::date, 'M1', 'ALTA M1 AUTORIZADA 19/10/2026');
CREATE TEMP TABLE _ti_ctx(programa_id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _ti_ctx SELECT id FROM public.programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO';

CREATE TABLE IF NOT EXISTS public.ti_pr01_correcciones(
 lote text PRIMARY KEY,aplicado_en timestamptz NOT NULL DEFAULT now(),
 aplicado_por text NOT NULL DEFAULT current_user,alcance jsonb NOT NULL,
 respaldo jsonb NOT NULL,resultado jsonb NOT NULL DEFAULT '{}'::jsonb);
DO $validar$
DECLARE n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_programacion_19102026_v1') THEN
   RAISE EXCEPTION 'Este lote ya fue aplicado. Ejecute 03_Verificar_programacion_19102026.sql; no vuelva a cargarlo.';
 END IF;
 IF (SELECT count(*) FROM _ti_ctx)<>1 THEN RAISE EXCEPTION 'Debe existir un único TI-PR-01 activo.'; END IF;
 IF (SELECT count(*) FROM _ti_objetivo)<>20 OR (SELECT count(*) FROM _ti_plan)<>103 THEN
   RAISE EXCEPTION 'Alcance de corrección incompleto: se esperan 20 placas y 103 quincenas regulares.'; END IF;
 IF EXISTS(SELECT 1 FROM _ti_objetivo t WHERE
   (SELECT count(*) FROM public.vehiculos v WHERE regexp_replace(upper(btrim(v.placa)),'[-[:space:]]','','g')=t.placa_clave)<>1) THEN
   RAISE EXCEPTION 'Hay placas ausentes o duplicadas por formato en flota. No se modificó nada.'; END IF;
 IF EXISTS(SELECT 1 FROM _ti_objetivo t WHERE
   (SELECT count(*) FROM public.programa_mantenimiento_unidades u WHERE u.programa_id=(SELECT programa_id FROM _ti_ctx)
    AND regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=t.placa_clave)<>1) THEN
   RAISE EXCEPTION 'Hay unidades ausentes o duplicadas dentro del programa. No se modificó nada.'; END IF;
END $validar$;

CREATE TEMP TABLE _ti_unidades ON COMMIT DROP AS
 SELECT t.*,u.id AS unidad_id,u.placa,u.programa_id FROM _ti_objetivo t
 JOIN public.programa_mantenimiento_unidades u ON u.programa_id=(SELECT programa_id FROM _ti_ctx)
  AND regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=t.placa_clave;
DO $precondiciones$
BEGIN
 IF EXISTS(SELECT 1 FROM public.ordenes_trabajo o JOIN public.programacion_mantenimiento p ON p.id=o.programacion_id
  JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id) THEN
   RAISE EXCEPTION 'Alguna unidad ahora tiene una OT. Se detuvo el lote para conservar su alcance e historial.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento p JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id
  WHERE p.estado<>'CANCELADO' AND (p.estado<>'PROYECTADO' OR p.quincena_reprogramada IS NOT NULL OR p.fecha_ejecucion IS NOT NULL)) THEN
   RAISE EXCEPTION 'Una visita cambió desde el diagnóstico. Se requiere revisar el estado actual.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento_equipos e JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id
  JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id
  WHERE p.estado<>'CANCELADO' AND e.tipo_equipo NOT IN ('GPS','ADAS')) THEN
   RAISE EXCEPTION 'Ya existe alcance regular en una de las visitas: no se sobrescribirá.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento_ajustes a JOIN _ti_unidades u ON u.unidad_id=a.programa_unidad_id) THEN
   RAISE EXCEPTION 'Hay ajustes posteriores al diagnóstico; revise la programación antes de aplicar este lote.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programa_mantenimiento_unidad_ciclos c JOIN _ti_unidades u ON u.unidad_id=c.programa_unidad_id
  WHERE u.accion<>'VENDIDA' AND c.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE')
   AND (c.ultima_quincena IS NOT NULL OR c.ultima_fecha_real IS NOT NULL OR c.orden_trabajo_detalle_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'Apareció un ciclo regular real. No se reemplazarán ejecuciones con anclas manuales.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programa_mantenimiento_unidad_anclas a JOIN _ti_unidades u ON u.unidad_id=a.programa_unidad_id
  WHERE u.accion<>'VENDIDA' AND a.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE')) THEN
   RAISE EXCEPTION 'Aparecieron anclas regulares desde el diagnóstico. No se sobrescribirán.'; END IF;
 IF EXISTS(SELECT 1 FROM _ti_unidades u JOIN public.programa_mantenimiento_unidades p ON p.id=u.unidad_id
  WHERE u.accion<>'VENDIDA' AND p.quincena_incorporacion IS NOT NULL AND p.quincena_incorporacion<>u.incorporacion) THEN
   RAISE EXCEPTION 'La incorporación de una unidad cambió respecto al diagnóstico.'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('CAMARAS'),('COPILOTO'),('RADIO_BASE')) f(tipo)
  CROSS JOIN (VALUES ('M1',1),('M2',6),('M3',12)) n(nivel,frecuencia)
  WHERE (SELECT count(*) FROM public.programa_mantenimiento_frecuencias x
   WHERE x.programa_id=(SELECT programa_id FROM _ti_ctx) AND x.tipo_equipo=f.tipo
    AND x.nivel_mantenimiento=n.nivel AND x.frecuencia_quincenas=n.frecuencia)<>1) THEN
   RAISE EXCEPTION 'Las frecuencias deben ser M1=1, M2=6 y M3=12 quincenas en las tres familias.'; END IF;
 IF EXISTS(SELECT 1 FROM _ti_plan d WHERE d.quincena>DATE '2026-12-31' OR d.quincena<DATE '2026-09-01') THEN
   RAISE EXCEPTION 'Calendario fuera del periodo autorizado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.programas_mantenimiento_versiones v WHERE v.programa_id=(SELECT programa_id FROM _ti_ctx)
   AND v.estado='VIGENTE' AND v.periodo_inicio=DATE '2026-09-01' AND v.periodo_fin=DATE '2026-12-31') THEN
   RAISE EXCEPTION 'La versión y el periodo cambiaron desde el diagnóstico.'; END IF;
END $precondiciones$;

INSERT INTO public.ti_pr01_correcciones(lote,alcance,respaldo)
SELECT 'ti_pr01_programacion_19102026_v1',
 jsonb_build_object('unidades',(SELECT jsonb_agg(to_jsonb(u) ORDER BY placa_clave) FROM _ti_unidades u),
                   'calendario',(SELECT jsonb_agg(to_jsonb(d) ORDER BY placa_clave,quincena) FROM _ti_plan d),
                   'confirmacion','Las 19 unidades tienen CAMARAS, COPILOTO y RADIO_BASE; confirmado por Pedro el 19/10/2026'),
 jsonb_build_object(
 'vehiculos',(SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.placa),'[]'::jsonb) FROM public.vehiculos v JOIN _ti_unidades u ON u.placa=v.placa),
 'unidades',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidades p JOIN _ti_unidades u ON u.unidad_id=p.id),
 'inventario',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.vehiculo_equipos e JOIN _ti_unidades u ON u.placa=e.placa),
 'anclas',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_anclas a JOIN _ti_unidades u ON u.unidad_id=a.programa_unidad_id),
 'ciclos',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_ciclos c JOIN _ti_unidades u ON u.unidad_id=c.programa_unidad_id),
 'visitas',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM public.programacion_mantenimiento p JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id),
 'equipos',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.programacion_mantenimiento_equipos e JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id));

-- Alcance declarado del programa, separado del inventario físico de cámaras.
ALTER TABLE public.programa_mantenimiento_unidades
 ADD COLUMN IF NOT EXISTS habilitado boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS familias_confirmadas text[] NOT NULL DEFAULT ARRAY[]::text[];
DO $dominio$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.programa_mantenimiento_unidades'::regclass AND conname='chk_unidad_familias_confirmadas') THEN
  ALTER TABLE public.programa_mantenimiento_unidades ADD CONSTRAINT chk_unidad_familias_confirmadas
  CHECK(familias_confirmadas <@ ARRAY['CAMARAS','COPILOTO','RADIO_BASE']::text[] AND array_position(familias_confirmadas,NULL) IS NULL);
 END IF;
END $dominio$;
COMMENT ON COLUMN public.programa_mantenimiento_unidades.familias_confirmadas IS
 'Presencia confirmada de familias regulares para este programa. No identifica cámara interna/externa ni crea datos técnicos de inventario. GPS/ADAS conservan su aplicabilidad independiente.';
COMMENT ON COLUMN public.programa_mantenimiento_unidades.habilitado IS
 'Participación operativa en el programa. Una baja conserva unidad, ciclos y visitas históricas.';

UPDATE public.programa_mantenimiento_unidades p
 SET habilitado=true,familias_confirmadas=ARRAY['CAMARAS','COPILOTO','RADIO_BASE']::text[],
     quincena_incorporacion=COALESCE(p.quincena_incorporacion,u.incorporacion),
     observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),
      '[19/10/2026] Alcance confirmado: CAMARAS, COPILOTO y RADIO_BASE. Cámaras: ubicación interna/externa pendiente de precisar. Lote ti_pr01_programacion_19102026_v1.')
 FROM _ti_unidades u WHERE p.id=u.unidad_id AND u.accion<>'VENDIDA';

-- Copiloto y radio tienen identificación física inequívoca. Se preservan sus datos técnicos.
INSERT INTO public.vehiculo_equipos(placa,tipo_equipo,estado_inventario,fuente,observaciones)
 SELECT u.placa,t.tipo,'INSTALADO','ERP','Presencia confirmada el 19/10/2026. Lote ti_pr01_programacion_19102026_v1.'
 FROM _ti_unidades u CROSS JOIN (VALUES ('COPILOTO'),('RADIO_BASE')) t(tipo)
 WHERE u.accion<>'VENDIDA'
 ON CONFLICT(placa,tipo_equipo) DO UPDATE SET estado_inventario='INSTALADO',fuente='ERP',
 observaciones=concat_ws(E'\n',NULLIF(vehiculo_equipos.observaciones,''),EXCLUDED.observaciones);

INSERT INTO public.programa_mantenimiento_unidad_anclas
 (programa_unidad_id,programa_id,tipo_equipo,nivel_mantenimiento,quincena_ancla,origen,observaciones)
 SELECT u.unidad_id,u.programa_id,f.tipo,n.nivel,
 CASE n.nivel WHEN 'M1' THEN u.ancla_m1 WHEN 'M2' THEN u.ancla_m2 ELSE u.ancla_m3 END,
 'MANUAL','Referencia de planificación autorizada; no es ejecución. Lote ti_pr01_programacion_19102026_v1.'
 FROM _ti_unidades u CROSS JOIN (VALUES ('CAMARAS'),('COPILOTO'),('RADIO_BASE')) f(tipo)
 CROSS JOIN (VALUES ('M1'),('M2'),('M3')) n(nivel) WHERE u.accion<>'VENDIDA';

-- Las seis quincenas de septiembre anteriores a la vigencia documental conservan
-- version_programa_id NULL, conforme al contrato nullable del generador. No se inventa otra versión.
INSERT INTO public.programacion_mantenimiento
 (programa_unidad_id,programa_id,version_programa_id,quincena_programada,estado,observaciones)
 SELECT u.unidad_id,u.programa_id,
  (SELECT v.id FROM public.programas_mantenimiento_versiones v WHERE v.programa_id=u.programa_id
    AND v.estado IN ('VIGENTE','SUPERSEDIDA') AND v.vigencia_desde<=d.quincena
    AND (v.vigencia_hasta IS NULL OR d.quincena<v.vigencia_hasta)),
  d.quincena,'PROYECTADO',concat('Programación autorizada: ',d.origen,'. Lote ti_pr01_programacion_19102026_v1.')
 FROM _ti_plan d JOIN _ti_unidades u ON u.placa_clave=d.placa_clave
 WHERE NOT EXISTS(SELECT 1 FROM public.programacion_mantenimiento p WHERE p.programa_unidad_id=u.unidad_id
   AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO');

-- Una visita puede contener regular y GPS/ADAS. Se conserva el ID y todo el alcance anual.
INSERT INTO public.programacion_mantenimiento_equipos(programacion_id,programa_id,tipo_equipo,nivel_mantenimiento)
 SELECT p.id,u.programa_id,f.tipo,d.nivel FROM _ti_plan d JOIN _ti_unidades u ON u.placa_clave=d.placa_clave
 JOIN public.programacion_mantenimiento p ON p.programa_unidad_id=u.unidad_id AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO'
 CROSS JOIN (VALUES ('CAMARAS'),('COPILOTO'),('RADIO_BASE')) f(tipo);

-- Baja administrativa: conserva el GPS histórico y cancela la visita pendiente, sin eliminarla.
UPDATE public.programacion_mantenimiento p SET estado='CANCELADO',
 observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),'Cancelación administrativa: VAM-846 vendida, informado el 19/10/2026. Lote ti_pr01_programacion_19102026_v1.')
 FROM _ti_unidades u WHERE p.programa_unidad_id=u.unidad_id AND u.accion='VENDIDA'
 AND p.estado IN ('PROYECTADO','PROGRAMADO','REPROGRAMADO');
UPDATE public.programa_mantenimiento_unidades p SET habilitado=false,
 observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),'Unidad vendida: baja operativa del programa el 19/10/2026. Lote ti_pr01_programacion_19102026_v1.')
 FROM _ti_unidades u WHERE p.id=u.unidad_id AND u.accion='VENDIDA';
UPDATE public.vehiculos v SET activo=false FROM _ti_unidades u WHERE v.placa=u.placa AND u.accion='VENDIDA';

DO $comprobar$
DECLARE b jsonb;
BEGIN
 IF (SELECT count(*) FROM public.programacion_mantenimiento p JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id
  JOIN _ti_plan d ON d.placa_clave=u.placa_clave AND d.quincena=p.quincena_efectiva
  JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
  WHERE p.estado<>'CANCELADO' AND e.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE') AND e.nivel_mantenimiento=d.nivel)<>309 THEN
   RAISE EXCEPTION 'No se obtuvieron los 309 detalles esperados. Se revierte el lote completo.'; END IF;
 IF (SELECT count(*) FROM public.programa_mantenimiento_unidad_anclas a JOIN _ti_unidades u ON u.unidad_id=a.programa_unidad_id
   WHERE u.accion<>'VENDIDA' AND a.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE'))<>171 THEN
   RAISE EXCEPTION 'No se obtuvieron las 171 anclas esperadas.'; END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento p JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id
   WHERE u.accion='VENDIDA' AND p.estado<>'CANCELADO') THEN RAISE EXCEPTION 'La unidad vendida conserva visitas activas.'; END IF;
 SELECT respaldo INTO b FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_programacion_19102026_v1';
 IF (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_ciclos c
   JOIN _ti_unidades u ON u.unidad_id=c.programa_unidad_id) IS DISTINCT FROM b->'ciclos' THEN
   RAISE EXCEPTION 'Los ciclos cambiaron: este lote no puede escribir ejecuciones.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'equipos') x
   LEFT JOIN public.programacion_mantenimiento_equipos e ON e.id=(x->>'id')::integer
   WHERE x->>'tipo_equipo' IN ('GPS','ADAS') AND to_jsonb(e) IS DISTINCT FROM x) THEN
   RAISE EXCEPTION 'Se alteró un detalle anual existente.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'inventario') x
   LEFT JOIN public.vehiculo_equipos e ON e.id=(x->>'id')::integer
   WHERE x->>'tipo_equipo' NOT IN ('COPILOTO','RADIO_BASE') AND to_jsonb(e) IS DISTINCT FROM x) THEN
   RAISE EXCEPTION 'Se alteró inventario fuera del alcance confirmado.'; END IF;
END $comprobar$;
UPDATE public.ti_pr01_correcciones SET resultado=jsonb_build_object(
 'programas_excel',9,'altas_m1',10,'primera_quincena_nuevas','2026-10-16',
 'quincenas_regulares',103,'detalles_regulares',309,'anclas',171,'bajas',1,
 'visitas_creadas',(SELECT count(*) FROM public.programacion_mantenimiento p JOIN _ti_unidades u ON u.unidad_id=p.programa_unidad_id
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(respaldo->'visitas') x WHERE (x->>'id')::integer=p.id)))
WHERE lote='ti_pr01_programacion_19102026_v1';
COMMIT;
SELECT lote,aplicado_en,resultado::text AS resultado FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_programacion_19102026_v1';
