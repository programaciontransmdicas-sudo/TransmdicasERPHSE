BEGIN;
-- Cambios aditivos: no elimina registros ni cambia placas o nombres sin revisar.
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS cliente varchar(100);
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS cliente_operacion_id integer;
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS modalidad varchar(100);
ALTER TABLE public.tickets_unidades ADD COLUMN IF NOT EXISTS fecha_llegada_unidad date;
ALTER TABLE public.tickets_unidades ADD COLUMN IF NOT EXISTS hora_llegada_unidad time;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.personal'::regclass AND conname = 'fk_personal_cliente_operacion') THEN
    ALTER TABLE public.personal ADD CONSTRAINT fk_personal_cliente_operacion
      FOREIGN KEY (cliente_operacion_id) REFERENCES public.cliente_operaciones(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_personal_cliente_operacion ON public.personal(cliente_operacion_id);
-- Solo corrige espacios de nombres que YA tienen una coma. No adivina apellidos.
UPDATE public.personal
SET nombre_completo = upper(regexp_replace(regexp_replace(btrim(nombre_completo), '\s+', ' ', 'g'), '\s*,\s*', ', ', 'g'))
WHERE nombre_completo ~ '^[^,]+,[^,]+$'
  AND nombre_completo IS DISTINCT FROM upper(regexp_replace(regexp_replace(btrim(nombre_completo), '\s+', ' ', 'g'), '\s*,\s*', ', ', 'g'));
COMMIT;
-- Pendientes para revisión humana, sin alterar el orden de nombres y apellidos.
SELECT id, dni, nombre_completo FROM public.personal
WHERE nombre_completo !~ '^[^,]+,[^,]+$' ORDER BY nombre_completo;
