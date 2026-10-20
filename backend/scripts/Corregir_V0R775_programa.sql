-- V0R-775: cámaras y copiloto confirmados por Pedro el 20/10/2026.
-- Radio base por confirmar. Cámaras sin ubicación interna/externa confirmada.
-- Inicio regular M1: segunda quincena de octubre. No acredita ejecución.
BEGIN;
SET LOCAL TIME ZONE 'America/Lima';
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(hashtext('v0r775_programacion_20261020_v1'));
LOCK TABLE public.programas_mantenimiento, public.programas_mantenimiento_versiones,
 public.programa_mantenimiento_unidades, public.programa_mantenimiento_frecuencias,
 public.programa_mantenimiento_unidad_anclas, public.programa_mantenimiento_unidad_ciclos,
 public.programacion_mantenimiento, public.programacion_mantenimiento_equipos,
 public.programacion_mantenimiento_ajustes, public.ordenes_trabajo,
 public.vehiculos, public.vehiculo_equipos IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.ti_pr01_correcciones (
 lote text PRIMARY KEY, aplicado_en timestamptz NOT NULL DEFAULT now(),
 aplicado_por text NOT NULL DEFAULT current_user, alcance jsonb NOT NULL,
 respaldo jsonb NOT NULL, resultado jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TEMP TABLE contexto_v0r775 ON COMMIT DROP AS
SELECT u.id AS unidad_id, u.programa_id, u.placa
FROM public.programa_mantenimiento_unidades u
JOIN public.programas_mantenimiento p ON p.id=u.programa_id
JOIN public.vehiculos v ON v.placa=u.placa
WHERE u.id=2650 AND u.placa='V0R775' AND u.habilitado
  AND v.activo AND p.codigo='TI-PR-01' AND p.estado='ACTIVO';

CREATE TEMP TABLE plan_v0r775 ON COMMIT DROP AS
SELECT q::date AS quincena
FROM (VALUES (DATE '2026-10-16'),(DATE '2026-11-01'),(DATE '2026-11-16'),
             (DATE '2026-12-01'),(DATE '2026-12-16')) t(q);

DO $validar$
BEGIN
 IF EXISTS (SELECT 1 FROM public.ti_pr01_correcciones WHERE lote='v0r775_programacion_20261020_v1') THEN
  RAISE EXCEPTION 'La corrección de V0R-775 ya fue aplicada. Ejecute la consulta de verificación.';
 END IF;
 IF (SELECT count(*) FROM contexto_v0r775)<>1 THEN
  RAISE EXCEPTION 'La unidad 2650 / V0R775 no coincide con el diagnóstico o está inactiva.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.programa_mantenimiento_unidades u JOIN contexto_v0r775 x ON x.unidad_id=u.id
  WHERE cardinality(u.familias_confirmadas)<>0 OR u.quincena_incorporacion IS NOT NULL) THEN
  RAISE EXCEPTION 'La incorporación o las familias confirmadas cambiaron desde el diagnóstico.';
 END IF;
 IF EXISTS (SELECT 1 FROM (VALUES ('CAMARAS'),('COPILOTO')) f(tipo)
  CROSS JOIN (VALUES ('M1',1),('M2',6),('M3',12)) n(nivel,frec)
  WHERE (SELECT count(*) FROM public.programa_mantenimiento_frecuencias r
   WHERE r.programa_id=(SELECT programa_id FROM contexto_v0r775)
    AND r.tipo_equipo=f.tipo AND r.nivel_mantenimiento=n.nivel AND r.frecuencia_quincenas=n.frec)<>1) THEN
  RAISE EXCEPTION 'Las frecuencias de cámaras/copiloto deben ser M1=1, M2=6 y M3=12 quincenas.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.programa_mantenimiento_unidad_anclas a JOIN contexto_v0r775 x ON x.unidad_id=a.programa_unidad_id
  WHERE a.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE')) OR
    EXISTS (SELECT 1 FROM public.programa_mantenimiento_unidad_ciclos c JOIN contexto_v0r775 x ON x.unidad_id=c.programa_unidad_id
  WHERE c.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE') AND
   (c.ultima_quincena IS NOT NULL OR c.ultima_fecha_real IS NOT NULL OR c.orden_trabajo_detalle_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'Aparecieron referencias de mantenimiento regular; se requiere revisar el nuevo estado.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.programacion_mantenimiento_ajustes a JOIN contexto_v0r775 x ON x.unidad_id=a.programa_unidad_id)
 OR EXISTS (SELECT 1 FROM public.ordenes_trabajo o JOIN public.programacion_mantenimiento p ON p.id=o.programacion_id
  JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id) THEN
  RAISE EXCEPTION 'La unidad tiene una OT o un ajuste posterior al diagnóstico. Se conserva su historial.';
 END IF;
 IF (SELECT count(*) FROM public.programacion_mantenimiento p JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id
  WHERE p.estado<>'CANCELADO')<>1 OR NOT EXISTS (
   SELECT 1 FROM public.programacion_mantenimiento p JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id
   WHERE p.id=12978 AND p.estado='PROYECTADO' AND p.quincena_efectiva=DATE '2026-11-16'
    AND p.quincena_reprogramada IS NULL AND p.fecha_ejecucion IS NULL) THEN
  RAISE EXCEPTION 'La visita anual 12978 cambió desde el diagnóstico. No se modificó la programación.';
 END IF;
 IF (SELECT count(*) FROM public.programacion_mantenimiento_equipos e WHERE e.programacion_id=12978)<>1
 OR NOT EXISTS (SELECT 1 FROM public.programacion_mantenimiento_equipos
  WHERE programacion_id=12978 AND tipo_equipo='GPS' AND nivel_mantenimiento='M3') THEN
  RAISE EXCEPTION 'El alcance de la visita anual cambió desde el diagnóstico.';
 END IF;
 IF (SELECT count(*) FROM public.vehiculo_equipos e JOIN contexto_v0r775 x ON x.placa=e.placa
  WHERE e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA','COPILOTO','RADIO_BASE')
   AND e.estado_inventario='NO_APLICA' AND e.marca IS NULL AND e.modelo IS NULL
   AND e.numero_serie IS NULL AND e.fecha_instalacion IS NULL)<>4 THEN
  RAISE EXCEPTION 'El inventario cambió desde el diagnóstico. Revíselo antes de aplicar la corrección.';
 END IF;
 IF EXISTS (SELECT 1 FROM plan_v0r775 q WHERE
  (SELECT count(*) FROM public.programas_mantenimiento_versiones v
   WHERE v.programa_id=(SELECT programa_id FROM contexto_v0r775)
    AND v.estado IN ('VIGENTE','SUPERSEDIDA')
    AND q.quincena BETWEEN v.periodo_inicio AND v.periodo_fin
    AND v.vigencia_desde<=q.quincena
    AND (v.vigencia_hasta IS NULL OR q.quincena<v.vigencia_hasta))<>1) THEN
  RAISE EXCEPTION 'Falta una versión de TI-PR-01 aplicable a las quincenas de octubre a diciembre.';
 END IF;
END $validar$;

INSERT INTO public.ti_pr01_correcciones(lote, alcance, respaldo)
SELECT 'v0r775_programacion_20261020_v1',
 jsonb_build_object('placa',x.placa,'unidad_id',x.unidad_id,'inicio','2026-10-16',
  'familias_confirmadas',jsonb_build_array('CAMARAS','COPILOTO'),'radio_base','POR_VALIDAR'),
 jsonb_build_object(
  'unidad',(SELECT to_jsonb(u) FROM public.programa_mantenimiento_unidades u WHERE u.id=x.unidad_id),
  'inventario',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.vehiculo_equipos e WHERE e.placa=x.placa),
  'ciclos',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_ciclos c WHERE c.programa_unidad_id=x.unidad_id),
  'anclas',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.programa_mantenimiento_unidad_anclas a WHERE a.programa_unidad_id=x.unidad_id),
  'visitas',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM public.programacion_mantenimiento p WHERE p.programa_unidad_id=x.unidad_id),
  'equipos',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.programacion_mantenimiento_equipos e
   JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id WHERE p.programa_unidad_id=x.unidad_id)
 ) FROM contexto_v0r775 x;

UPDATE public.programa_mantenimiento_unidades u
SET quincena_incorporacion=DATE '2026-10-16', familias_confirmadas=ARRAY['CAMARAS','COPILOTO']::text[]
FROM contexto_v0r775 x WHERE u.id=x.unidad_id;

-- No se afirma si las cámaras son internas o externas: se confirma la familia en el programa.
UPDATE public.vehiculo_equipos e SET
 estado_inventario=CASE WHEN e.tipo_equipo='COPILOTO' THEN 'INSTALADO' ELSE 'POR_VALIDAR' END,
 fuente='ERP', observaciones=concat_ws(E'\n',nullif(e.observaciones,''),
  CASE e.tipo_equipo WHEN 'COPILOTO' THEN 'Dispositivo instalado, confirmado por el área responsable.'
   WHEN 'RADIO_BASE' THEN 'Confirmar si la unidad tiene radio base.'
   ELSE 'La unidad tiene cámaras. Falta precisar su ubicación interna o externa.' END)
FROM contexto_v0r775 x WHERE e.placa=x.placa
 AND e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA','COPILOTO','RADIO_BASE');

INSERT INTO public.programa_mantenimiento_unidad_anclas
 (programa_unidad_id,programa_id,tipo_equipo,nivel_mantenimiento,quincena_ancla,origen,observaciones)
SELECT x.unidad_id,x.programa_id,f.tipo,n.nivel,
 CASE WHEN n.nivel='M1' THEN DATE '2026-10-01' ELSE DATE '2026-10-16' END,
 'MANUAL','Referencia de planificación. No acredita un mantenimiento ejecutado.'
FROM contexto_v0r775 x CROSS JOIN (VALUES ('CAMARAS'),('COPILOTO')) f(tipo)
CROSS JOIN (VALUES ('M1'),('M2'),('M3')) n(nivel);

INSERT INTO public.programacion_mantenimiento
 (programa_unidad_id,programa_id,version_programa_id,quincena_programada,estado,observaciones)
SELECT x.unidad_id,x.programa_id,
 (SELECT v.id FROM public.programas_mantenimiento_versiones v WHERE v.programa_id=x.programa_id
  AND v.estado IN ('VIGENTE','SUPERSEDIDA') AND q.quincena BETWEEN v.periodo_inicio AND v.periodo_fin
  AND v.vigencia_desde<=q.quincena AND (v.vigencia_hasta IS NULL OR q.quincena<v.vigencia_hasta)),
 q.quincena,'PROYECTADO','Mantenimiento regular de cámaras y copiloto.'
FROM contexto_v0r775 x CROSS JOIN plan_v0r775 q
WHERE NOT EXISTS (SELECT 1 FROM public.programacion_mantenimiento p
 WHERE p.programa_unidad_id=x.unidad_id AND p.quincena_efectiva=q.quincena AND p.estado<>'CANCELADO');

-- El 16/11 se reutiliza la visita anual. GPS sigue en M3, cámaras y copiloto van en M1.
INSERT INTO public.programacion_mantenimiento_equipos
 (programacion_id,programa_id,tipo_equipo,nivel_mantenimiento)
SELECT p.id,x.programa_id,f.tipo,'M1'
FROM contexto_v0r775 x JOIN public.programacion_mantenimiento p ON p.programa_unidad_id=x.unidad_id
JOIN plan_v0r775 q ON q.quincena=p.quincena_efectiva
CROSS JOIN (VALUES ('CAMARAS'),('COPILOTO')) f(tipo)
WHERE p.estado<>'CANCELADO';

DO $verificar$
DECLARE b jsonb;
BEGIN
 SELECT respaldo INTO b FROM public.ti_pr01_correcciones WHERE lote='v0r775_programacion_20261020_v1';
 IF (SELECT count(*) FROM public.programacion_mantenimiento p JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id
   WHERE p.estado<>'CANCELADO')<>5 OR
  (SELECT count(*) FROM public.programacion_mantenimiento_equipos e JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id
   JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id
   WHERE e.tipo_equipo IN ('CAMARAS','COPILOTO') AND e.nivel_mantenimiento='M1' AND p.estado<>'CANCELADO')<>10 THEN
  RAISE EXCEPTION 'No se obtuvo el calendario de cinco quincenas y diez detalles regulares. Se revierte todo.';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'visitas') original
  LEFT JOIN public.programacion_mantenimiento p ON p.id=(original->>'id')::int WHERE to_jsonb(p) IS DISTINCT FROM original)
 OR EXISTS (SELECT 1 FROM jsonb_array_elements(b->'equipos') original
  LEFT JOIN public.programacion_mantenimiento_equipos e ON e.id=(original->>'id')::int WHERE to_jsonb(e) IS DISTINCT FROM original) THEN
  RAISE EXCEPTION 'La visita anual o su detalle GPS cambió. Se revierte todo.';
 END IF;
 IF (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb)
  FROM public.programa_mantenimiento_unidad_ciclos c JOIN contexto_v0r775 x ON x.unidad_id=c.programa_unidad_id)
   IS DISTINCT FROM b->'ciclos' THEN RAISE EXCEPTION 'Se alteraron ciclos reales. Se revierte todo.'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'inventario') original
  LEFT JOIN public.vehiculo_equipos e ON e.id=(original->>'id')::int
  WHERE original->>'tipo_equipo' NOT IN ('CAMARA_INTERNA','CAMARA_EXTERNA','COPILOTO','RADIO_BASE')
   AND to_jsonb(e) IS DISTINCT FROM original) THEN
  RAISE EXCEPTION 'Se alteró inventario fuera del alcance autorizado. Se revierte todo.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.programacion_mantenimiento_equipos e JOIN public.programacion_mantenimiento p ON p.id=e.programacion_id
  JOIN contexto_v0r775 x ON x.unidad_id=p.programa_unidad_id WHERE e.tipo_equipo='RADIO_BASE') THEN
  RAISE EXCEPTION 'Radio base no está confirmado y no debe programarse.';
 END IF;
END $verificar$;
UPDATE public.ti_pr01_correcciones SET resultado=jsonb_build_object(
 'placa','V0R775','inicio','2026-10-16','visitas_regulares',5,'detalles_regulares',10,
 'referencias_regulares',6,'gps_visita_conservada',12978,'radio_base','POR_VALIDAR')
WHERE lote='v0r775_programacion_20261020_v1';
COMMIT;

SELECT lote,aplicado_en,resultado::text AS resultado FROM public.ti_pr01_correcciones
WHERE lote='v0r775_programacion_20261020_v1';
SELECT p.id AS visita_id,p.quincena_efectiva::text AS quincena,p.estado,e.tipo_equipo,e.nivel_mantenimiento
FROM public.programacion_mantenimiento p JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
WHERE p.programa_unidad_id=2650 AND p.estado<>'CANCELADO'
ORDER BY p.quincena_efectiva,e.tipo_equipo;
