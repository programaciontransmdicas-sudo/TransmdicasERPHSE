BEGIN;

UPDATE public.personal
SET nombre_completo = regexp_replace(
  btrim(nombre_completo),
  '^(\S+\s+\S+)\s+(.+)$',
  '\1, \2'
)
WHERE nombre_completo NOT LIKE '%,%'
  AND btrim(nombre_completo) ~ '^\S+\s+\S+\s+.+$'
RETURNING id, nombre_completo;

COMMIT;