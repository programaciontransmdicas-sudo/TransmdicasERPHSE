-- =====================================================================================
-- HOTFIX MULTI-TENANT · MIGRACION 20261007_903 · FUNCIONES DEL MODELO
-- =====================================================================================
-- CLASIFICACION: RECUPERACION DE LOGICA. 2 CREATE OR REPLACE FUNCTION. 1 CREATE TRIGGER.
--   0 CREATE TABLE. 0 ADD COLUMN. 0 DROP. 0 INDEX. 0 DML.
--
-- Las dos funciones se transcriben LITERALMENTE de pg_get_functiondef() sobre la base de
-- produccion origen, sin reformatear ni "mejorar" una sola linea, comentarios en
-- castellano incluidos. El trigger, de pg_get_triggerdef().
--
-- POR QUE AQUI SOLO SE INSTALA UNO DE LOS DOS TRIGGERS
-- -------------------------------------------------------------------------------------
-- El origen tiene dos triggers. Este fichero instala uno:
--   · trg_validar_asignacion_supervisor, sobre supervisor_asignaciones. Se instala: la
--     tabla nace vacia, solo se dispara al asignar supervisores y se probo que acepta el
--     caso valido y rechaza los tres invalidos.
--   · trg_sincronizar_vehiculo_cliente_operacion, sobre vehiculos. NO se instala aqui.
--     Esta en migrations/pending_multi_tenant/20261007_904_..., sin aplicar.
--
-- QUE SE MIDIO, Y POR QUE EL DE VEHICULOS SE QUEDA FUERA
-- -------------------------------------------------------------------------------------
-- Ese trigger aborta con RAISE EXCEPTION cuando el par (cliente, operacion) no resuelve
-- contra el catalogo activo. Instalado en la branch aislada, se comprobo que rompe cosas
-- que HOY funcionan:
--
-- 1) La suite de regresion de TI-PR-01 no puede ni crear sus fixtures. Las suites hacen
--    INSERT INTO vehiculos (placa) VALUES ($1), sin cliente ni operacion, y el trigger lo
--    rechaza: "La combinacion cliente <NULL> / operacion <NULL> no existe". Son 43 suites.
--
-- 2) scripts/ti-pr-01/probar-generador.mjs:78 hace exactamente ese mismo INSERT. Es un
--    script del repositorio, no una prueba desechable.
--
-- 3) El alta por la API. flota/service.js:195 exige placa y operacion, pero NO cliente:
--    un vehiculo con operacion y sin cliente se admite hoy y dejaria de admitirse.
--
-- Nada de eso lo provoca la 902, que no instala ningun trigger. Decidirlo requiere arreglar
-- antes esos tres frentes, y eso es trabajo aparte con su propia autorizacion.
--
-- LO QUE SI CAMBIA CON ESTE FICHERO
-- -------------------------------------------------------------------------------------
-- Solo el alta de asignaciones de supervisor pasa a validarse: exige rol supervisor,
-- prohibe operaciones de clientes internos -el cliente INTERNO que carga la 902 lo es- y
-- exige cliente y operacion activos. Sobre la tabla vacia no se dispara, asi que no
-- cambia ningun comportamiento existente.
--
-- No toca TI-PR-01: ni programacion_mantenimiento, ni ordenes_trabajo, ni sus triggers,
-- que siguen siendo los unicos duenos de su propia coherencia.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- PASO 0 · PRECONDICIONES
-- -------------------------------------------------------------------------------------
DO $$
DECLARE n_ops INTEGER;
BEGIN
  IF to_regclass('public.cliente_operaciones') IS NULL
     OR to_regclass('public.supervisor_asignaciones') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero migrations/20261007_902_multi_tenant_recuperacion.sql.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='vehiculos'
                   AND column_name='cliente_operacion_id') THEN
    RAISE EXCEPTION 'Falta vehiculos.cliente_operacion_id. Aplica primero la 902.';
  END IF;

  -- El catalogo tiene que estar cargado: validar_asignacion_supervisor lo consulta para
  -- decidir si la operacion es interna y si esta activa. Con el catalogo vacio, el trigger
  -- rechazaria toda asignacion con un mensaje que no explicaria la causa real.
  SELECT count(*) INTO n_ops FROM cliente_operaciones WHERE activo = TRUE;
  IF n_ops = 0 THEN
    RAISE EXCEPTION
      'cliente_operaciones esta vacia. Carga el catalogo con la 902 antes de instalar el trigger.';
  END IF;
END $$;


-- -------------------------------------------------------------------------------------
-- PASO 1 · validar_asignacion_supervisor()
--   Literal de pg_get_functiondef() en la base origen.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_asignacion_supervisor()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_rol TEXT;
  v_es_interno BOOLEAN;
  v_cliente_activo BOOLEAN;
  v_operacion_activa BOOLEAN;
BEGIN
  SELECT rol
  INTO v_rol
  FROM usuarios
  WHERE id = NEW.usuario_id;

  IF LOWER(BTRIM(COALESCE(v_rol, ''))) <> 'supervisor' THEN
    RAISE EXCEPTION
      'El usuario seleccionado no tiene rol supervisor';
  END IF;

  SELECT
    c.es_interno,
    c.activo,
    co.activo
  INTO
    v_es_interno,
    v_cliente_activo,
    v_operacion_activa
  FROM cliente_operaciones co
  INNER JOIN clientes c
    ON c.id = co.cliente_id
  WHERE co.id = NEW.cliente_operacion_id;

  IF v_es_interno = TRUE THEN
    RAISE EXCEPTION
      'Las operaciones internas no pueden asignarse a supervisores';
  END IF;

  IF v_cliente_activo IS NOT TRUE
     OR v_operacion_activa IS NOT TRUE THEN
    RAISE EXCEPTION
      'El cliente o la operación están inactivos';
  END IF;

  RETURN NEW;
END;
$function$;


-- -------------------------------------------------------------------------------------
-- PASO 2 · sincronizar_vehiculo_cliente_operacion()
--   Literal de pg_get_functiondef() en la base origen. Es la regla que explica el modelo
--   entero: mantiene en sincronia la columna nueva y las dos columnas de texto antiguas,
--   y aborta en vez de dejar un vehiculo sin operacion. Esa es la razon por la que en el
--   origen la columna puede ser NOT NULL sin backfill explicito, y los 175 vehiculos de
--   alli cumplen el par al 100 %.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_vehiculo_cliente_operacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cliente TEXT;
  v_operacion TEXT;
BEGIN
  -- Creación usando los campos antiguos
  IF TG_OP = 'INSERT'
     AND NEW.cliente_operacion_id IS NULL THEN

    SELECT co.id
    INTO NEW.cliente_operacion_id
    FROM cliente_operaciones co
    INNER JOIN clientes c
      ON c.id = co.cliente_id
    WHERE UPPER(BTRIM(c.nombre)) =
          UPPER(BTRIM(NEW.cliente))
      AND UPPER(BTRIM(co.nombre)) =
          UPPER(BTRIM(NEW.operacion))
      AND c.activo = TRUE
      AND co.activo = TRUE;

    IF NEW.cliente_operacion_id IS NULL THEN
      RAISE EXCEPTION
        'La combinación cliente % / operación % no existe',
        NEW.cliente,
        NEW.operacion;
    END IF;

  -- Cambio realizado mediante cliente y operación
  ELSIF TG_OP = 'UPDATE'
        AND (
          NEW.cliente IS DISTINCT FROM OLD.cliente
          OR NEW.operacion IS DISTINCT FROM OLD.operacion
        ) THEN

    SELECT co.id
    INTO NEW.cliente_operacion_id
    FROM cliente_operaciones co
    INNER JOIN clientes c
      ON c.id = co.cliente_id
    WHERE UPPER(BTRIM(c.nombre)) =
          UPPER(BTRIM(NEW.cliente))
      AND UPPER(BTRIM(co.nombre)) =
          UPPER(BTRIM(NEW.operacion))
      AND c.activo = TRUE
      AND co.activo = TRUE;

    IF NEW.cliente_operacion_id IS NULL THEN
      RAISE EXCEPTION
        'La combinación cliente % / operación % no existe',
        NEW.cliente,
        NEW.operacion;
    END IF;

  -- Creación o edición utilizando el nuevo ID
  ELSIF NEW.cliente_operacion_id IS NOT NULL THEN

    SELECT
      c.nombre,
      co.nombre
    INTO
      v_cliente,
      v_operacion
    FROM cliente_operaciones co
    INNER JOIN clientes c
      ON c.id = co.cliente_id
    WHERE co.id = NEW.cliente_operacion_id
      AND c.activo = TRUE
      AND co.activo = TRUE;

    IF v_cliente IS NULL THEN
      RAISE EXCEPTION
        'La relación cliente-operación seleccionada no existe o está inactiva';
    END IF;

    NEW.cliente := v_cliente;
    NEW.operacion := v_operacion;
  END IF;

  RETURN NEW;
END;
$function$;


-- -------------------------------------------------------------------------------------
-- PASO 3 · EL TRIGGER DE supervisor_asignaciones
--   Literal de pg_get_triggerdef(). El segundo trigger del origen, el de vehiculos, no
--   esta aqui: vease la cabecera.
-- -------------------------------------------------------------------------------------
CREATE TRIGGER trg_validar_asignacion_supervisor
  BEFORE INSERT OR UPDATE ON public.supervisor_asignaciones
  FOR EACH ROW EXECUTE FUNCTION validar_asignacion_supervisor();

-- trg_sincronizar_vehiculo_cliente_operacion NO se crea aqui. Vive aparte, en
-- migrations/pending_multi_tenant/20261007_904_vehiculos_sincronizacion_trigger.sql,
-- porque se MIDIO que rompe cosas que hoy funcionan. Vease la cabecera de este fichero.
-- La funcion si se deja creada: sin trigger que la invoque es inerte, y asi la 904 queda
-- reducida a una sola sentencia cuando se autorice.


-- -------------------------------------------------------------------------------------
-- PASO 4 · VERIFICACION
-- -------------------------------------------------------------------------------------
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('validar_asignacion_supervisor', 'sincronizar_vehiculo_cliente_operacion');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Se esperaban 2 funciones del modelo multi-tenant, hay %.', n;
  END IF;

  SELECT count(*) INTO n FROM pg_trigger tg
         INNER JOIN pg_class c ON c.oid = tg.tgrelid
   WHERE NOT tg.tgisinternal
     AND tg.tgname = 'trg_validar_asignacion_supervisor';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 trigger (el de supervisor_asignaciones), hay %.', n;
  END IF;

  -- Y el de vehiculos NO debe estar: lo instala la 904, aparte y bajo autorizacion.
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgname = 'trg_sincronizar_vehiculo_cliente_operacion'
               AND NOT tgisinternal) THEN
    RAISE EXCEPTION
      'trg_sincronizar_vehiculo_cliente_operacion esta instalado. Esta migracion no lo crea.';
  END IF;

  RAISE NOTICE 'OK · 2 funciones y 1 trigger (supervisor_asignaciones) instalados. El de vehiculos queda en pending_multi_tenant.';
END $$;

COMMIT;
