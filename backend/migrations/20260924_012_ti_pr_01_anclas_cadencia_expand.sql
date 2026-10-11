-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260924_012 · ANCLAS DE CADENCIA
-- =====================================================================================
-- CLASIFICACION: EXPANSION ADITIVA. Crea una tabla nueva.
--   0 ALTER sobre tablas existentes.
--   0 DROP. 0 UPDATE. 0 DELETE. 0 TRUNCATE.
--   No toca los 688 ciclos ya cargados (531 M1 + 157 M3), ni el inventario, ni las
--   unidades, ni las periodicidades, ni la programacion.
--
-- Debe ejecutarse DESPUES de 20260924_009 y ANTES de los cleanup 20261001_900 y
-- 20261001_901. El orden lexico de los ficheros es el orden real de ejecucion.
--
-- -------------------------------------------------------------------------------------
-- QUE PROBLEMA RESUELVE
-- -------------------------------------------------------------------------------------
-- programa_mantenimiento_unidad_ciclos tiene UNA fila por (unidad, tipo_equipo, nivel)
-- y esa fila significa "ultima ejecucion de ese nivel". Para DVR, CAMARAS, COPILOTO y
-- RADIO_BASE hoy existen 531 filas M1 y CERO filas M2 o M3: todavia no se ha ejecutado
-- ningun M2 ni M3 de esas familias.
--
-- Sin esta tabla, un generador de programacion esta obligado a calcular el M2 y el M3
-- de esas familias a partir de la unica fila que existe, la M1. Y esa fila cambia cada
-- vez que se ejecuta un M1. Medido sobre el modelo real, con q0 = 2026-09-01 y las
-- periodicidades declaradas (M1=1, M2=6, M3=12 quincenas):
--
--   generacion inicial   ref M1 = 2026-09-01  ->  M2 2026-12-01   M3 2027-03-01
--   tras ejecutar M1 #1  ref M1 = 2026-09-16  ->  M2 2026-12-16   M3 2027-03-16
--   tras ejecutar M1 #2  ref M1 = 2026-10-01  ->  M2 2027-01-01   M3 2027-04-01
--   tras ejecutar M1 #3  ref M1 = 2026-10-16  ->  M2 2027-01-16   M3 2027-04-16
--   tras ejecutar M1 #4  ref M1 = 2026-11-01  ->  M2 2027-02-01   M3 2027-05-01
--
-- Cada M1 empuja M2 y M3 una quincena mas. Eso es deriva de fase y es incorrecto.
--
-- La causa no es la aritmetica de quincenas: es que el ANCLA DE CADENCIA y la
-- REFERENCIA DE EJECUCION son hoy la misma celda. Esta tabla las separa.
--
-- Notese que el problema intra-nivel ya estaba resuelto: una ejecucion fisica
-- adelantada o atrasada no mueve nada, porque el siguiente vencimiento se calcula
-- desde ultima_quincena (imputacion administrativa) y no desde ultima_fecha_real
-- (dia fisico). Lo que faltaba era el caso inter-nivel.
--
-- -------------------------------------------------------------------------------------
-- QUE SIGNIFICA quincena_ancla · Y QUE NO SIGNIFICA
-- -------------------------------------------------------------------------------------
-- quincena_ancla NO es la proxima fecha de mantenimiento. Es la REFERENCIA FIJA DE FASE
-- desde la cual se calcula el PRIMER vencimiento de un nivel que todavia nunca tuvo
-- ejecucion real.
--
-- Regla unica de calculo, y la unica permitida:
--
--   proximo(N) = COALESCE(
--                  ultima_quincena del ciclo EJECUTADO de nivel N,   -- si existe
--                  quincena_ancla del nivel N                        -- si no
--                ) + frecuencia_quincenas(N)
--
-- El ciclo real SIEMPRE tiene precedencia sobre el ancla. En cuanto existe una fila de
-- nivel N en programa_mantenimiento_unidad_ciclos, el ancla de ese nivel deja de
-- gobernar el calculo y queda como evidencia de como arranco la fase.
--
-- QUEDA PROHIBIDO, despues de la inicializacion, recalcular:
--       M2 = ultimo M1 + 6
--       M3 = ultimo M1 + 12
-- Un M1 nuevo no debe desplazar ni M2 ni M3. Las anclas de M2 y M3 solo cambian por una
-- decision de negocio explicita (origen = 'MANUAL'), y solo mientras ese nivel no tenga
-- ejecucion real.
--
-- -------------------------------------------------------------------------------------
-- JERARQUIA ACUMULATIVA · LA PROPAGACION VA SOLO HACIA ABAJO
-- -------------------------------------------------------------------------------------
-- M2 incluye M1. M3 incluye M2 y M1. Por tanto, al ejecutarse una OT se actualizan las
-- referencias del nivel ejecutado Y DE TODOS LOS INFERIORES, nunca las superiores:
--
--   M1 ejecutado  ->  actualiza M1.              No toca M2 ni M3.
--   M2 ejecutado  ->  actualiza M2 y M1.         No toca M3.
--   M3 ejecutado  ->  actualiza M3, M2 y M1.
--
-- Esto NO significa crear tres detalles de mantenimiento:
-- programacion_mantenimiento_equipos guarda UNICAMENTE el nivel maximo ejecutado para
-- cada familia en la visita. Un CAMARAS/M3 ejecutado produce un solo detalle,
-- CAMARAS/M3. La propagacion ocurre al actualizar las referencias de ciclo, no
-- duplicando detalles.
--
-- Consecuencia practica: si se ejecuta un M3 antes de que exista ningun M2, la
-- propagacion CREA la fila de ciclo M2. No es historia inventada: el alcance de M2 fue
-- realmente cubierto por esa OT, y sus observaciones citan la OT de origen.
--
-- -------------------------------------------------------------------------------------
-- REPROGRAMACION · NO PASA POR EL ANCLA
-- -------------------------------------------------------------------------------------
--   * una ejecucion fisica adelantada o atrasada NO mueve la fase: el siguiente
--     vencimiento se calcula desde ultima_quincena, no desde ultima_fecha_real;
--   * reprogramar formalmente una obligacion es rellenar
--     programacion_mantenimiento.quincena_reprogramada, de donde sale la columna
--     generada quincena_efectiva = COALESCE(quincena_reprogramada, quincena_programada);
--   * cuando esa OT se EJECUTA, el ciclo del nivel (y los inferiores, por la jerarquia
--     acumulativa) se actualiza usando quincena_efectiva;
--   * esa nueva referencia es la que mueve la fase futura.
--
-- El ancla NO se usa para reprogramar ni para falsificar una ejecucion.
--
-- -------------------------------------------------------------------------------------
-- POR QUE UNA TABLA NUEVA Y NO COLUMNAS EXISTENTES
-- -------------------------------------------------------------------------------------
-- programa_mantenimiento_unidades tiene fecha_base_m1, fecha_base_m2, fecha_base_m3 y
-- quincena_arranque, las cuatro NULL en las 174 unidades. Se descartaron porque:
--
--   * su grano es POR UNIDAD, no por (unidad, tipo_equipo). Hoy las 4 familias comparten
--     quincena en las 145 unidades con M1, pero solo porque la siembra B4 las derivo de
--     la MISMA inspeccion. En operacion cada familia puede divergir, y entonces un ancla
--     por unidad seria irrepresentable;
--   * se llaman fecha_* y aqui la semantica es de quincena administrativa;
--   * no tienen columna de origen, asi que no dejarian rastro de por que cambio una fase;
--   * el cleanup 20261001_900 las elimina, y son columnas del diseno pre-normalizacion
--     que se deprecaron a proposito.
--
-- Tampoco se usa programacion_mantenimiento como memoria de fase: con horizonte mensual,
-- el M2 del 2026-12-01 no se materializa al generar octubre ni noviembre, asi que al
-- generar diciembre no habria fila de la que anclarse. Un CANCELADO o un borrado
-- destruirian la fase.
--
-- -------------------------------------------------------------------------------------
-- QUE NO HACE ESTA MIGRACION
-- -------------------------------------------------------------------------------------
-- No inserta ni una sola fila. La siembra de las anclas la hace un loader aparte, con
-- su propia huella del Excel y su propio ensayo en ROLLBACK, igual que B4 y M3.
--
-- No crea M2 ni M3 en programa_mantenimiento_unidad_ciclos. Esa tabla sigue
-- significando EXCLUSIVAMENTE ejecucion o referencia historica real, y no se inventan
-- ejecuciones para conservar fase.
--
-- No hay FK hacia programa_mantenimiento_frecuencias, a proposito: un cambio de reglas
-- del programa no debe poder borrar en cascada las anclas ni el historico. El dominio
-- lo sostienen los CHECK de esta tabla.
--
-- No hay FK hacia programas_mantenimiento_versiones, a proposito: una nueva version
-- documental NO reinicia anclas, ciclos, programaciones ni frecuencias.
-- =====================================================================================

-- ---------------------------------------------------------------- 1 · GUARDAS ESTRUCTURALES
-- Solo invariantes de ESTRUCTURA, las que esta migracion necesita para poder crear la
-- tabla y para que la tabla signifique algo. Se cumplen en cualquier despliegue de este
-- esquema, no solo en esta base.
--
-- Los CONTEOS de la carga actual (688 ciclos, 531 M1, 157 M3 anuales, 14 periodicidades,
-- 0 M2/M3 quincenales, 1 programa TI-PR-01) NO estan aqui a proposito: describen el
-- snapshot de ESTA base, no la estructura. Si estuvieran, esta migracion abortaria en
-- cualquier otro despliegue sin ninguna razon estructural. Viven en el loader que siembra
-- las 1062 anclas, que es donde abortar por un conteo distinto es lo correcto.
DO $$
DECLARE
    v_falta text;
BEGIN
    -- a) la tabla no existe todavia: esta migracion no se reaplica
    IF to_regclass('public.programa_mantenimiento_unidad_anclas') IS NOT NULL THEN
        RAISE EXCEPTION 'programa_mantenimiento_unidad_anclas ya existe. Esta migracion no se reaplica.';
    END IF;

    -- b) las tablas de las que depende
    FOREACH v_falta IN ARRAY ARRAY['programa_mantenimiento_unidades',
                                   'programa_mantenimiento_frecuencias',
                                   'programa_mantenimiento_unidad_ciclos'] LOOP
        IF to_regclass('public.' || v_falta) IS NULL THEN
            RAISE EXCEPTION 'Falta la tabla %, requerida por las anclas.', v_falta;
        END IF;
    END LOOP;

    -- c) la clave que la FK compuesta necesita referenciar
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.programa_mantenimiento_unidades'::regclass
          AND contype IN ('p', 'u')
          -- attname es de tipo name: hay que castear a text para comparar con el literal
          AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                 FROM unnest(conkey) k JOIN pg_attribute a
                   ON a.attrelid = conrelid AND a.attnum = k) = ARRAY['id', 'programa_id']
    ) THEN
        RAISE EXCEPTION 'programa_mantenimiento_unidades no tiene UNIQUE/PK sobre (id, programa_id); '
            'la FK compuesta fk_ancla_unidad no puede crearse.';
    END IF;

    -- d) las columnas que la regla de calculo lee
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='programa_mantenimiento_frecuencias'
          AND column_name='frecuencia_quincenas') THEN
        RAISE EXCEPTION 'programa_mantenimiento_frecuencias.frecuencia_quincenas no existe; '
            'sin ella el ancla no sirve para calcular el proximo vencimiento.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='programa_mantenimiento_unidad_ciclos'
          AND column_name='ultima_quincena') THEN
        RAISE EXCEPTION 'programa_mantenimiento_unidad_ciclos.ultima_quincena no existe; '
            'sin ella no hay precedencia ciclo > ancla.';
    END IF;

    -- e) la funcion del trigger, que NO se recrea aqui para no alterar su search_path
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    ) THEN
        RAISE EXCEPTION 'No existe public.set_updated_at(). La crea 20260918_001; '
            'no se recrea aqui para no alterar su search_path.';
    END IF;
END $$;

-- ------------------------------------------------------------------------- 2 · LA TABLA
CREATE TABLE programa_mantenimiento_unidad_anclas (
    id                  integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    programa_unidad_id  integer      NOT NULL,
    programa_id         integer      NOT NULL,
    tipo_equipo         varchar(20)  NOT NULL,
    nivel_mantenimiento varchar(2)   NOT NULL,
    quincena_ancla      date         NOT NULL,
    origen              varchar(24)  NOT NULL,
    observaciones       text         NULL,
    created_at          timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE programa_mantenimiento_unidad_anclas IS
    'Referencia fija de fase por (unidad, tipo_equipo, nivel). NO es la proxima fecha: '
    'es el punto desde el cual se calcula el PRIMER vencimiento de un nivel que todavia '
    'nunca tuvo ejecucion real. El ciclo ejecutado de programa_mantenimiento_unidad_ciclos '
    'siempre tiene precedencia sobre el ancla.';
COMMENT ON COLUMN programa_mantenimiento_unidad_anclas.quincena_ancla IS
    'Quincena administrativa de referencia (dia 1 o 16). Un M1 nuevo NO la desplaza.';
COMMENT ON COLUMN programa_mantenimiento_unidad_anclas.origen IS
    'De donde sale la fase: DERIVADA_M1_INICIAL en la siembra inicial; MANUAL si una '
    'decision explicita ajusta la fase de arranque de un nivel que todavia no tiene '
    'ejecucion real. No existe EJECUCION_REAL ni REPROGRAMACION_FORMAL: las ejecuciones '
    'viven en programa_mantenimiento_unidad_ciclos y tienen precedencia, y la '
    'reprogramacion se hace con quincena_reprogramada en programacion_mantenimiento.';

-- --------------------------------------------------------------- 3 · GRANO E INTEGRIDAD
-- un solo ancla por unidad, familia y nivel
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT uq_ancla_unidad_equipo_nivel
    UNIQUE (programa_unidad_id, tipo_equipo, nivel_mantenimiento);

-- FK compuesta contra (id, programa_id): impide que un ancla apunte a una unidad de
-- otro programa. ON UPDATE CASCADE por coherencia con el resto del modelo; ON DELETE
-- RESTRICT para que borrar una unidad con anclas exija una decision explicita.
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT fk_ancla_unidad
    FOREIGN KEY (programa_unidad_id, programa_id)
    REFERENCES programa_mantenimiento_unidades (id, programa_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ------------------------------------------------------------------------ 4 · DOMINIOS
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT chk_ancla_tipo_equipo CHECK (tipo_equipo IN (
        'DVR', 'CAMARAS', 'COPILOTO', 'RADIO_BASE', 'GPS', 'ADAS'));

ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT chk_ancla_nivel CHECK (nivel_mantenimiento IN ('M1', 'M2', 'M3'));

-- la quincena administrativa ancla en el dia 1 o en el 16, igual que en ciclos
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT chk_ancla_quincena CHECK (
        EXTRACT(day FROM quincena_ancla) IN (1, 16));

-- Dos valores, y solo dos:
--   DERIVADA_M1_INICIAL  la siembra inicial, derivada del M1 historico de esa familia.
--   MANUAL               ajuste explicito de la fase de arranque de un nivel que
--                        TODAVIA no tiene ejecucion real.
--
-- EJECUCION_REAL no es un origen valido: una ejecucion real pertenece a
-- programa_mantenimiento_unidad_ciclos y ya tiene precedencia por la regla de calculo.
--
-- REPROGRAMACION_FORMAL tampoco lo es, y merece explicacion. La reprogramacion NO pasa
-- por el ancla: se hace en programacion_mantenimiento rellenando quincena_reprogramada,
-- de donde sale quincena_efectiva; cuando esa OT se ejecuta, el ciclo del nivel se
-- actualiza con quincena_efectiva y ES ESA REFERENCIA la que mueve la fase futura.
-- Escribir un ancla con ese origen seria contradictorio: a partir de la primera
-- ejecucion real de un nivel, el ancla ya no gobierna su calculo y el cambio no tendria
-- ningun efecto. El ancla no debe usarse para falsificar una ejecucion.
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT chk_ancla_origen CHECK (origen IN (
        'DERIVADA_M1_INICIAL', 'MANUAL'));

-- GPS y ADAS son familias anuales: si algun dia necesitaran ancla, solo podria ser M3.
-- Mismo criterio que chk_ciclo_anual_solo_m3 y chk_frecuencia_anual_solo_m3.
ALTER TABLE programa_mantenimiento_unidad_anclas
    ADD CONSTRAINT chk_ancla_anual_solo_m3 CHECK (
        tipo_equipo NOT IN ('GPS', 'ADAS') OR nivel_mantenimiento = 'M3');

-- ------------------------------------------------------------------------- 5 · INDICES
-- el generador recorre las anclas por unidad y nivel para calcular el proximo vencimiento
CREATE INDEX idx_anclas_nivel_quincena
    ON programa_mantenimiento_unidad_anclas (nivel_mantenimiento, quincena_ancla);

-- ------------------------------------------------------------------------- 6 · TRIGGER
-- Se REUTILIZA public.set_updated_at(), la misma funcion que ya usan los 8 triggers del
-- modelo. NO se hace CREATE OR REPLACE: la funcion existente lleva
-- SET search_path TO 'pg_catalog', 'public' y un CREATE OR REPLACE sin esa clausula se
-- lo quitaria en silencio, degradando una proteccion de la que dependen otras 8 tablas.
-- Su existencia ya se comprueba en la guarda estructural (e) del apartado 1.

CREATE TRIGGER trg_set_updated_at_programa_mantenimiento_unidad_anclas
    BEFORE UPDATE ON programa_mantenimiento_unidad_anclas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- 7 · VERIFICACION FINAL
DO $$
DECLARE
    v_cols      integer;
    v_checks    integer;
    v_uq        integer;
    v_fk        integer;
    v_idx       integer;
    v_trg       integer;
    v_filas     integer;
    v_ciclos    integer;
BEGIN
    SELECT count(*) INTO v_cols FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'programa_mantenimiento_unidad_anclas';
    IF v_cols <> 10 THEN
        RAISE EXCEPTION 'Esperaba 10 columnas en anclas, encontre %', v_cols;
    END IF;

    SELECT count(*) INTO v_checks FROM pg_constraint
        WHERE conrelid = 'programa_mantenimiento_unidad_anclas'::regclass
          AND contype = 'c'
          AND conname IN ('chk_ancla_tipo_equipo', 'chk_ancla_nivel', 'chk_ancla_quincena',
                          'chk_ancla_origen', 'chk_ancla_anual_solo_m3');
    IF v_checks <> 5 THEN
        RAISE EXCEPTION 'Esperaba los 5 CHECK con nombre, encontre %', v_checks;
    END IF;

    SELECT count(*) INTO v_uq FROM pg_constraint
        WHERE conname = 'uq_ancla_unidad_equipo_nivel' AND contype = 'u';
    SELECT count(*) INTO v_fk FROM pg_constraint
        WHERE conname = 'fk_ancla_unidad' AND contype = 'f' AND convalidated;
    IF v_uq <> 1 OR v_fk <> 1 THEN
        RAISE EXCEPTION 'Esperaba el UNIQUE y la FK validada, encontre uq=% fk=%', v_uq, v_fk;
    END IF;

    SELECT count(*) INTO v_idx FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_anclas_nivel_quincena';
    SELECT count(*) INTO v_trg FROM pg_trigger
        WHERE tgname = 'trg_set_updated_at_programa_mantenimiento_unidad_anclas'
          AND NOT tgisinternal;
    IF v_idx <> 1 OR v_trg <> 1 THEN
        RAISE EXCEPTION 'Esperaba el indice y el trigger, encontre idx=% trg=%', v_idx, v_trg;
    END IF;

    -- la tabla nace vacia: eso SI es estructural, la migracion no inserta nada
    SELECT count(*) INTO v_filas FROM programa_mantenimiento_unidad_anclas;
    IF v_filas <> 0 THEN
        RAISE EXCEPTION 'La tabla de anclas deberia nacer vacia, tiene % filas', v_filas;
    END IF;

    -- El conteo de ciclos se informa, NO se asevera contra un numero fijo: seria un dato
    -- del snapshot de esta base. Que esta migracion no puede tocarlos es una propiedad de
    -- su texto (0 INSERT, 0 UPDATE, 0 DELETE, y sus 7 ALTER TABLE son sobre la tabla
    -- nueva), no algo que haya que comprobar con una cifra literal.
    SELECT count(*) INTO v_ciclos FROM programa_mantenimiento_unidad_ciclos;

    RAISE NOTICE 'Anclas de cadencia creadas: 10 columnas, 5 CHECK, 1 UNIQUE, 1 FK, '
        '1 indice, 1 trigger. Tabla vacia. Ciclos presentes, sin tocar: %.', v_ciclos;
END $$;
