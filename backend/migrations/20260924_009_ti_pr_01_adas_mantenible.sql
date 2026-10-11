-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260924_009 · ADAS COMO FAMILIA MANTENIBLE ANUAL
-- =====================================================================================
-- CLASIFICACION: AMPLIACION DE DOMINIO. Ensancha constraints; no estrecha ninguna.
--                0 DROP COLUMN · 0 DROP TABLE · 0 DELETE · 0 CASCADE.
--
-- MIGRACION FORWARD. No reescribe 004, 005, 006 ni ninguna anterior, todas ya
-- aplicadas persistentemente en la branch de pruebas.
--
-- POR QUE EXISTE
-- --------------
-- El programa incorpora el mantenimiento del sistema ADAS, que TI ejecuta unicamente
-- sobre equipos Tracklog/EVO. Hoy el dominio de familias mantenibles no admite ADAS:
--   chk_frecuencia_tipo_equipo -> DVR, COPILOTO, RADIO_BASE, CAMARAS, GPS
--   chk_ciclo_tipo_equipo      -> los mismos cinco
-- Por eso no puede declararse la periodicidad ADAS ni registrarse su ciclo.
--
-- ADAS es anual, como el GPS: SOLO nivel M3, 24 quincenas. La fuente lo respalda:
-- IMP_PERIODICIDAD del Excel declara ADAS M3 = 365 dias y GPS M3 = 365 dias, y no
-- declara ADAS M1 ni ADAS M2.
--
-- LO QUE ESTA MIGRACION **NO** HACE, Y ES DELIBERADO
-- -------------------------------------------------
-- Admitir tipo_equipo='ADAS' NO convierte en mantenible a cualquier ADAS. En el
-- inventario actual de las 174 unidades activas hay 28 ADAS instalados y solo UNO es
-- Tracklog:
--     "MIX  TELEMATICS"  26     <- no participa del programa
--     "EVO TRACKLOG"      1     <- si participa
--     "WISETRACK"         1     <- no participa
--     NO_APLICA          67  ·  POR_VALIDAR  79
--
-- Un CHECK es local a la fila y no puede consultar vehiculo_equipos, asi que la base
-- NO puede impedir por si sola que se cree un ciclo ADAS de un MIX TELEMATICS. Esto no
-- es una regresion: la base tampoco impide hoy crear un ciclo DVR de una unidad sin
-- DVR. En las cinco familias la regla de aplicabilidad por inventario vive en el
-- loader, y la de ADAS vive en el mismo sitio, con este matcher POSITIVO derivado de
-- los valores reales de vehiculo_equipos.marca:
--
--     ADAS elegible  <=>  estado_inventario = 'INSTALADO'
--                    AND  marca ILIKE '%TRACKLOG%'
--
-- Se empareja por la subcadena TRACKLOG y NO por EVO a secas: la cadena "EVO" aparece
-- dentro de "NUEVO EQUIPO", un marcador que el propio libro usa en HISTORICO_GPS.
-- Tampoco se usa "distinto de MIX" ni "ausencia de otro proveedor": una lista negativa
-- convertiria en elegible a cualquier proveedor futuro que nadie haya previsto.
--
-- PRECONDICIONES
-- --------------
--   * 20260923_004, _005 y _006 aplicadas.
--   * Fase B cargada: el programa TI-PR-01 existe con sus 13 periodicidades.
--   * Las constraints que se ensanchan solo admiten valores nuevos, asi que las 13
--     periodicidades y los 531 ciclos M1 ya cargados las satisfacen sin cambios.
--
-- TRANSACCIONAL: ejecutar completa dentro de BEGIN/COMMIT.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0 · GUARDA PREVIA. Si el punto de partida no es el auditado, no se toca nada.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_programa   integer;
    v_frec       integer;
    v_adas_frec  integer;
    v_adas_ciclo integer;
BEGIN
    SELECT count(*) INTO v_programa FROM programas_mantenimiento WHERE codigo = 'TI-PR-01';
    IF v_programa <> 1 THEN
        RAISE EXCEPTION 'Esperaba 1 programa TI-PR-01, encontre %. Fase B debe estar cargada.', v_programa;
    END IF;

    SELECT count(*) INTO v_frec FROM programa_mantenimiento_frecuencias;
    IF v_frec <> 13 THEN
        RAISE EXCEPTION 'Esperaba las 13 periodicidades ya cargadas, encontre %', v_frec;
    END IF;

    SELECT count(*) INTO v_adas_frec  FROM programa_mantenimiento_frecuencias  WHERE tipo_equipo = 'ADAS';
    SELECT count(*) INTO v_adas_ciclo FROM programa_mantenimiento_unidad_ciclos WHERE tipo_equipo = 'ADAS';
    IF v_adas_frec <> 0 OR v_adas_ciclo <> 0 THEN
        RAISE EXCEPTION 'Ya existe ADAS: % periodicidad(es) y % ciclo(s). Esta migracion es la que lo introduce.',
            v_adas_frec, v_adas_ciclo;
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1 · programa_mantenimiento_frecuencias · el dominio admite ADAS
--     Sustituye a chk_frecuencia_tipo_equipo, que solo admitia las cinco familias.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    DROP CONSTRAINT chk_frecuencia_tipo_equipo;

ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT chk_frecuencia_tipo_equipo CHECK (tipo_equipo IN (
        'DVR', 'CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

-- -------------------------------------------------------------------------------------
-- 2 · programa_mantenimiento_frecuencias · las familias ANUALES solo admiten M3
--     Sustituye a chk_frecuencia_gps_solo_m3, que solo cubria el GPS. El nombre cambia
--     porque la regla ya no es de un solo equipo: es la regla de las familias anuales.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    DROP CONSTRAINT chk_frecuencia_gps_solo_m3;

ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT chk_frecuencia_anual_solo_m3 CHECK (
        tipo_equipo NOT IN ('GPS', 'ADAS') OR nivel_mantenimiento = 'M3');

-- -------------------------------------------------------------------------------------
-- 3 · programa_mantenimiento_unidad_ciclos · el mismo par de reglas
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_unidad_ciclos
    DROP CONSTRAINT chk_ciclo_tipo_equipo;

ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT chk_ciclo_tipo_equipo CHECK (tipo_equipo IN (
        'DVR', 'CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

ALTER TABLE programa_mantenimiento_unidad_ciclos
    DROP CONSTRAINT chk_ciclo_gps_solo_m3;

ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT chk_ciclo_anual_solo_m3 CHECK (
        tipo_equipo NOT IN ('GPS', 'ADAS') OR nivel_mantenimiento = 'M3');

-- -------------------------------------------------------------------------------------
-- 4 · La periodicidad ADAS / M3 / 24 quincenas
--     version_id queda NULL, como las 13 anteriores: la periodicidad pertenece al
--     PROGRAMA, no a la revision documental.
--     Las 13 existentes no se tocan: este INSERT solo añade la catorceava.
-- -------------------------------------------------------------------------------------
INSERT INTO programa_mantenimiento_frecuencias
    (programa_id, version_id, tipo_equipo, nivel_mantenimiento, frecuencia_quincenas)
SELECT p.id, NULL, 'ADAS', 'M3', 24
  FROM programas_mantenimiento p
 WHERE p.codigo = 'TI-PR-01';

-- -------------------------------------------------------------------------------------
-- 5 · VERIFICACION FINAL. Aborta si el resultado no es exactamente el esperado.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_total    integer;
    v_adas     integer;
    v_gps      integer;
    v_anual_ok integer;
BEGIN
    SELECT count(*) INTO v_total FROM programa_mantenimiento_frecuencias;
    IF v_total <> 14 THEN
        RAISE EXCEPTION 'Esperaba 14 periodicidades, hay %', v_total;
    END IF;

    SELECT count(*) INTO v_adas FROM programa_mantenimiento_frecuencias
     WHERE tipo_equipo = 'ADAS' AND nivel_mantenimiento = 'M3' AND frecuencia_quincenas = 24;
    IF v_adas <> 1 THEN
        RAISE EXCEPTION 'Esperaba 1 periodicidad ADAS/M3/24, hay %', v_adas;
    END IF;

    SELECT count(*) INTO v_gps FROM programa_mantenimiento_frecuencias
     WHERE tipo_equipo = 'GPS' AND nivel_mantenimiento = 'M3' AND frecuencia_quincenas = 24;
    IF v_gps <> 1 THEN
        RAISE EXCEPTION 'La periodicidad GPS/M3/24 debia quedar intacta, hay %', v_gps;
    END IF;

    -- ninguna familia anual puede tener M1 ni M2
    SELECT count(*) INTO v_anual_ok FROM programa_mantenimiento_frecuencias
     WHERE tipo_equipo IN ('GPS','ADAS') AND nivel_mantenimiento <> 'M3';
    IF v_anual_ok <> 0 THEN
        RAISE EXCEPTION 'Hay % periodicidad(es) anual(es) con nivel distinto de M3', v_anual_ok;
    END IF;

    -- las 12 periodicidades de las cuatro familias quincenales siguen intactas
    SELECT count(*) INTO v_anual_ok FROM programa_mantenimiento_frecuencias
     WHERE tipo_equipo IN ('DVR','CAMARAS','COPILOTO','RADIO_BASE');
    IF v_anual_ok <> 12 THEN
        RAISE EXCEPTION 'Esperaba 12 periodicidades quincenales intactas, hay %', v_anual_ok;
    END IF;

    RAISE NOTICE 'ADAS habilitado: 14 periodicidades, ADAS/M3=24, GPS/M3=24, 12 quincenales intactas';
END $$;

-- -------------------------------------------------------------------------------------
-- DOCUMENTACION
-- -------------------------------------------------------------------------------------
COMMENT ON COLUMN programa_mantenimiento_frecuencias.tipo_equipo IS
    'Familia mantenible del programa. DVR, CAMARAS, COPILOTO y RADIO_BASE son quincenales (M1/M2/M3). GPS y ADAS son anuales: solo M3, 24 quincenas. Admitir ADAS en el dominio no lo hace mantenible por si mismo: la elegibilidad se decide con el inventario, exigiendo estado_inventario=INSTALADO y marca que contenga TRACKLOG.';

COMMENT ON COLUMN programa_mantenimiento_unidad_ciclos.tipo_equipo IS
    'Familia mantenible a la que pertenece el ciclo. GPS y ADAS solo admiten M3. Para ADAS, la elegibilidad exige que el inventario de la unidad tenga ese equipo INSTALADO y con marca Tracklog; el resto de proveedores (MIX TELEMATICS, WISETRACK) permanecen en inventario sin generar mantenimiento.';
