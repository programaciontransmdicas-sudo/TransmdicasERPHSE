BEGIN;
ALTER TABLE public.entregas_ti ADD COLUMN IF NOT EXISTS fotografias jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.validar_cierre_reporte_pulsera()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado <> 'Resuelto' THEN
    IF TG_OP = 'UPDATE' AND OLD.estado = 'Resuelto' AND OLD.aplica_cambio IS NOT NULL THEN
      RAISE EXCEPTION 'El reporte de pulsera ya está cerrado' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Los reportes históricos resueltos se conservan sin inventarles una respuesta.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'Resuelto'
    AND OLD.aplica_cambio IS NULL AND NEW.aplica_cambio IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.aplica_cambio IS NULL THEN
    RAISE EXCEPTION 'Indique si el cierre requiere cambio' USING ERRCODE = '23514';
  END IF;
  IF NEW.aplica_cambio AND NOT EXISTS (
    SELECT 1 FROM public.entregas_ti e
    JOIN public.personal p ON p.id = NEW.receptor_persona_id
    WHERE e.id = NEW.entrega_ti_id AND e.dni = p.dni
      AND e.tipo_movimiento = 'Entrega' AND upper(btrim(e.equipo_tipo)) IN ('PULSERA', 'LAPTOP', 'CARGADOR', 'MOUSE', 'CORREA DE PULSERA', 'MONITOR', 'TABLET', 'MOUSE INALAMBRICO')
      AND e.cliente_operacion_id = NEW.cliente_operacion_id AND e.fecha IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La entrega debe corresponder al equipo seleccionado para el receptor y la operación del reporte' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validar_cierre_reporte_pulsera ON public.pulseras;
CREATE TRIGGER trg_validar_cierre_reporte_pulsera BEFORE INSERT OR UPDATE ON public.pulseras
  FOR EACH ROW EXECUTE FUNCTION public.validar_cierre_reporte_pulsera();

CREATE OR REPLACE FUNCTION public.proteger_entrega_cierre_pulsera()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pulseras pu
    JOIN public.personal p ON p.id = pu.receptor_persona_id
    WHERE pu.entrega_ti_id = OLD.id AND pu.aplica_cambio IS TRUE
      AND (NEW.dni IS DISTINCT FROM p.dni OR NEW.tipo_movimiento IS DISTINCT FROM 'Entrega'
        OR upper(btrim(COALESCE(NEW.equipo_tipo, ''))) NOT IN ('PULSERA', 'LAPTOP', 'CARGADOR', 'MOUSE', 'CORREA DE PULSERA', 'MONITOR', 'TABLET', 'MOUSE INALAMBRICO')
        OR NEW.cliente_operacion_id IS DISTINCT FROM pu.cliente_operacion_id OR NEW.fecha IS NULL)
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar el receptor, la operación o el tipo de una entrega vinculada al cierre de una pulsera' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proteger_entrega_cierre_pulsera ON public.entregas_ti;
CREATE TRIGGER trg_proteger_entrega_cierre_pulsera BEFORE UPDATE ON public.entregas_ti
  FOR EACH ROW EXECUTE FUNCTION public.proteger_entrega_cierre_pulsera();


COMMIT;
