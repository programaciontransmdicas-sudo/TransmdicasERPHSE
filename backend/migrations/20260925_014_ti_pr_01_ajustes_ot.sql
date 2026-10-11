-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260925_014 · AJUSTES DE ORDENES DE TRABAJO
-- =====================================================================================
-- CLASIFICACION: CORRECTIVA DE LOGICA. Reemplaza 2 funciones con CREATE OR REPLACE.
--   0 CREATE TABLE. 0 ALTER TABLE. 0 ADD COLUMN. 0 DROP. 0 DELETE. 0 TRUNCATE. 0 DML.
--   No toca los 688 ciclos, las 1062 anclas ni ninguna tabla historica.
--   No crea ni modifica triggers: los dos triggers existentes apuntan por nombre y
--   siguen sirviendo tras el reemplazo de la funcion.
--
-- Debe ejecutarse DESPUES de 20260925_013 y ANTES de los cleanup de pending_cleanup/.
--
-- POR QUE UNA MIGRACION NUEVA Y NO UNA EDICION DE 013
-- 20260925_013 ya esta commiteada, pusheada y aplicada en Neon. Editar una migracion
-- ya ejecutada dejaria el fichero y la base contando historias distintas. Los dos
-- defectos se corrigen aqui, hacia adelante, con el historial intacto.
--
-- -------------------------------------------------------------------------------------
-- A · QUIEN PUEDE ABRIR UNA OT
-- -------------------------------------------------------------------------------------
-- Estado auditado de validar_apertura_ot tal como la dejo 013: solo rechazaba
-- CANCELADO (y una programacion inexistente). Es decir ADMITIA 7 de los 8 estados del
-- dominio: PROYECTADO, PROGRAMADO, EJECUTADO, EJECUTADO_PARCIAL, NO_EJECUTADO,
-- NO_APLICA y REPROGRAMADO.
--
-- Regla de negocio definida: una OT solo puede abrirse sobre PROGRAMADO o REPROGRAMADO.
--
-- PROYECTADO es unicamente la proyeccion automatica del programa. No representa una
-- intervencion formal autorizada, asi que no puede sostener una OT. La promocion
-- PROYECTADO -> PROGRAMADO es un acto humano de confirmacion, y es esa confirmacion la
-- que habilita la apertura.
--
-- Consecuencia deliberada: quedan tambien cerrados EJECUTADO, EJECUTADO_PARCIAL,
-- NO_EJECUTADO y NO_APLICA. En la practica ya eran casi inalcanzables, porque esos
-- cuatro estados los escribe cerrar_orden_trabajo y la OT que los produjo ocupa el
-- hueco de uq_ot_programacion_activa. Pero eran alcanzables si el estado se hubiera
-- fijado por otra via sin OT, y una visita ya resuelta no debe admitir una OT nueva:
-- para volver a intervenir se genera una programacion nueva.
--
-- -------------------------------------------------------------------------------------
-- B · ciclos_afectados DEBE CONTAR FILAS, NO INTENTOS
-- -------------------------------------------------------------------------------------
-- Defecto medido en las pruebas POST-013: al cerrar una OT vieja cuyo ciclo ya estaba en
-- una quincena posterior, la funcion devolvia ciclos_afectados = 1 habiendo escrito 0
-- filas. El contador se incrementaba siempre, sin mirar si la guarda anti-retroceso
--
--     WHERE EXCLUDED.ultima_quincena > programa_mantenimiento_unidad_ciclos.ultima_quincena
--
-- habia descartado el DO UPDATE. Nunca corrompio datos: mentia en el valor devuelto, que
-- es justo lo que un informe o una pantalla mostraria como "ciclos actualizados".
--
-- Solucion elegida: GET DIAGNOSTICS ... = ROW_COUNT inmediatamente despues del upsert.
-- Es la mas simple y determinista de las disponibles. ROW_COUNT vale 1 cuando la fila se
-- inserto o se actualizo de verdad, y 0 cuando el DO UPDATE no se aplico por su WHERE.
-- No se usa un contador incrementado antes de saber si hubo escritura.
--
-- Se descarto RETURNING ... INTO porque exigiria una variable por columna o un registro
-- que no se usa para nada, y porque comprobar FOUND es un paso mas indirecto que leer
-- directamente el numero de filas.
--
-- Lo que NO cambia del cierre: sigue siendo una sola transaccion, sigue escribiendo
-- quincenas ABSOLUTAS (quincena_efectiva) y nunca "anterior + frecuencia", y sigue
-- propagando detalle por detalle con la jerarquia acumulativa. La idempotencia no
-- depende del contador.
--
-- -------------------------------------------------------------------------------------
-- fecha_cierre Y LA ZONA HORARIA · REGLA DOCUMENTADA, SIN CAMBIO DE ESQUEMA
-- -------------------------------------------------------------------------------------
-- fecha_cierre se queda como timestamptz. NO se toca su tipo: un instante absoluto es
-- la representacion correcta de un sello administrativo.
--
-- Lo que hay que saber al consumirla, medido en las pruebas: el mismo instante de cierre
-- se leyo 2026-09-26 en la sesion (GMT) y 2026-09-25 en America/Lima. La sesion de Neon
-- esta en GMT, asi que desde las 19:00 de Lima la fecha de sesion va un dia por delante.
--
--   NO usar          fecha_cierre::date
--   para obtener la fecha de negocio de Peru si la sesion puede estar en UTC/GMT.
--
--   SI usar          (fecha_cierre AT TIME ZONE 'America/Lima')::date
--   o dejar el timestamptz intacto y convertirlo de forma controlada en backend/frontend.
--
-- Es la misma trampa que 013 ya documento para la validacion de fecha futura, y por la
-- que esa comprobacion compara contra (now() AT TIME ZONE 'America/Lima')::date en vez
-- de CURRENT_DATE.
--
-- fecha_ejecucion es independiente: es la fecha FISICA del trabajo, es date, y es la que
-- viaja a programa_mantenimiento_unidad_ciclos.ultima_fecha_real. No la afecta nada de
-- esto. Este DDL no cambia backend ni frontend; solo deja la regla escrita.
-- =====================================================================================

-- ------------------------------------------------------ 0 · GUARDAS DE PRECONDICION
DO $$
BEGIN
    IF to_regclass('public.ordenes_trabajo') IS NULL
       OR to_regclass('public.ordenes_trabajo_detalle') IS NULL THEN
        RAISE EXCEPTION 'Faltan las tablas de ordenes de trabajo: 20260925_013 no se ha '
            'aplicado. Esta migracion solo corrige funciones que 013 crea.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validar_apertura_ot')
    OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo') THEN
        RAISE EXCEPTION 'Falta validar_apertura_ot o cerrar_orden_trabajo: las crea 013.';
    END IF;

    -- el trigger tiene que seguir existiendo: esta migracion NO lo recrea, solo cambia
    -- el cuerpo de la funcion a la que ya apunta
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname = 'ordenes_trabajo'
          AND t.tgname = 'trg_validar_apertura_ot') THEN
        RAISE EXCEPTION 'Falta trg_validar_apertura_ot sobre ordenes_trabajo.';
    END IF;
END $$;

-- Foto de los conteos ANTES de tocar nada. La verificacion final compara contra esta foto
-- en vez de afirmar valores absolutos: 014 debe poder aplicarse tambien mas adelante, con
-- programacion y OT ya existentes, y seguir demostrando que no movio ni una fila.
CREATE TEMP TABLE _014_antes AS SELECT
    (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)  AS ciclos,
    (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)  AS anclas,
    (SELECT count(*) FROM programacion_mantenimiento)            AS prog,
    (SELECT count(*) FROM programacion_mantenimiento_equipos)    AS prog_eq,
    (SELECT count(*) FROM ordenes_trabajo)                       AS ot,
    (SELECT count(*) FROM ordenes_trabajo_detalle)               AS otd;

-- --------------------------------------------- 1 · QUIEN PUEDE ABRIR UNA ORDEN DE TRABAJO
-- Se mantiene el nombre y la firma: trg_validar_apertura_ot sigue sirviendo sin recrearse.
CREATE OR REPLACE FUNCTION validar_apertura_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_estado varchar(20);
BEGIN
    SELECT estado INTO v_estado FROM programacion_mantenimiento WHERE id = NEW.programacion_id;
    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'La programacion % no existe.', NEW.programacion_id;
    END IF;

    -- PROYECTADO y CANCELADO llevan mensaje propio: son los dos casos que un operador
    -- encuentra de verdad, y cada uno se resuelve de una forma distinta.
    IF v_estado = 'PROYECTADO' THEN
        RAISE EXCEPTION 'La programacion % esta PROYECTADO: es solo la proyeccion '
            'automatica del programa, todavia no una intervencion autorizada. '
            'Confirmala como PROGRAMADO antes de abrir la OT.', NEW.programacion_id;
    END IF;
    IF v_estado = 'CANCELADO' THEN
        RAISE EXCEPTION 'La programacion % esta CANCELADA: no admite abrir una OT. '
            'La sustitucion exige crear una programacion nueva.', NEW.programacion_id;
    END IF;
    IF v_estado NOT IN ('PROGRAMADO', 'REPROGRAMADO') THEN
        RAISE EXCEPTION 'La programacion % esta %: solo PROGRAMADO o REPROGRAMADO admiten '
            'abrir una OT. Una visita ya resuelta no se reabre: se genera una '
            'programacion nueva.', NEW.programacion_id, v_estado;
    END IF;

    IF NEW.estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'Una OT nace ABIERTA; se recibio %.', NEW.estado;
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION validar_apertura_ot() IS
    'Guarda de apertura de OT. Solo PROGRAMADO y REPROGRAMADO admiten abrir una orden: '
    'PROYECTADO es proyeccion automatica sin autorizar, CANCELADO exige una programacion '
    'nueva, y los estados ya resueltos no se reabren. Ajustada por 20260925_014.';

-- ---------------------------------------------------- 2 · CIERRE: CONTAR FILAS REALES
-- Cuerpo identico al de 013 salvo el contador: se declara v_escritas y se suma ROW_COUNT
-- en lugar de incrementar de uno en uno sin comprobar si el upsert escribio.
CREATE OR REPLACE FUNCTION cerrar_orden_trabajo(
    p_ot_id           integer,
    p_cerrada_por     integer,
    p_fecha_ejecucion date,
    p_minutos         integer DEFAULT NULL,
    p_observaciones   text    DEFAULT NULL
) RETURNS TABLE (estado_programacion varchar, ciclos_afectados integer)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_ot              ordenes_trabajo;
    v_programacion_id integer;
    v_unidad_id       integer;
    v_programa_id     integer;
    v_quincena        date;
    v_previstos       integer;
    v_detallados      integer;
    v_aplicables      integer;
    v_completados     integer;
    v_con_avance      integer;
    v_pendientes      integer;
    v_estado          varchar(20);
    v_ciclos          integer := 0;
    v_escritas        integer;
    v_niveles         text[];
    v_nivel           text;
    r                 record;
BEGIN
    -- (1) serializa: dos cierres concurrentes de la misma OT se ordenan aqui
    SELECT * INTO v_ot FROM ordenes_trabajo WHERE id = p_ot_id FOR UPDATE;
    IF v_ot.id IS NULL THEN
        RAISE EXCEPTION 'La OT % no existe.', p_ot_id;
    END IF;
    -- (2) un segundo cierre no avanza nada: error controlado
    IF v_ot.estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'La OT % ya esta %: no se puede cerrar de nuevo.', p_ot_id, v_ot.estado;
    END IF;

    v_programacion_id := v_ot.programacion_id;
    SELECT p.programa_unidad_id, u.programa_id, p.quincena_efectiva
      INTO v_unidad_id, v_programa_id, v_quincena
      FROM programacion_mantenimiento p
      JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
     WHERE p.id = v_programacion_id;
    IF v_quincena IS NULL THEN
        RAISE EXCEPTION 'La programacion % no tiene quincena_efectiva: sin fase no se cierra.',
            v_programacion_id;
    END IF;

    -- (3) La fecha FISICA del trabajo no puede ser futura respecto al momento del cierre:
    -- no se puede registrar como ejecutado un trabajo que todavia no ha ocurrido.
    --
    -- Se compara contra la fecha de NEGOCIO (America/Lima), no contra CURRENT_DATE. La
    -- sesion de Neon esta en GMT, asi que CURRENT_DATE va por delante de Lima desde las
    -- 19:00 locales y aceptaria como "no futura" una fecha que en Lima es de manana.
    --
    -- NO se exige que la fecha caiga dentro de quincena_efectiva: el trabajo puede
    -- ejecutarse fisicamente otro dia y la fase administrativa sigue siendo la quincena.
    IF p_fecha_ejecucion > (now() AT TIME ZONE 'America/Lima')::date THEN
        RAISE EXCEPTION 'fecha_ejecucion % es futura respecto a la fecha de negocio %: '
            'no se puede cerrar una OT declarando un trabajo que aun no ocurrio.',
            p_fecha_ejecucion, (now() AT TIME ZONE 'America/Lima')::date;
    END IF;

    -- (4) GUARDA: la OT debe cerrar TODA la visita, y la visita no puede estar vacia.
    -- El orden importa: con 0 previstos y 0 detalles la comparacion de conteos seria
    -- 0 = 0 y dejaria pasar el cierre de una visita sin nada que ejecutar.
    SELECT count(*) INTO v_previstos FROM programacion_mantenimiento_equipos
     WHERE programacion_id = v_programacion_id;
    IF v_previstos = 0 THEN
        RAISE EXCEPTION 'La programacion % no prevee ningun equipo: una visita vacia no es '
            'ejecutable y no puede cerrarse.', v_programacion_id;
    END IF;
    SELECT count(*) INTO v_detallados FROM ordenes_trabajo_detalle
     WHERE orden_trabajo_id = p_ot_id;
    IF v_previstos <> v_detallados THEN
        RAISE EXCEPTION 'La OT % tiene % detalle(s) y la programacion prevee % equipo(s). '
            'No se puede cerrar una visita incompleta.', p_ot_id, v_detallados, v_previstos;
    END IF;

    -- (4) la fecha fisica del trabajo vive en la programacion, no en la OT
    UPDATE programacion_mantenimiento
       SET fecha_ejecucion = p_fecha_ejecucion
     WHERE id = v_programacion_id;

    -- (5) propagacion DETALLE POR DETALLE, nunca por un supuesto nivel general de la OT
    FOR r IN
        SELECT d.id AS detalle_id, e.tipo_equipo, d.nivel_completado
          FROM ordenes_trabajo_detalle d
          JOIN programacion_mantenimiento_equipos e ON e.id = d.programacion_equipo_id
         WHERE d.orden_trabajo_id = p_ot_id AND d.nivel_completado IS NOT NULL
    LOOP
        IF r.tipo_equipo IN ('GPS', 'ADAS') THEN
            -- familias anuales: solo M3 existe. Nunca crean M1 ni M2.
            v_niveles := ARRAY[r.nivel_completado];
        ELSE
            v_niveles := CASE r.nivel_completado
                WHEN 'M1' THEN ARRAY['M1']
                WHEN 'M2' THEN ARRAY['M2', 'M1']
                WHEN 'M3' THEN ARRAY['M3', 'M2', 'M1'] END;
        END IF;

        FOREACH v_nivel IN ARRAY v_niveles LOOP
            INSERT INTO programa_mantenimiento_unidad_ciclos
                (programa_unidad_id, programa_id, tipo_equipo, nivel_mantenimiento,
                 ultima_quincena, ultima_fecha_real, fuente, orden_trabajo_detalle_id,
                 observaciones)
            VALUES (v_unidad_id, v_programa_id, r.tipo_equipo, v_nivel,
                 v_quincena, p_fecha_ejecucion, 'ORDENES_TRABAJO', r.detalle_id,
                 CASE WHEN v_nivel = r.nivel_completado
                      THEN 'Ejecucion real de ' || r.tipo_equipo || '/' || v_nivel
                           || ' por la OT ' || p_ot_id || '. Quincena efectiva ' || v_quincena
                           || ', dia fisico ' || p_fecha_ejecucion || '.'
                      ELSE 'Referencia ' || v_nivel || ' cubierta por la ejecucion '
                           || r.tipo_equipo || '/' || r.nivel_completado || ' de la OT '
                           || p_ot_id || ' (jerarquia acumulativa). No es una OT aparte ni '
                           || 'un detalle aparte. Quincena efectiva ' || v_quincena || '.'
                 END)
            ON CONFLICT (programa_unidad_id, tipo_equipo, nivel_mantenimiento) DO UPDATE
               SET ultima_quincena          = EXCLUDED.ultima_quincena,
                   ultima_fecha_real        = EXCLUDED.ultima_fecha_real,
                   fuente                   = EXCLUDED.fuente,
                   orden_trabajo_detalle_id = EXCLUDED.orden_trabajo_detalle_id,
                   observaciones            = EXCLUDED.observaciones
             -- una ejecucion vieja cerrada tarde NO puede hacer retroceder la fase
             WHERE EXCLUDED.ultima_quincena > programa_mantenimiento_unidad_ciclos.ultima_quincena;
            -- 014: ROW_COUNT vale 0 cuando la guarda anti-retroceso del DO UPDATE
            -- descarta la fila, y 1 cuando realmente se inserto o actualizo. El
            -- contador ya no suma intentos de upsert, solo escrituras reales.
            GET DIAGNOSTICS v_escritas = ROW_COUNT;
            v_ciclos := v_ciclos + v_escritas;
        END LOOP;
    END LOOP;

    -- (6) estado de la visita, derivado SOLO ahora. NO_APLICA no cuenta como incumplimiento.
    SELECT count(*) FILTER (WHERE estado <> 'NO_APLICA'),
           count(*) FILTER (WHERE estado = 'COMPLETADO'),
           count(*) FILTER (WHERE estado IN ('COMPLETADO', 'PARCIAL')),
           count(*) FILTER (WHERE estado = 'PENDIENTE')
      INTO v_aplicables, v_completados, v_con_avance, v_pendientes
      FROM ordenes_trabajo_detalle WHERE orden_trabajo_id = p_ot_id;

    IF v_aplicables = 0 THEN
        v_estado := 'NO_APLICA';
    ELSIF v_completados = v_aplicables THEN
        v_estado := 'EJECUTADO';
    ELSIF v_con_avance = 0 THEN
        v_estado := 'NO_EJECUTADO';
    ELSE
        v_estado := 'EJECUTADO_PARCIAL';
    END IF;

    UPDATE programacion_mantenimiento SET estado = v_estado WHERE id = v_programacion_id;

    -- (7) y por ultimo se cierra. La guarda del WHERE hace el paso idempotente.
    UPDATE ordenes_trabajo
       SET estado         = 'CERRADA',
           fecha_cierre   = CURRENT_TIMESTAMP,
           cerrada_por_id = p_cerrada_por,
           minutos        = COALESCE(p_minutos, minutos),
           observaciones  = COALESCE(p_observaciones, observaciones)
     WHERE id = p_ot_id AND estado = 'ABIERTA';

    RETURN QUERY SELECT v_estado::varchar, v_ciclos;
END $$;

COMMENT ON FUNCTION cerrar_orden_trabajo(integer, integer, date, integer, text) IS
    'Cierra una OT en una sola transaccion: valida que la visita este completa, fija '
    'fecha_ejecucion en la programacion, propaga los ciclos detalle por detalle con la '
    'jerarquia acumulativa, deriva el estado de la visita y cierra la OT. Idempotente: '
    'escribe quincenas absolutas y nunca incrementos. ciclos_afectados cuenta filas '
    'realmente insertadas o actualizadas, no intentos de upsert (20260925_014).';

-- ------------------------------------------------------------- 3 · VERIFICACION FINAL
DO $$
DECLARE
    v_apertura  text;
    v_cierre    text;
    v_fn        integer;
    v_trg       integer;
    v_ret       text;
    v_ciclos    integer;
    v_anclas    integer;
    v_prog      integer;
    v_ot        integer;
    v_cols_ot   integer;
    v_cols_otd  integer;
    v_cols_cic  integer;
BEGIN
    SELECT p.prosrc INTO v_apertura FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'validar_apertura_ot';
    SELECT p.prosrc INTO v_cierre FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo';

    -- A · la guarda de apertura exige los dos estados y nombra PROYECTADO
    IF v_apertura NOT LIKE '%NOT IN (''PROGRAMADO'', ''REPROGRAMADO'')%' THEN
        RAISE EXCEPTION 'validar_apertura_ot no restringe a PROGRAMADO/REPROGRAMADO.';
    END IF;
    IF v_apertura NOT LIKE '%PROYECTADO%' THEN
        RAISE EXCEPTION 'validar_apertura_ot no rechaza PROYECTADO explicitamente.';
    END IF;

    -- B · el contador lee ROW_COUNT y ya no incrementa a ciegas
    IF v_cierre NOT LIKE '%GET DIAGNOSTICS v_escritas = ROW_COUNT%' THEN
        RAISE EXCEPTION 'cerrar_orden_trabajo no lee ROW_COUNT tras el upsert.';
    END IF;
    IF v_cierre LIKE '%v_ciclos := v_ciclos + 1;%' THEN
        RAISE EXCEPTION 'cerrar_orden_trabajo sigue sumando intentos de upsert.';
    END IF;
    IF v_cierre NOT LIKE '%v_ciclos := v_ciclos + v_escritas;%' THEN
        RAISE EXCEPTION 'cerrar_orden_trabajo no acumula las filas realmente escritas.';
    END IF;

    -- lo que NO debe haber cambiado: la firma y el tipo de retorno del cierre
    SELECT pg_get_function_result(p.oid) INTO v_ret FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo';
    IF v_ret <> 'TABLE(estado_programacion character varying, ciclos_afectados integer)' THEN
        RAISE EXCEPTION 'El tipo de retorno de cerrar_orden_trabajo cambio: %', v_ret;
    END IF;

    -- siguen siendo 7 funciones y 8 triggers: esta migracion no añade ni quita ninguno
    SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('validar_coherencia_detalle_ot',
        'impedir_modificar_ot_cerrada', 'impedir_modificar_detalle_ot_cerrada',
        'congelar_alcance_programado', 'congelar_visita_con_ot', 'validar_apertura_ot',
        'cerrar_orden_trabajo');
    SELECT count(*) INTO v_trg FROM pg_trigger
     WHERE NOT tgisinternal AND tgname IN ('trg_validar_coherencia_detalle_ot',
        'trg_impedir_modificar_ot_cerrada', 'trg_impedir_modificar_detalle_ot_cerrada',
        'trg_congelar_alcance_programado', 'trg_congelar_visita_con_ot',
        'trg_validar_apertura_ot',
        'trg_set_updated_at_ordenes_trabajo', 'trg_set_updated_at_ordenes_trabajo_detalle');
    IF v_fn <> 7 OR v_trg <> 8 THEN
        RAISE EXCEPTION 'Esperaba 7 funciones y 8 triggers, encontre % y %', v_fn, v_trg;
    END IF;

    -- las funciones siguen fijando search_path
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('validar_apertura_ot', 'cerrar_orden_trabajo')
          AND (p.proconfig IS NULL
               OR NOT ('search_path=pg_catalog, public' = ANY(p.proconfig)))) THEN
        RAISE EXCEPTION 'Alguna de las dos funciones perdio su search_path fijo.';
    END IF;

    -- ninguna estructura de datos se movio
    SELECT count(*) INTO v_cols_ot FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo';
    SELECT count(*) INTO v_cols_otd FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_detalle';
    SELECT count(*) INTO v_cols_cic FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'programa_mantenimiento_unidad_ciclos';
    IF v_cols_ot <> 14 OR v_cols_otd <> 10 OR v_cols_cic <> 12 THEN
        RAISE EXCEPTION 'Cambio el numero de columnas: ot=% otd=% ciclos=%',
            v_cols_ot, v_cols_otd, v_cols_cic;
    END IF;

    -- ningun dato se movio: se compara contra la foto tomada al principio, no contra
    -- constantes, para que la comprobacion siga siendo valida en cualquier entorno
    IF EXISTS (
        SELECT 1 FROM _014_antes a WHERE
            a.ciclos  <> (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)
         OR a.anclas  <> (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)
         OR a.prog    <> (SELECT count(*) FROM programacion_mantenimiento)
         OR a.prog_eq <> (SELECT count(*) FROM programacion_mantenimiento_equipos)
         OR a.ot      <> (SELECT count(*) FROM ordenes_trabajo)
         OR a.otd     <> (SELECT count(*) FROM ordenes_trabajo_detalle)) THEN
        RAISE EXCEPTION 'Esta migracion no debe tocar ni una fila, y algun conteo cambio.';
    END IF;
    SELECT ciclos, anclas, prog, ot INTO v_ciclos, v_anclas, v_prog, v_ot FROM _014_antes;

    -- las columnas legacy siguen intactas: el cleanup 900 sigue sin ejecutarse
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'programacion_mantenimiento' AND column_name = 'fecha_programada') THEN
        RAISE EXCEPTION 'Esta migracion no debe retirar fecha_programada.';
    END IF;

    RAISE NOTICE 'Ajustes de OT aplicados: validar_apertura_ot solo admite PROGRAMADO y '
        'REPROGRAMADO; cerrar_orden_trabajo cuenta filas reales via ROW_COUNT. '
        '2 funciones reemplazadas, 0 tablas, 0 columnas, 0 triggers, 0 DML. '
        'Sin cambios de datos: ciclos=%, anclas=%, programaciones=%, OT=%.',
        v_ciclos, v_anclas, v_prog, v_ot;
END $$;

DROP TABLE _014_antes;
