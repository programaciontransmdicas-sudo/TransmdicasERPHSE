BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.vehiculo_equipos IN ACCESS EXCLUSIVE MODE;

-- Respaldo permanente de todas las filas que participan, incluido un DVR ya existente.
CREATE TABLE IF NOT EXISTS public.respaldo_unificacion_dvr (
  lote text NOT NULL,
  equipo_id_original integer NOT NULL,
  placa varchar(20) NOT NULL,
  datos jsonb NOT NULL,
  respaldado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote, equipo_id_original)
);
INSERT INTO public.respaldo_unificacion_dvr(lote, equipo_id_original, placa, datos)
SELECT 'dvr_unico_20261020_v1', e.id, e.placa, to_jsonb(e)
FROM public.vehiculo_equipos e
WHERE e.tipo_equipo IN ('DVR', 'DVR_INTERNO', 'DVR_EXTERNO')
  AND EXISTS (SELECT 1 FROM public.vehiculo_equipos anterior
    WHERE anterior.placa=e.placa AND anterior.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO'))
ON CONFLICT (lote, equipo_id_original) DO NOTHING;

CREATE TEMP TABLE dvr_a_unificar ON COMMIT DROP AS
SELECT placa,
  COALESCE(min(id) FILTER (WHERE tipo_equipo='DVR'), min(id)) AS id_destino,
  CASE WHEN bool_or(estado_inventario='INSTALADO') THEN 'INSTALADO'
       WHEN bool_and(estado_inventario='NO_APLICA') THEN 'NO_APLICA'
       ELSE 'POR_VALIDAR' END AS estado,
  CASE WHEN count(DISTINCT nullif(btrim(marca),'')) FILTER (WHERE estado_inventario='INSTALADO')=1
    THEN max(nullif(btrim(marca),'')) FILTER (WHERE estado_inventario='INSTALADO') END AS marca,
  CASE WHEN count(DISTINCT nullif(btrim(modelo),'')) FILTER (WHERE estado_inventario='INSTALADO')=1
    THEN max(nullif(btrim(modelo),'')) FILTER (WHERE estado_inventario='INSTALADO') END AS modelo,
  CASE WHEN count(DISTINCT nullif(btrim(numero_serie),'')) FILTER (WHERE estado_inventario='INSTALADO')=1
    THEN max(nullif(btrim(numero_serie),'')) FILTER (WHERE estado_inventario='INSTALADO') END AS numero_serie,
  CASE WHEN count(DISTINCT fecha_instalacion) FILTER (WHERE estado_inventario='INSTALADO')=1
    THEN max(fecha_instalacion) FILTER (WHERE estado_inventario='INSTALADO') END AS fecha_instalacion,
  array_remove(ARRAY[
    CASE WHEN count(DISTINCT nullif(btrim(marca),'')) FILTER (WHERE estado_inventario='INSTALADO')>1 THEN 'marca' END,
    CASE WHEN count(DISTINCT nullif(btrim(modelo),'')) FILTER (WHERE estado_inventario='INSTALADO')>1 THEN 'modelo' END,
    CASE WHEN count(DISTINCT nullif(btrim(numero_serie),'')) FILTER (WHERE estado_inventario='INSTALADO')>1 THEN 'número de serie' END,
    CASE WHEN count(DISTINCT fecha_instalacion) FILTER (WHERE estado_inventario='INSTALADO')>1 THEN 'fecha de instalación' END
  ], NULL) AS conflictos,
  string_agg(DISTINCT nullif(btrim(observaciones),''), E'\n' ORDER BY nullif(btrim(observaciones),'')) AS notas
FROM public.vehiculo_equipos e
WHERE tipo_equipo IN ('DVR','DVR_INTERNO','DVR_EXTERNO')
  AND EXISTS (SELECT 1 FROM public.vehiculo_equipos anterior
    WHERE anterior.placa=e.placa AND anterior.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO'))
GROUP BY placa;

-- NOT VALID permite transformar las filas antiguas dentro de esta misma transacción.
-- Se valida el dominio completo antes del COMMIT: no quedan tipos internos/externos.
ALTER TABLE public.vehiculo_equipos DROP CONSTRAINT IF EXISTS chk_vehiculo_equipo_tipo;
ALTER TABLE public.vehiculo_equipos ADD CONSTRAINT chk_vehiculo_equipo_tipo CHECK (
  tipo_equipo IN ('DVR','CAMARA_INTERNA','CAMARA_EXTERNA','ADAS','COPILOTO','RADIO_BASE','GPS')
) NOT VALID;

UPDATE public.vehiculo_equipos e
SET tipo_equipo='DVR', estado_inventario=m.estado,
    marca=m.marca, modelo=m.modelo, numero_serie=m.numero_serie,
    fecha_instalacion=m.fecha_instalacion,
    observaciones=nullif(concat_ws(E'\n',
      CASE WHEN length(m.notas)>1600 THEN left(m.notas,1500) || E'\nObservaciones anteriores completas conservadas en el respaldo.' ELSE m.notas END,
      CASE WHEN cardinality(m.conflictos)>0 THEN
        'Confirme los siguientes datos del DVR: ' || array_to_string(m.conflictos, ', ') || '.' END
    ), ''),
    fuente='ERP', updated_at=now()
FROM dvr_a_unificar m WHERE e.id=m.id_destino;

DELETE FROM public.vehiculo_equipos e USING dvr_a_unificar m
WHERE e.placa=m.placa AND e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO') AND e.id<>m.id_destino;

ALTER TABLE public.vehiculo_equipos VALIDATE CONSTRAINT chk_vehiculo_equipo_tipo;
COMMENT ON COLUMN public.vehiculo_equipos.tipo_equipo IS
  'Siete tipos físicos: DVR único por unidad, cámara interna, cámara externa, ADAS, copiloto, radio base y GPS. DVR no genera mantenimiento regular independiente.';

SELECT count(*)::integer AS unidades_unificadas,
  count(*) FILTER (WHERE cardinality(conflictos)>0)::integer AS unidades_con_datos_por_confirmar
FROM dvr_a_unificar;
SELECT placa, conflictos AS datos_por_confirmar FROM dvr_a_unificar
WHERE cardinality(conflictos)>0 ORDER BY placa;
COMMIT;
