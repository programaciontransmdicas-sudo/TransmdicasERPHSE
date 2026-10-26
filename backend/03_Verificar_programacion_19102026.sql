BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'America/Lima';
SELECT lote,aplicado_en,resultado::text AS resultado FROM public.ti_pr01_correcciones
 WHERE lote='ti_pr01_programacion_19102026_v1';
WITH deseado AS (
 SELECT x.placa_clave,x.quincena,x.nivel FROM public.ti_pr01_correcciones b,
 jsonb_to_recordset(b.alcance->'calendario') AS x(placa_clave text,quincena date,nivel text)
 WHERE b.lote='ti_pr01_programacion_19102026_v1'
)
SELECT d.placa_clave AS placa,d.quincena::text,d.nivel AS nivel_esperado,p.id AS visita_id,p.estado,
 string_agg(e.tipo_equipo||'/'||e.nivel_mantenimiento,'; ' ORDER BY e.tipo_equipo) AS alcance,
 CASE WHEN count(*) FILTER(WHERE e.tipo_equipo IN ('CAMARAS','COPILOTO','RADIO_BASE') AND e.nivel_mantenimiento=d.nivel)=3
   THEN 'CORRECTO' ELSE 'REVISAR' END AS comprobacion
FROM deseado d LEFT JOIN public.programa_mantenimiento_unidades u
 ON regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')=d.placa_clave
 AND u.programa_id=(SELECT id FROM public.programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO')
LEFT JOIN public.programacion_mantenimiento p ON p.programa_unidad_id=u.id AND p.quincena_efectiva=d.quincena AND p.estado<>'CANCELADO'
LEFT JOIN public.programacion_mantenimiento_equipos e ON e.programacion_id=p.id
GROUP BY d.placa_clave,d.quincena,d.nivel,p.id,p.estado ORDER BY d.placa_clave,d.quincena;
SELECT u.placa,u.habilitado,v.activo AS activo_flota,
 (SELECT count(*) FROM public.programacion_mantenimiento p WHERE p.programa_unidad_id=u.id AND p.estado<>'CANCELADO') AS visitas_activas
FROM public.programa_mantenimiento_unidades u JOIN public.vehiculos v ON v.placa=u.placa
WHERE regexp_replace(upper(btrim(u.placa)),'[-[:space:]]','','g')='VAM846'
AND u.programa_id=(SELECT id FROM public.programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO');
COMMIT;
