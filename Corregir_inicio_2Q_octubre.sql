-- Ejecutar desde backend: node scripts/ejecutar-sql.js ../Corregir_inicio_2Q_octubre.sql
-- Corrige datos ya cargados. No vuelva a ejecutar el instalador del lote anterior.

-- Corrección del inicio de las NUEVE unidades copiadas del Excel.
-- La primera casilla de cada secuencia se sitúa el 16/10/2026.
-- Las frecuencias se mantienen por quincenas; no se escriben ejecuciones.
-- Ejecutar DESPUÉS del lote ti_pr01_programacion_19102026_v1 ya aplicado.
BEGIN;
SET LOCAL TIME ZONE 'America/Lima';
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(hashtext('ti_pr01_programacion_19102026_v1'));
LOCK TABLE public.ti_pr01_correcciones, public.programas_mantenimiento,
 public.programas_mantenimiento_versiones, public.programa_mantenimiento_unidades,
 public.programa_mantenimiento_frecuencias, public.programa_mantenimiento_unidad_anclas,
 public.programa_mantenimiento_unidad_ciclos, public.programacion_mantenimiento,
 public.programacion_mantenimiento_equipos, public.programacion_mantenimiento_ajustes,
 public.ordenes_trabajo IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _inicio_objetivo(placa_clave text PRIMARY KEY,inicio_anterior date,
 ancla_anterior date,ancla_m1 date,ancla_m2 date,ancla_m3 date) ON COMMIT DROP;
INSERT INTO _inicio_objetivo VALUES
('B6Z714', DATE '2026-09-16', DATE '2026-09-01', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('B8D793', DATE '2026-09-16', DATE '2026-09-01', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('BJB753', DATE '2026-09-01', DATE '2026-07-16', DATE '2026-10-01', DATE '2026-09-01', DATE '2026-09-01'),
 ('BUW928', DATE '2026-09-16', DATE '2026-09-01', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('V8A799', DATE '2026-10-01', DATE '2026-09-16', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('V9T961', DATE '2026-09-16', DATE '2026-09-01', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('V9U834', DATE '2026-10-01', DATE '2026-09-16', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('V7L872', DATE '2026-11-01', DATE '2026-10-16', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01'),
 ('VCP879', DATE '2026-12-16', DATE '2026-12-01', DATE '2026-10-01', DATE '2026-10-01', DATE '2026-10-01');
CREATE TEMP TABLE _inicio_calendario(placa_clave text,quincena date,nivel text,
 PRIMARY KEY(placa_clave,quincena)) ON COMMIT DROP;
INSERT INTO _inicio_calendario VALUES
('B6Z714', DATE '2026-10-16', 'M1'),
 ('B6Z714', DATE '2026-11-01', 'M1'),
 ('B6Z714', DATE '2026-11-16', 'M1'),
 ('B6Z714', DATE '2026-12-01', 'M1'),
 ('B6Z714', DATE '2026-12-16', 'M1'),
 ('B8D793', DATE '2026-10-16', 'M1'),
 ('B8D793', DATE '2026-11-01', 'M1'),
 ('B8D793', DATE '2026-11-16', 'M1'),
 ('B8D793', DATE '2026-12-01', 'M1'),
 ('B8D793', DATE '2026-12-16', 'M1'),
 ('BJB753', DATE '2026-10-16', 'M1'),
 ('BJB753', DATE '2026-11-01', 'M1'),
 ('BJB753', DATE '2026-11-16', 'M1'),
 ('BJB753', DATE '2026-12-01', 'M2'),
 ('BJB753', DATE '2026-12-16', 'M1'),
 ('BUW928', DATE '2026-10-16', 'M1'),
 ('BUW928', DATE '2026-11-01', 'M1'),
 ('BUW928', DATE '2026-11-16', 'M1'),
 ('BUW928', DATE '2026-12-01', 'M1'),
 ('BUW928', DATE '2026-12-16', 'M1'),
 ('V8A799', DATE '2026-10-16', 'M1'),
 ('V8A799', DATE '2026-11-01', 'M1'),
 ('V8A799', DATE '2026-11-16', 'M1'),
 ('V8A799', DATE '2026-12-01', 'M1'),
 ('V8A799', DATE '2026-12-16', 'M1'),
 ('V9T961', DATE '2026-10-16', 'M1'),
 ('V9T961', DATE '2026-11-01', 'M1'),
 ('V9T961', DATE '2026-11-16', 'M1'),
 ('V9T961', DATE '2026-12-01', 'M1'),
 ('V9T961', DATE '2026-12-16', 'M1'),
 ('V9U834', DATE '2026-10-16', 'M1'),
 ('V9U834', DATE '2026-11-01', 'M1'),
 ('V9U834', DATE '2026-11-16', 'M1'),
 ('V9U834', DATE '2026-12-01', 'M1'),
 ('V9U834', DATE '2026-12-16', 'M1'),
 ('V7L872', DATE '2026-10-16', 'M1'),
 ('V7L872', DATE '2026-11-01', 'M1'),
 ('V7L872', DATE '2026-11-16', 'M1'),
 ('V7L872', DATE '2026-12-01', 'M1'),
 ('V7L872', DATE '2026-12-16', 'M1'),
 ('VCP879', DATE '2026-10-16', 'M1'),
 ('VCP879', DATE '2026-11-01', 'M1'),
 ('VCP879', DATE '2026-11-16', 'M1'),
 ('VCP879', DATE '2026-12-01', 'M1'),
 ('VCP879', DATE '2026-12-16', 'M1');
DO $validar$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_programacion_19102026_v1') THEN
  RAISE EXCEPTION 'Primero debe constar el lote de programación ya aplicado el 19/10/2026.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_inicio_octubre_19102026_v2') THEN
  RAISE EXCEPTION 'Esta corrección del inicio ya fue aplicada. No se repite.';
 END IF;
 IF (SELECT count(*) FROM public.programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO')<>1 THEN
  RAISE EXCEPTION 'Debe existir un único TI-PR-01 activo.';
 END IF;
 IF EXISTS(SELECT 1 FROM _inicio_objetivo x WHERE
  (SELECT count(*) FROM public.programa_mantenimiento_unidades u
   JOIN public.programas_mantenimiento p ON p.id=u.programa_id
   WHERE p.codigo='TI-PR-01' AND p.estado='ACTIVO'
    AND regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=x.placa_clave)<>1) THEN
  RAISE EXCEPTION 'Falta alguna unidad o hay duplicados por formato.';
 END IF;
END $validar$;
CREATE TEMP TABLE _inicio_unidades ON COMMIT DROP AS
 SELECT x.*,u.id AS unidad_id,u.placa,u.programa_id FROM _inicio_objetivo x
 JOIN public.programa_mantenimiento_unidades u
  ON regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=x.placa_clave
 JOIN public.programas_mantenimiento p ON p.id=u.programa_id
 WHERE p.codigo='TI-PR-01' AND p.estado='ACTIVO';
CREATE TEMP TABLE _inicio_anterior ON COMMIT DROP AS
 SELECT x.placa_clave,x.quincena,x.nivel FROM public.ti_pr01_correcciones b,
 jsonb_to_recordset(b.alcance->'calendario') x(placa_clave text,quincena date,nivel text)
 WHERE b.lote='ti_pr01_programacion_19102026_v1'
 AND x.placa_clave IN(SELECT placa_clave FROM _inicio_objetivo);
DO $precondiciones$
BEGIN
 IF (SELECT count(*) FROM _inicio_anterior)<>53 THEN
  RAISE EXCEPTION 'El calendario anterior no coincide con las 53 quincenas respaldadas.';
 END IF;
 IF EXISTS(SELECT 1 FROM _inicio_unidades x JOIN public.programa_mantenimiento_unidades u ON u.id=x.unidad_id
  WHERE u.quincena_incorporacion IS DISTINCT FROM x.inicio_anterior OR NOT u.habilitado
   OR NOT ARRAY['CAMARAS','COPILOTO','RADIO_BASE']::text[] <@ u.familias_confirmadas) THEN
  RAISE EXCEPTION 'Cambió la incorporación, habilitación o alcance confirmado de una unidad.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.ordenes_trabajo o JOIN public.programacion_mantenimiento p ON p.id=o.programacion_id
  JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id) THEN
  RAISE EXCEPTION 'Una de las nueve unidades ya tiene OT. Se conserva todo y no se aplica la corrección.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento p JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
  WHERE p.estado<>'CANCELADO' AND (p.estado<>'PROYECTADO' OR p.quincena_reprogramada IS NOT NULL
   OR p.fecha_ejecucion IS NOT NULL OR p.nivel_regular_forzado IS NOT NULL OR p.planificacion_ajustada)) THEN
  RAISE EXCEPTION 'Una visita fue programada, reprogramada, ajustada o ejecutada después del lote anterior.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento_ajustes a
  JOIN _inicio_unidades u ON u.unidad_id=a.programa_unidad_id) THEN
  RAISE EXCEPTION 'Hay ajustes posteriores. No se reemplazarán.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.programa_mantenimiento_unidad_ciclos c
  JOIN _inicio_unidades u ON u.unidad_id=c.programa_unidad_id
  WHERE c.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE') AND
   (c.ultima_quincena IS NOT NULL OR c.ultima_fecha_real IS NOT NULL OR c.orden_trabajo_detalle_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'Hay ciclos regulares reales. No se reemplazarán con planificación.';
 END IF;
 IF (SELECT count(*) FROM public.programa_mantenimiento_unidad_anclas a
  JOIN _inicio_unidades u ON u.unidad_id=a.programa_unidad_id
  WHERE a.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE') AND a.nivel_mantenimiento IN('M1','M2','M3')
   AND a.quincena_ancla=u.ancla_anterior AND a.origen='MANUAL'
   AND a.observaciones LIKE '%ti_pr01_programacion_19102026_v1%')<>81 THEN
  RAISE EXCEPTION 'Las 81 referencias ya no coinciden con el lote anterior.';
 END IF;
 IF (SELECT count(*) FROM public.programacion_mantenimiento p
  JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
  JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
  JOIN _inicio_anterior d ON d.placa_clave=u.placa_clave AND d.quincena=p.quincena_efectiva
   AND d.nivel=e.nivel_mantenimiento
  WHERE p.estado<>'CANCELADO' AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE'))<>159
  OR (SELECT count(*) FROM public.programacion_mantenimiento p
   JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
   JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
   WHERE p.estado<>'CANCELADO' AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE'))<>159 THEN
  RAISE EXCEPTION 'La programación regular cambió desde el lote anterior. No se sobrescribirá.';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('CAMARAS'),('COPILOTO'),('RADIO_BASE')) f(tipo)
  CROSS JOIN (VALUES('M1',1),('M2',6),('M3',12)) n(nivel,frecuencia)
  WHERE (SELECT count(*) FROM public.programa_mantenimiento_frecuencias x
   WHERE x.programa_id=(SELECT programa_id FROM _inicio_unidades LIMIT 1)
    AND x.tipo_equipo=f.tipo AND x.nivel_mantenimiento=n.nivel
    AND x.frecuencia_quincenas=n.frecuencia)<>1) THEN
  RAISE EXCEPTION 'Las frecuencias ya no son 1, 6 y 12 quincenas.';
 END IF;
END $precondiciones$;

INSERT INTO public.ti_pr01_correcciones(lote,alcance,respaldo)
SELECT 'ti_pr01_inicio_octubre_19102026_v2',
 jsonb_build_object('unidades',(SELECT jsonb_agg(to_jsonb(u) ORDER BY placa_clave) FROM _inicio_unidades u),
 'calendario',(SELECT jsonb_agg(to_jsonb(d) ORDER BY placa_clave,quincena) FROM _inicio_calendario d),
 'criterio','Primera casilla de cada secuencia del Excel el 16/10/2026; conserva niveles, orden y frecuencias.'),
 jsonb_build_object(
 'unidades',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.programa_mantenimiento_unidades u JOIN _inicio_unidades x ON x.unidad_id=u.id),
 'anclas',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.programa_mantenimiento_unidad_anclas a JOIN _inicio_unidades u ON u.unidad_id=a.programa_unidad_id),
 'ciclos',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_ciclos c JOIN _inicio_unidades u ON u.unidad_id=c.programa_unidad_id),
 'visitas',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.programacion_mantenimiento p JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id),
 'equipos',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.programacion_mantenimiento_equipos e JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id));

UPDATE public.programa_mantenimiento_unidades p
 SET quincena_incorporacion=DATE '2026-10-16',
 observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),
 'Inicio corregido: 16/10/2026; se traslada la secuencia del Excel. Lote ti_pr01_inicio_octubre_19102026_v2.')
 FROM _inicio_unidades u WHERE p.id=u.unidad_id;
UPDATE public.programa_mantenimiento_unidad_anclas a SET quincena_ancla=
 CASE a.nivel_mantenimiento WHEN 'M1' THEN u.ancla_m1 WHEN 'M2' THEN u.ancla_m2 ELSE u.ancla_m3 END,
 observaciones=concat_ws(E'\n',a.observaciones,
 'Secuencia trasladada para iniciar el 16/10/2026. Lote ti_pr01_inicio_octubre_19102026_v2.')
 FROM _inicio_unidades u WHERE a.programa_unidad_id=u.unidad_id
 AND a.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE') AND a.nivel_mantenimiento IN('M1','M2','M3');

-- Conserva las filas anteriores como canceladas. Nunca mueve el GPS/ADAS.
UPDATE public.programacion_mantenimiento p SET estado='CANCELADO',
 observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),
 'Inicio corregido a segunda quincena de octubre. Lote ti_pr01_inicio_octubre_19102026_v2.')
 FROM _inicio_unidades u WHERE p.programa_unidad_id=u.unidad_id AND p.estado<>'CANCELADO'
 AND NOT EXISTS(SELECT 1 FROM _inicio_calendario d WHERE d.placa_clave=u.placa_clave AND d.quincena=p.quincena_efectiva)
 AND EXISTS(SELECT 1 FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=p.id
  AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE'))
 AND NOT EXISTS(SELECT 1 FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=p.id
  AND e.tipo_equipo NOT IN('CAMARAS','COPILOTO','RADIO_BASE'));

-- Si hubiera una anualidad compartida fuera del calendario regular, se retira
-- exclusivamente el alcance regular de esa visita, sin tocar la anualidad.
DELETE FROM public.programacion_mantenimiento_equipos e
 USING public.programacion_mantenimiento p,_inicio_unidades u
 WHERE e.programacion_id=p.id AND p.programa_unidad_id=u.unidad_id
 AND p.estado<>'CANCELADO' AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE')
 AND NOT EXISTS(SELECT 1 FROM _inicio_calendario d WHERE d.placa_clave=u.placa_clave AND d.quincena=p.quincena_efectiva);

INSERT INTO public.programacion_mantenimiento(programa_unidad_id,programa_id,
 version_programa_id,quincena_programada,estado,observaciones)
 SELECT u.unidad_id,u.programa_id,
 (SELECT v.id FROM public.programas_mantenimiento_versiones v WHERE v.programa_id=u.programa_id
  AND v.estado IN('VIGENTE','SUPERSEDIDA') AND v.vigencia_desde<=d.quincena
  AND (v.vigencia_hasta IS NULL OR d.quincena<v.vigencia_hasta)),
 d.quincena,'PROYECTADO','Secuencia del Excel desde 16/10/2026. Lote ti_pr01_inicio_octubre_19102026_v2.'
 FROM _inicio_calendario d JOIN _inicio_unidades u ON u.placa_clave=d.placa_clave
 WHERE NOT EXISTS(SELECT 1 FROM public.programacion_mantenimiento p
  WHERE p.programa_unidad_id=u.unidad_id AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO');
INSERT INTO public.programacion_mantenimiento_equipos(programacion_id,programa_id,tipo_equipo,nivel_mantenimiento)
 SELECT p.id,u.programa_id,f.tipo,d.nivel FROM _inicio_calendario d
 JOIN _inicio_unidades u ON u.placa_clave=d.placa_clave
 JOIN public.programacion_mantenimiento p ON p.programa_unidad_id=u.unidad_id
  AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO'
 CROSS JOIN (VALUES('CAMARAS'),('COPILOTO'),('RADIO_BASE')) f(tipo)
 ON CONFLICT(programacion_id,tipo_equipo) DO UPDATE
 SET nivel_mantenimiento=EXCLUDED.nivel_mantenimiento;

DO $comprobar$
DECLARE b jsonb;
BEGIN
 IF (SELECT count(*) FROM _inicio_calendario)<>45 OR
 (SELECT count(*) FROM public.programacion_mantenimiento p
  JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
  JOIN _inicio_calendario d ON d.placa_clave=u.placa_clave AND d.quincena=p.quincena_efectiva
  JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
  WHERE p.estado<>'CANCELADO' AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE') AND e.nivel_mantenimiento=d.nivel)<>135
  OR (SELECT count(*) FROM public.programacion_mantenimiento p
   JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
   JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
   WHERE p.estado<>'CANCELADO' AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE'))<>135 THEN
  RAISE EXCEPTION 'No se obtuvieron exactamente las 45 quincenas y 135 detalles esperados.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.programacion_mantenimiento p
  JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
  JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
  WHERE p.estado<>'CANCELADO' AND p.quincena_efectiva<DATE '2026-10-16'
   AND e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE')) THEN
  RAISE EXCEPTION 'Quedó programación regular activa anterior al 16/10/2026.';
 END IF;
 SELECT respaldo INTO b FROM public.ti_pr01_correcciones WHERE lote='ti_pr01_inicio_octubre_19102026_v2';
 IF (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb)
  FROM public.programa_mantenimiento_unidad_ciclos c JOIN _inicio_unidades u ON u.unidad_id=c.programa_unidad_id)
  IS DISTINCT FROM b->'ciclos' THEN RAISE EXCEPTION 'Se modificaron ciclos reales.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'equipos') x
  LEFT JOIN public.programacion_mantenimiento_equipos e ON e.id=(x->>'id')::int
  WHERE x->>'tipo_equipo' IN('GPS','ADAS') AND to_jsonb(e) IS DISTINCT FROM x) THEN
  RAISE EXCEPTION 'Se modificó alcance anual. Se revierte el lote.';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'visitas') x
  JOIN public.programacion_mantenimiento p ON p.id=(x->>'id')::int
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(b->'equipos') e
    WHERE (e->>'programacion_id')::int=p.id AND e->>'tipo_equipo' IN('GPS','ADAS'))
   AND to_jsonb(p) IS DISTINCT FROM x) THEN
  RAISE EXCEPTION 'Se modificó la visita de una anualidad. Se revierte el lote.';
 END IF;
END $comprobar$;
UPDATE public.ti_pr01_correcciones SET resultado=jsonb_build_object(
 'unidades_corregidas',9,'primera_quincena','2026-10-16',
 'quincenas_regulares',45,'detalles_regulares',135,
 'visitas_canceladas',(SELECT count(*) FROM public.programacion_mantenimiento p
  JOIN _inicio_unidades u ON u.unidad_id=p.programa_unidad_id
  WHERE p.estado='CANCELADO' AND p.observaciones LIKE '%ti_pr01_inicio_octubre_19102026_v2%'),
 'anualidades','Conservadas','otras_unidades','Sin cambios')
 WHERE lote='ti_pr01_inicio_octubre_19102026_v2';
COMMIT;
SELECT lote,aplicado_en,resultado::text FROM public.ti_pr01_correcciones
 WHERE lote='ti_pr01_inicio_octubre_19102026_v2';

-- Verificación automática del resultado. Deben aparecer 45 filas CORRECTO.
SELECT lote,aplicado_en,resultado::text FROM public.ti_pr01_correcciones
 WHERE lote='ti_pr01_inicio_octubre_19102026_v2';
WITH esperado AS (
 SELECT x.* FROM public.ti_pr01_correcciones b,
 jsonb_to_recordset(b.alcance->'calendario') x(placa_clave text,quincena date,nivel text)
 WHERE b.lote='ti_pr01_inicio_octubre_19102026_v2'
)
SELECT d.placa_clave AS placa,d.quincena::text,d.nivel AS nivel_esperado,p.id AS visita_id,p.estado,
 string_agg(e.tipo_equipo||'/'||e.nivel_mantenimiento,'; ' ORDER BY e.tipo_equipo) AS equipos,
 CASE WHEN count(*) FILTER(WHERE e.tipo_equipo IN('CAMARAS','COPILOTO','RADIO_BASE')
  AND e.nivel_mantenimiento=d.nivel)=3 THEN 'CORRECTO' ELSE 'REVISAR' END AS comprobacion
 FROM esperado d LEFT JOIN public.programa_mantenimiento_unidades u
  ON regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=d.placa_clave
  AND u.programa_id=(SELECT id FROM public.programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO')
 LEFT JOIN public.programacion_mantenimiento p ON p.programa_unidad_id=u.id
  AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO'
 LEFT JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
 GROUP BY d.placa_clave,d.quincena,d.nivel,p.id,p.estado ORDER BY d.placa_clave,d.quincena;
