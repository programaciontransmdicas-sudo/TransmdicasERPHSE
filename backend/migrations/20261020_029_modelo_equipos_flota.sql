BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE public.vehiculo_equipos ADD COLUMN IF NOT EXISTS modelo varchar(120);
ALTER TABLE public.vehiculo_equipos
 DROP CONSTRAINT IF EXISTS chk_vehiculo_equipo_datos_solo_instalado;
ALTER TABLE public.vehiculo_equipos
 ADD CONSTRAINT chk_vehiculo_equipo_datos_solo_instalado CHECK (
  estado_inventario='INSTALADO' OR
  (marca IS NULL AND modelo IS NULL AND numero_serie IS NULL AND fecha_instalacion IS NULL)
 );
COMMENT ON COLUMN public.vehiculo_equipos.modelo IS 'Modelo del dispositivo instalado; dato independiente de su marca.';
COMMIT;
