-- Enlace opcional de video, exclusivamente para el detalle Cámaras de la OT.
BEGIN;
ALTER TABLE public.ordenes_trabajo_detalle ADD COLUMN IF NOT EXISTS enlace_video text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ordenes_trabajo_detalle'::regclass AND conname='chk_otd_enlace_video') THEN
  ALTER TABLE public.ordenes_trabajo_detalle ADD CONSTRAINT chk_otd_enlace_video
   CHECK(enlace_video IS NULL OR (length(enlace_video)<=2048 AND enlace_video ~* '^https?://[^[:space:]]+$'));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.validar_video_solo_camaras_ot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE familia text;
BEGIN
 IF NEW.enlace_video IS NOT NULL THEN
  SELECT tipo_equipo INTO familia FROM public.programacion_mantenimiento_equipos WHERE id=NEW.programacion_equipo_id;
  IF familia IS DISTINCT FROM 'CAMARAS' THEN
   RAISE EXCEPTION 'Solo el equipo Cámaras admite un enlace de video.' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validar_video_solo_camaras_ot ON public.ordenes_trabajo_detalle;
CREATE TRIGGER trg_validar_video_solo_camaras_ot
 BEFORE INSERT OR UPDATE OF enlace_video,programacion_equipo_id ON public.ordenes_trabajo_detalle
 FOR EACH ROW EXECUTE FUNCTION public.validar_video_solo_camaras_ot();
COMMIT;
