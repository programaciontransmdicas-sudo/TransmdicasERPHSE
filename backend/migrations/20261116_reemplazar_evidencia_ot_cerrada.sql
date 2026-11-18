-- Revisar primero en un entorno de pruebas. Se requiere la migración 018.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.ordenes_trabajo_evidencias') IS NULL OR
     to_regprocedure('public.validar_evidencia_ot_abierta()') IS NULL THEN
    RAISE EXCEPTION 'Falta la migración de evidencias 018; no se aplicó el cambio.';
  END IF;
END $$;

-- Conserva la prohibición general de insertar en una orden cerrada; la excepción
-- solo se admite desde la función de sustitución, que verifica y cambia ambas filas.
CREATE OR REPLACE FUNCTION public.validar_evidencia_ot_abierta()
RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog, public AS $$
DECLARE v_estado varchar(10); v_context text;
BEGIN
  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = NEW.orden_trabajo_id;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'La orden de trabajo % no existe.', NEW.orden_trabajo_id; END IF;
  IF NEW.estado <> 'ACTIVA' THEN RAISE EXCEPTION 'Una evidencia nace ACTIVA.'; END IF;
  IF v_estado <> 'ABIERTA' THEN
    GET DIAGNOSTICS v_context = PG_CONTEXT;
    IF v_estado <> 'CERRADA' OR v_context NOT LIKE '%reemplazar_evidencia_ot_cerrada(integer,integer,integer,text,text,text,integer,integer,integer,integer)%' THEN
      RAISE EXCEPTION 'La orden de trabajo % esta %: no admite evidencia nueva.', NEW.orden_trabajo_id, v_estado;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.reemplazar_evidencia_ot_cerrada(
  p_ot integer, p_evidencia integer, p_usuario integer, p_motivo text,
  p_public_id text, p_formato text, p_bytes integer, p_ancho integer, p_alto integer,
  p_detalle integer
) RETURNS integer LANGUAGE plpgsql SET search_path TO pg_catalog, public AS $$
DECLARE v_estado text; v_detalle integer; v_nueva integer; v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_usuario AND lower(btrim(rol)) IN ('admin','administrador')) THEN
    RAISE EXCEPTION 'Solo un administrador puede reemplazar evidencias.';
  END IF;
  IF p_motivo IS NULL OR p_motivo ~ E'^[[:space:]\\uFEFF]*$' OR length(p_motivo) > 2000 THEN
    RAISE EXCEPTION 'El motivo de reemplazo es obligatorio y admite hasta 2000 caracteres.';
  END IF;
  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = p_ot FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'CERRADA' THEN RAISE EXCEPTION 'La orden no está cerrada.'; END IF;
  PERFORM 1 FROM public.ordenes_trabajo_detalle WHERE id = p_detalle AND orden_trabajo_id = p_ot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El apartado no pertenece a la orden.'; END IF;
  SELECT detalle_id INTO v_detalle FROM public.ordenes_trabajo_evidencias
    WHERE id = p_evidencia AND orden_trabajo_id = p_ot AND estado = 'ACTIVA' FOR UPDATE;
  IF v_detalle IS DISTINCT FROM p_detalle THEN RAISE EXCEPTION 'La evidencia ya no está activa o no pertenece al apartado.'; END IF;
  SELECT count(*) INTO v_count FROM public.ordenes_trabajo_evidencias WHERE detalle_id = p_detalle AND estado = 'ACTIVA';
  IF v_count < 1 OR v_count > 4 THEN RAISE EXCEPTION 'Cantidad de evidencias activas inconsistente.'; END IF;
  UPDATE public.ordenes_trabajo_evidencias SET estado = 'RETIRADA', retirada_por_id = p_usuario,
    retirada_en = CURRENT_TIMESTAMP, motivo_retiro = p_motivo WHERE id = p_evidencia;
  INSERT INTO public.ordenes_trabajo_evidencias
    (orden_trabajo_id, detalle_id, cloudinary_public_id, formato, bytes, ancho, alto, subida_por_id)
  VALUES (p_ot, p_detalle, p_public_id, p_formato, p_bytes, p_ancho, p_alto, p_usuario)
  RETURNING id INTO v_nueva;
  RETURN v_nueva;
END $$;
COMMIT;
