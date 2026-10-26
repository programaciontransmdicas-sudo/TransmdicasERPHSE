-- SOLO LECTURA. Ejecutar en la misma base/rama que usa Render.
SELECT current_database() AS base_actual, current_schema() AS esquema;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('tickets_unidades', 'personal', 'vehiculos')
ORDER BY table_name, ordinal_position;
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conrelid = 'public.tickets_unidades'::regclass;
SELECT id, dni, nombre_completo FROM public.personal
WHERE nombre_completo !~ '^[^,]+,[^,]+$' ORDER BY nombre_completo;
