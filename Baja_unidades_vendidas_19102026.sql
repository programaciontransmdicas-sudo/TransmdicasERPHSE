-- Lista definitiva de vendidas comunicada por Pedro el 19/10/2026.
-- No utiliza las ausencias del ReporteGestionFlotaResumen (2).
-- Retira de flota activa y del programa. Conserva historial y órdenes.
BEGIN;
SET LOCAL TIME ZONE 'America/Lima';
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('baja_vendidas_19102026_v1'));
LOCK TABLE public.vehiculos, public.programa_mantenimiento_unidades,
 public.programacion_mantenimiento, public.ordenes_trabajo,
 public.ti_pr01_correcciones IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _vendidas_1910(placa_clave text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _vendidas_1910 VALUES
 ('V5K754'), ('V5K749'), ('V8A788'), ('V0R762'),
 ('V9F784'), ('V9F785'), ('V9F794'), ('V5K761'),
 ('VBH825'), ('VBN949'), ('V5Y752'), ('VBO735'),
 ('VBP808'), ('V5K756');

CREATE TEMP TABLE _vendidas_flota ON COMMIT DROP AS
 SELECT v.placa, x.placa_clave FROM public.vehiculos v JOIN _vendidas_1910 x
 ON regexp_replace(upper(btrim(v.placa)), '[-[:space:]]', '', 'g')=x.placa_clave;
CREATE TEMP TABLE _vendidas_unidades ON COMMIT DROP AS
 SELECT u.id,u.placa FROM public.programa_mantenimiento_unidades u JOIN _vendidas_flota v
 ON u.placa=v.placa;

DO $validar$
BEGIN
 IF EXISTS(SELECT 1 FROM public.ti_pr01_correcciones WHERE lote='baja_vendidas_19102026_v1') THEN
  RAISE EXCEPTION 'Esta baja ya fue aplicada. No se repite.';
 END IF;
 IF EXISTS(SELECT 1 FROM _vendidas_flota GROUP BY placa_clave HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Hay placas duplicadas por formato. No se aplicó ningún cambio.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.ordenes_trabajo o
  JOIN public.programacion_mantenimiento p ON p.id=o.programacion_id
  JOIN _vendidas_unidades u ON u.id=p.programa_unidad_id
  WHERE o.estado='ABIERTA') THEN
  RAISE EXCEPTION 'Una unidad vendida tiene una OT abierta. Debe resolverse esa OT antes de aplicar la baja.';
 END IF;
END $validar$;

INSERT INTO public.ti_pr01_correcciones(lote,alcance,respaldo)
SELECT 'baja_vendidas_19102026_v1',
 jsonb_build_object('placas',(SELECT jsonb_agg(placa_clave ORDER BY placa_clave) FROM _vendidas_1910),
  'motivo','Unidades vendidas, lista confirmada por Pedro. No usar reporte desactualizado.'),
 jsonb_build_object(
  'vehiculos',(SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.placa),'[]'::jsonb)
    FROM public.vehiculos v JOIN _vendidas_flota x ON x.placa=v.placa),
  'unidades',(SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]'::jsonb)
    FROM public.programa_mantenimiento_unidades u JOIN _vendidas_unidades x ON x.id=u.id),
  'visitas',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb)
    FROM public.programacion_mantenimiento p JOIN _vendidas_unidades u ON u.id=p.programa_unidad_id));

-- Las visitas que ya tienen una OT se conservan tal como están.
UPDATE public.programacion_mantenimiento p SET estado='CANCELADO',
 observaciones=concat_ws(E'\n',NULLIF(p.observaciones,''),
  'Unidad vendida: baja administrativa el 19/10/2026. Lote baja_vendidas_19102026_v1.')
 FROM _vendidas_unidades u WHERE p.programa_unidad_id=u.id
 AND p.estado IN('PROYECTADO','PROGRAMADO','REPROGRAMADO')
 AND NOT EXISTS(SELECT 1 FROM public.ordenes_trabajo o WHERE o.programacion_id=p.id);

UPDATE public.programa_mantenimiento_unidades u SET habilitado=false,
 observaciones=concat_ws(E'\n',NULLIF(u.observaciones,''),
  'Unidad vendida: baja del programa el 19/10/2026. Lote baja_vendidas_19102026_v1.')
 FROM _vendidas_unidades x WHERE x.id=u.id;
UPDATE public.vehiculos v SET activo=false FROM _vendidas_flota x WHERE v.placa=x.placa;

DO $comprobar$
BEGIN
 IF EXISTS(SELECT 1 FROM public.vehiculos v JOIN _vendidas_flota x ON x.placa=v.placa WHERE v.activo IS DISTINCT FROM false)
 OR EXISTS(SELECT 1 FROM public.programa_mantenimiento_unidades u JOIN _vendidas_unidades x ON x.id=u.id WHERE u.habilitado IS DISTINCT FROM false)
 OR EXISTS(SELECT 1 FROM public.programacion_mantenimiento p JOIN _vendidas_unidades u ON u.id=p.programa_unidad_id
  WHERE p.estado IN('PROYECTADO','PROGRAMADO','REPROGRAMADO')
   AND NOT EXISTS(SELECT 1 FROM public.ordenes_trabajo o WHERE o.programacion_id=p.id)) THEN
  RAISE EXCEPTION 'La baja no se completó. Se revierte toda la operación.';
 END IF;
END $comprobar$;
UPDATE public.ti_pr01_correcciones SET resultado=jsonb_build_object(
 'placas_indicadas',14,'encontradas_en_flota',(SELECT count(*) FROM _vendidas_flota),
 'ya_ausentes',14-(SELECT count(*) FROM _vendidas_flota),
 'programas_inhabilitados',(SELECT count(*) FROM _vendidas_unidades),
 'visitas_canceladas',(SELECT count(*) FROM public.programacion_mantenimiento p
   JOIN _vendidas_unidades u ON u.id=p.programa_unidad_id
   WHERE p.estado='CANCELADO' AND p.observaciones LIKE '%baja_vendidas_19102026_v1%'))
 WHERE lote='baja_vendidas_19102026_v1';

SELECT x.placa_clave AS placa,v.placa AS placa_en_erp,v.activo AS activa,
 CASE WHEN v.placa IS NULL THEN 'YA AUSENTE' ELSE 'BAJA APLICADA' END AS resultado
 FROM _vendidas_1910 x LEFT JOIN _vendidas_flota f ON f.placa_clave=x.placa_clave
 LEFT JOIN public.vehiculos v ON v.placa=f.placa ORDER BY x.placa_clave;
COMMIT;
SELECT lote,aplicado_en,resultado::text FROM public.ti_pr01_correcciones
 WHERE lote='baja_vendidas_19102026_v1';
