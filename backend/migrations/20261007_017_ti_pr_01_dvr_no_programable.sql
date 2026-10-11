-- =====================================================================================
-- TI-PR-01 · 017 · DVR DEJA DE SER FAMILIA PROGRAMABLE
-- =====================================================================================
-- Decision de negocio aprobada el 2026-10-07: el DVR forma parte del sistema de CAMARAS
-- y no se programa por separado. El alcance regular del programa pasa a ser:
--
--     REGULARES PROGRAMABLES :  CAMARAS · COPILOTO · RADIO_BASE   (un nivel comun por visita)
--     ANUALES                :  GPS · ADAS                        (solo M3, sin cambios aqui)
--
-- DVR sigue existiendo como DATO FISICO en vehiculo_equipos (DVR_INTERNO / DVR_EXTERNO),
-- con su marca, su numero de serie y su fecha de instalacion. Lo que desaparece es su
-- condicion de familia con cadencia propia.
--
-- -------------------------------------------------------------------------------------
-- POR QUE ESTO NO CAMBIA NINGUNA VISITA NI NINGUN NIVEL
-- -------------------------------------------------------------------------------------
-- DVR no era una familia con fase propia: era una COPIA de CAMARAS. Medido sobre los datos
-- reales antes de escribir esta migracion:
--
--   · frecuencias DVR identicas a CAMARAS                   M1=1  M2=6  M3=12
--   · ciclos  M1  DVR vs CAMARAS   145 pares, 145 iguales,  0 distintos
--   · anclas  M2  DVR vs CAMARAS   145 pares, 145 iguales,  0 distintos
--   · anclas  M3  DVR vs CAMARAS   145 pares, 145 iguales,  0 distintos
--   · inventario placa a placa     175 placas, 175 coinciden, 0 difieren
--   · unidades con DVR instalado y CAMARAS no instalado           0
--   · unidades que perderian TODO su regular si DVR sale          0
--   · visitas donde DVR es el UNICO detalle regular               0
--
-- Y la razon esta documentada en el propio cargador historico
-- (backend/scripts/ti-pr-01/cargar-b4-ciclos-m1.mjs, lineas 70-72): la hoja Inspecciones
-- NO tiene columna de DVR, asi que su ciclo M1 se sembro con la evidencia de la columna de
-- camaras. La fase de DVR nacio copiada de CAMARAS. Retirarla no pierde informacion.
--
-- Por eso el MAX(M3>M2>M1) del paso 3 del generador da el mismo resultado sin DVR, y
-- ninguna visita desaparece ni baja de nivel.
--
-- -------------------------------------------------------------------------------------
-- QUE NO TOCA ESTA MIGRACION
-- -------------------------------------------------------------------------------------
--   · chk_vehiculo_equipo_tipo y la tabla vehiculo_equipos        -> DVR fisico INTACTO
--   · GPS y ADAS, en cualquier tabla                             -> sin un solo cambio
--   · ordenes_trabajo y ordenes_trabajo_detalle                   -> no se escribe en ellas
--   · ciclos y anclas de CAMARAS, COPILOTO, RADIO_BASE, GPS, ADAS -> intactos
--   · programacion_mantenimiento (las visitas)                    -> ni una fila
--
-- -------------------------------------------------------------------------------------
-- ORDEN OBLIGATORIO, impuesto por las FK reales (verificadas en pg_constraint)
-- -------------------------------------------------------------------------------------
--   fk_programacion_equipo_frecuencia
--     programacion_mantenimiento_equipos (programa_id, tipo_equipo, nivel_mantenimiento)
--       -> programa_mantenimiento_frecuencias   ON DELETE RESTRICT
--
-- Es la UNICA FK que apunta a frecuencias, y es ademas el unico control de dominio de
-- programacion_mantenimiento_equipos.tipo_equipo: esa columna NO tiene CHECK. Por tanto,
-- retirar la fila de frecuencia de DVR es lo que vuelve IMPOSIBLE un detalle DVR, y en
-- cascada un ordenes_trabajo_detalle de DVR, que solo puede nacer de un equipo previsto.
--
-- De ahi el orden: primero los detalles de programacion, despues ciclos y anclas (que no
-- referencian frecuencias), al final las frecuencias y los CHECK.
--
-- -------------------------------------------------------------------------------------
-- LA GUARDA DEL PASO 1 · regla R2 de 20260928_016
-- -------------------------------------------------------------------------------------
-- congelar_alcance_programado() prohibe BORRAR un equipo previsto de una visita que ya
-- tuvo CUALQUIER orden de trabajo, este ABIERTA, CERRADA o ANULADA: su alcance es
-- historico. Esta migracion NO desactiva ese trigger y NO lo elude.
--
-- Si quedara algun detalle DVR colgado de una visita con historial de OT, el paso 1 aborta
-- con un mensaje que nombra las visitas implicadas, porque retirar un alcance ya historico
-- es una decision de negocio que no le corresponde a una migracion.
--
-- En db-refactor esa guarda es un no-op comprobable: programacion_mantenimiento = 0 y
-- ordenes_trabajo = 0. Es justamente la razon por la que esta correccion se aplica ANTES de
-- materializar programacion real.
--
-- Idempotente: todos los pasos se pueden repetir. Transaccional: o entra entera o nada.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- PASO 0 · contexto y guarda de R2
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_frec      integer;
    v_ciclos    integer;
    v_anclas    integer;
    v_detalles  integer;
    v_bloqueado integer;
    v_visitas   text;
    v_ot        integer;
BEGIN
    SELECT count(*) INTO v_frec
      FROM programa_mantenimiento_frecuencias WHERE tipo_equipo = 'DVR';
    SELECT count(*) INTO v_ciclos
      FROM programa_mantenimiento_unidad_ciclos WHERE tipo_equipo = 'DVR';
    SELECT count(*) INTO v_anclas
      FROM programa_mantenimiento_unidad_anclas WHERE tipo_equipo = 'DVR';
    SELECT count(*) INTO v_detalles
      FROM programacion_mantenimiento_equipos WHERE tipo_equipo = 'DVR';

    RAISE NOTICE '017 · estado inicial de DVR como familia programable:';
    RAISE NOTICE '      frecuencias % · ciclos % · anclas % · detalles de programacion %',
        v_frec, v_ciclos, v_anclas, v_detalles;

    -- Detalles DVR cuya visita ya tuvo alguna OT: R2 los declara historicos.
    SELECT count(*), string_agg(DISTINCT e.programacion_id::text, ', ' ORDER BY e.programacion_id::text)
      INTO v_bloqueado, v_visitas
      FROM programacion_mantenimiento_equipos e
     WHERE e.tipo_equipo = 'DVR'
       AND EXISTS (SELECT 1 FROM ordenes_trabajo o
                    WHERE o.programacion_id = e.programacion_id);

    IF v_bloqueado > 0 THEN
        RAISE EXCEPTION
            'No se puede retirar DVR: % detalle(s) DVR pertenecen a visitas que YA tuvieron '
            'una orden de trabajo (%), y la regla R2 de 20260928_016 declara su alcance '
            'HISTORICO e inmutable, tambien con la OT CERRADA o ANULADA. Esta migracion no '
            'desactiva ese trigger. Resuelve esas visitas antes de reintentar: el modelo '
            'exige crear una programacion NUEVA, no reescribir la existente.',
            v_bloqueado, v_visitas;
    END IF;

    -- Trazabilidad: un ciclo DVR nacido del cierre de una OT referencia un detalle de OT
    -- con ON DELETE RESTRICT. Si existiera, el paso 2 fallaria y ademas significaria que
    -- hubo mantenimiento de DVR realmente ejecutado y registrado.
    SELECT count(*) INTO v_ot
      FROM programa_mantenimiento_unidad_ciclos
     WHERE tipo_equipo = 'DVR' AND orden_trabajo_detalle_id IS NOT NULL;

    IF v_ot > 0 THEN
        RAISE EXCEPTION
            'No se puede retirar DVR: % ciclo(s) DVR citan un detalle de orden de trabajo '
            '(fuente ORDENES_TRABAJO). Eso es evidencia de mantenimiento DVR realmente '
            'ejecutado y cerrado: retirarlo exige una decision de negocio explicita sobre '
            'ese historico.', v_ot;
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- PASO 1 · equipos previstos DVR de las visitas
-- -------------------------------------------------------------------------------------
-- Va primero por fk_programacion_equipo_frecuencia (ON DELETE RESTRICT). El paso 0 ya
-- garantizo que ninguna de estas filas pertenece a un alcance historico, asi que
-- congelar_alcance_programado las deja pasar.
DELETE FROM programacion_mantenimiento_equipos
 WHERE tipo_equipo = 'DVR';

-- -------------------------------------------------------------------------------------
-- PASO 2 · ciclos DVR
-- -------------------------------------------------------------------------------------
-- Copia exacta de los de CAMARAS, sembrada desde la columna de camaras del Excel. No son
-- una fase propia y no se pierde ninguna evidencia: la de CAMARAS permanece.
DELETE FROM programa_mantenimiento_unidad_ciclos
 WHERE tipo_equipo = 'DVR';

-- -------------------------------------------------------------------------------------
-- PASO 3 · anclas DVR
-- -------------------------------------------------------------------------------------
-- Derivadas del M1 de DVR, que a su vez venia de CAMARAS. Mismo argumento.
DELETE FROM programa_mantenimiento_unidad_anclas
 WHERE tipo_equipo = 'DVR';

-- -------------------------------------------------------------------------------------
-- PASO 4 · frecuencias DVR
-- -------------------------------------------------------------------------------------
-- Las tres filas M1/M2/M3. Esto es lo que apaga la familia: sin fila de frecuencia, la FK
-- impide insertar un equipo previsto DVR, y por tanto tambien un detalle de OT de DVR.
DELETE FROM programa_mantenimiento_frecuencias
 WHERE tipo_equipo = 'DVR';

-- -------------------------------------------------------------------------------------
-- PASO 5 · estrechar los tres CHECK de dominio PROGRAMABLE
-- -------------------------------------------------------------------------------------
-- Son las tres tablas que definen que es una familia con cadencia. Sin este paso, nada
-- impediria volver a insertar la frecuencia de DVR manana.
--
-- chk_vehiculo_equipo_tipo NO aparece aqui a proposito: ese CHECK gobierna el INVENTARIO
-- FISICO, donde DVR_INTERNO y DVR_EXTERNO siguen siendo tipos validos y necesarios.
ALTER TABLE programa_mantenimiento_frecuencias
  DROP CONSTRAINT IF EXISTS chk_frecuencia_tipo_equipo;
ALTER TABLE programa_mantenimiento_frecuencias
  ADD CONSTRAINT chk_frecuencia_tipo_equipo
  CHECK (tipo_equipo IN ('CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

ALTER TABLE programa_mantenimiento_unidad_ciclos
  DROP CONSTRAINT IF EXISTS chk_ciclo_tipo_equipo;
ALTER TABLE programa_mantenimiento_unidad_ciclos
  ADD CONSTRAINT chk_ciclo_tipo_equipo
  CHECK (tipo_equipo IN ('CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

ALTER TABLE programa_mantenimiento_unidad_anclas
  DROP CONSTRAINT IF EXISTS chk_ancla_tipo_equipo;
ALTER TABLE programa_mantenimiento_unidad_anclas
  ADD CONSTRAINT chk_ancla_tipo_equipo
  CHECK (tipo_equipo IN ('CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

-- -------------------------------------------------------------------------------------
-- PASO 6 · verificacion dentro de la misma transaccion
-- -------------------------------------------------------------------------------------
-- Si algo no quedo como debe, esto aborta y revierte la migracion completa.
DO $$
DECLARE
    v_total    integer;
    v_fisico   integer;
    v_gps      integer;
    v_adas     integer;
    v_otras    integer;
BEGIN
    SELECT (SELECT count(*) FROM programa_mantenimiento_frecuencias   WHERE tipo_equipo='DVR')
         + (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos WHERE tipo_equipo='DVR')
         + (SELECT count(*) FROM programa_mantenimiento_unidad_anclas WHERE tipo_equipo='DVR')
         + (SELECT count(*) FROM programacion_mantenimiento_equipos   WHERE tipo_equipo='DVR')
      INTO v_total;

    IF v_total <> 0 THEN
        RAISE EXCEPTION '017 · quedan % filas DVR en el dominio programable', v_total;
    END IF;

    -- el DVR fisico tiene que seguir ahi
    SELECT count(*) INTO v_fisico FROM vehiculo_equipos
     WHERE tipo_equipo IN ('DVR_INTERNO', 'DVR_EXTERNO');

    IF v_fisico = 0 THEN
        RAISE EXCEPTION '017 · el inventario fisico de DVR quedo vacio: eso NO debia pasar';
    END IF;

    -- GPS y ADAS intactos en frecuencias
    SELECT count(*) INTO v_gps  FROM programa_mantenimiento_frecuencias WHERE tipo_equipo='GPS';
    SELECT count(*) INTO v_adas FROM programa_mantenimiento_frecuencias WHERE tipo_equipo='ADAS';

    IF v_gps <> 1 OR v_adas <> 1 THEN
        RAISE EXCEPTION '017 · GPS/ADAS alterados: frecuencias GPS=% ADAS=%', v_gps, v_adas;
    END IF;

    -- las otras tres regulares siguen teniendo sus tres niveles
    SELECT count(*) INTO v_otras FROM programa_mantenimiento_frecuencias
     WHERE tipo_equipo IN ('CAMARAS', 'COPILOTO', 'RADIO_BASE');

    IF v_otras <> 9 THEN
        RAISE EXCEPTION '017 · se esperaban 9 frecuencias regulares (3 familias x 3 niveles), hay %',
            v_otras;
    END IF;

    RAISE NOTICE '017 · OK · DVR fuera del dominio programable · inventario fisico % filas · '
        'GPS y ADAS intactos · 9 frecuencias regulares', v_fisico;
END $$;

COMMIT;

-- =====================================================================================
-- ROLLBACK MANUAL
-- =====================================================================================
-- No se entrega script de reversion automatica: reinsertar las frecuencias de DVR
-- devolveria la familia al dominio programable, pero NO reconstruiria sus 145 ciclos ni
-- sus 290 anclas, que eran una copia derivada de CAMARAS. Si hubiera que revertir, el
-- camino correcto es reinsertar las 3 frecuencias, reanchar los tres CHECK y volver a
-- derivar ciclos y anclas desde CAMARAS, que es de donde salieron.
-- =====================================================================================
