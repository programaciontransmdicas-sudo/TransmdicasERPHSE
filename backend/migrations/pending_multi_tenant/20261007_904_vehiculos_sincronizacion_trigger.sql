-- =====================================================================================
-- MULTI-TENANT · 20261007_904 · trg_sincronizar_vehiculo_cliente_operacion
-- =====================================================================================
-- *** NO APLICADA. NO APLICAR SIN RESOLVER ANTES LOS TRES PUNTOS DE ABAJO. ***
--
-- Esta en pending_multi_tenant/ por la misma razon por la que los cleanup 900 y 901
-- estuvieron en pending_cleanup/: el DDL esta cerrado y revisado, pero aplicarlo tiene
-- consecuencias que hay que resolver primero.
--
-- CLASIFICACION: 1 CREATE TRIGGER. Nada mas. La funcion que invoca,
-- sincronizar_vehiculo_cliente_operacion(), ya la crea la 903 y sin trigger es inerte.
--
-- QUE HACE
-- -------------------------------------------------------------------------------------
-- Es la regla que explica el modelo multi-tenant entero, recuperada literalmente de
-- pg_get_triggerdef() en la base de produccion origen. Mantiene en sincronia la columna
-- vehiculos.cliente_operacion_id y las dos columnas de texto antiguas:
--   · INSERT sin id          -> lo resuelve desde UPPER(BTRIM(cliente))/UPPER(BTRIM(operacion)),
--                               y si no lo encuentra ABORTA;
--   · UPDATE de cliente u operacion -> lo vuelve a resolver, o aborta;
--   · INSERT/UPDATE con id   -> REESCRIBE cliente y operacion desde el catalogo.
-- Por eso en el origen la columna puede ser NOT NULL sin backfill explicito, y sus 175
-- vehiculos cumplen el par al 100 %.
--
-- POR QUE NO SE APLICA TODAVIA: TRES COSAS QUE ROMPE, MEDIDAS EN LA BRANCH AISLADA
-- -------------------------------------------------------------------------------------
-- 1) LA SUITE DE REGRESION DE TI-PR-01 NO ARRANCA.
--    43 suites crean su fixture con INSERT INTO vehiculos (placa) VALUES ($1), sin cliente
--    ni operacion. Medido con el trigger instalado:
--        [FALLA] ERROR NO CONTROLADO: La combinación cliente <NULL> / operación <NULL> no existe
--            at async unidad (x43.mjs:78)
--    La suite muere al construir el fixture, antes de ejecutar una sola asercion.
--
-- 2) UN SCRIPT DEL REPOSITORIO.
--    scripts/ti-pr-01/probar-generador.mjs:78 hace ese mismo INSERT.
--
-- 3) UN CAMINO VIVO DE LA API.
--    flota/service.js:195 exige placa y operacion, pero NO exige cliente. Un alta con
--    operacion y sin cliente se acepta hoy y dejaria de aceptarse. No es solo cosa de
--    pruebas: es el formulario de alta de vehiculos.
--
-- Y UNA CONSECUENCIA MAS, QUE NO ES UN FALLO PERO HAY QUE SABERLA
-- -------------------------------------------------------------------------------------
-- La tercera rama reescribe el texto desde el catalogo. Los 31 vehiculos que la 902 asigno
-- por nivel 2 tienen hoy un texto que no concuerda con su id -vacio, en su mayoria-. La
-- primera vez que alguien los edite, el trigger les normalizara cliente y operacion. El
-- backfill no los toco; la primera edicion si lo hara. Si eso no se quiere, hay que
-- decidirlo antes, no despues.
--
-- QUE HAY QUE RESOLVER ANTES DE APLICARLA
-- -------------------------------------------------------------------------------------
-- a) Decidir si el alta de vehiculo debe exigir cliente ademas de operacion, y aplicarlo
--    en flota/service.js si la respuesta es si.
-- b) Dar a los fixtures de las 43 suites y a probar-generador.mjs un par valido, o
--    hacerlos insertar cliente_operacion_id directamente.
-- c) Los 29 vehiculos con texto incompatible con chk_vehiculos_cliente/_operacion siguen
--    siendo ineditables con trigger o sin el: eso es anterior y va por su propia via.
-- =====================================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace
                   AND proname = 'sincronizar_vehiculo_cliente_operacion') THEN
    RAISE EXCEPTION
      'Falta sincronizar_vehiculo_cliente_operacion(). Aplica primero migrations/20261007_903_multi_tenant_triggers.sql.';
  END IF;

  IF (SELECT count(*) FROM cliente_operaciones WHERE activo = TRUE) = 0 THEN
    RAISE EXCEPTION
      'cliente_operaciones esta vacia: este trigger dejaria vehiculos sin poder editarse ni darse de alta.';
  END IF;
END $$;

-- Ojo al UPDATE OF: solo se dispara si se tocan esas tres columnas, no en cualquier UPDATE
-- de vehiculos. Un UPDATE de marca_tracto, por ejemplo, no lo despierta.
CREATE TRIGGER trg_sincronizar_vehiculo_cliente_operacion
  BEFORE INSERT OR UPDATE OF cliente, operacion, cliente_operacion_id ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION sincronizar_vehiculo_cliente_operacion();

COMMIT;
