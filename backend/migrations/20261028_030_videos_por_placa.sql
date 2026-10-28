-- Aplicar antes de desplegar el backend y el frontend de videos por placa.
BEGIN;
ALTER TABLE public.solicitud_descarga_video_placas
  ADD COLUMN IF NOT EXISTS fecha_llegada_unidad date,
  ADD COLUMN IF NOT EXISTS hora_llegada_unidad time without time zone,
  ADD COLUMN IF NOT EXISTS fecha_descarga date,
  ADD COLUMN IF NOT EXISTS hora_inicio time without time zone,
  ADD COLUMN IF NOT EXISTS hora_fin time without time zone;

-- Copia cada solicitud histórica a sus placas. No inventa llegadas ausentes.
UPDATE public.solicitud_descarga_video_placas sp SET
  fecha_llegada_unidad = COALESCE(sp.fecha_llegada_unidad, s.fecha_llegada_unidad),
  hora_llegada_unidad = COALESCE(sp.hora_llegada_unidad, s.hora_llegada_unidad),
  fecha_descarga = COALESCE(sp.fecha_descarga, s.fecha_descarga),
  hora_inicio = COALESCE(sp.hora_inicio, s.hora_inicio),
  hora_fin = COALESCE(sp.hora_fin, s.hora_fin)
FROM public.solicitudes_descarga_videos s WHERE s.id = sp.solicitud_id;

ALTER TABLE public.solicitud_descarga_video_placas
  ALTER COLUMN fecha_descarga SET NOT NULL,
  ALTER COLUMN hora_inicio SET NOT NULL,
  ALTER COLUMN hora_fin SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.solicitud_descarga_video_placas'::regclass
      AND conname = 'chk_solicitud_video_placa_horas') THEN
    ALTER TABLE public.solicitud_descarga_video_placas
      ADD CONSTRAINT chk_solicitud_video_placa_horas CHECK (hora_fin > hora_inicio);
  END IF;
END $$;
-- La cabecera solo representa valores comunes; NULL significa datos distintos por placa.
ALTER TABLE public.solicitudes_descarga_videos
  ALTER COLUMN fecha_descarga DROP NOT NULL,
  ALTER COLUMN hora_inicio DROP NOT NULL,
  ALTER COLUMN hora_fin DROP NOT NULL;
COMMIT;
