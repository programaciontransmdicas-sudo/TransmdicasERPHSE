-- Aplicar antes de reiniciar o desplegar el backend.
-- Mantiene las solicitudes existentes; no exige enlaces a solicitudes históricas ya atendidas.
BEGIN;
ALTER TABLE public.solicitudes_descarga_videos
  ADD COLUMN IF NOT EXISTS enlaces_videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observaciones_atencion text,
  ADD COLUMN IF NOT EXISTS atendida_por integer,
  ADD COLUMN IF NOT EXISTS fecha_atencion timestamptz;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitudes_descarga_videos'::regclass AND conname='fk_solicitud_video_atendida_por') THEN
  ALTER TABLE public.solicitudes_descarga_videos ADD CONSTRAINT fk_solicitud_video_atendida_por FOREIGN KEY(atendida_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.solicitudes_descarga_videos'::regclass AND conname='chk_solicitud_video_enlaces_respuesta') THEN
  ALTER TABLE public.solicitudes_descarga_videos ADD CONSTRAINT chk_solicitud_video_enlaces_respuesta CHECK(jsonb_typeof(enlaces_videos)='array' AND jsonb_array_length(enlaces_videos)<=20);
 END IF;
END $$;
COMMIT;
