-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260928_016 · ALCANCE E IDENTIDAD HISTORICOS
-- =====================================================================================
-- CLASIFICACION: CORRECTIVA DE LOGICA. Reemplaza 3 funciones con CREATE OR REPLACE.
--   0 CREATE TABLE. 0 ADD COLUMN. 0 DROP. 0 INDEX. 0 CHECK. 0 cambio de dominio. 0 DML.
--   0 TRIGGER creados ni recreados: los tres triggers existentes apuntan por nombre y
--   siguen sirviendo. No se toca cerrar_orden_trabajo.
--
-- Debe ejecutarse DESPUES de 20260925_015 y ANTES de los cleanup de pending_cleanup/.
-- No modifica 013, 014 ni 015: las tres estan commiteadas, pusheadas y aplicadas.
--
-- -------------------------------------------------------------------------------------
-- LOS TRES HUECOS QUE CIERRA, TODOS REPRODUCIDOS ANTES DE ESCRIBIR UNA LINEA
-- -------------------------------------------------------------------------------------
-- 1) Una OT ABIERTA se podia BORRAR. Con ella se iban sus detalles en cascada, el
--    EXISTS de ordenes_trabajo volvia a ser falso y el congelado del alcance se
--    REVERTIA. Secuencia medida: abrir OT -> borrar OT -> alcance libre otra vez.
--
-- 2) El INSERT de equipos previstos estaba abierto con la OT CERRADA y con la OT
--    ANULADA, porque congelar_alcance_programado solo miraba las ABIERTAS. Y con una OT
--    anulada SIN detalles, los seis vectores estaban abiertos: insertar, borrar, mover
--    de programacion, mover de programa, cambiar tipo y cambiar nivel.
--
-- 3) Sin OT se podian cambiar programa_unidad_id y quincena_programada, que son la
--    identidad del termino de cadencia que la visita representa.
--
-- -------------------------------------------------------------------------------------
-- POR QUE EL ORDEN R1 ANTES DE R2
-- -------------------------------------------------------------------------------------
-- R2 congela el alcance con "esta programacion tuvo alguna OT". Ese predicado solo sirve
-- si es MONOTONO: una vez cierto, cierto para siempre. R1 es lo que lo hace monotono, al
-- prohibir el borrado de cualquier OT. Sin R1, R2 seria evadible con un borrado.
--
-- -------------------------------------------------------------------------------------
-- LO QUE SIGUE SIENDO POSIBLE
-- -------------------------------------------------------------------------------------
-- Antes de que exista ninguna OT, el alcance se prepara con libertad: insertar, borrar y
-- corregir equipos previstos. Es el espacio de trabajo del generador y de la confirmacion
-- humana.
--
-- La REPROGRAMACION no se toca: quincena_programada conserva la quincena original,
-- quincena_reprogramada recibe el nuevo destino y quincena_efectiva sigue siendo
-- COALESCE(quincena_reprogramada, quincena_programada).
--
-- La SUSTITUCION sigue siendo el unico camino para cambiar un alcance ya historico:
--   anular la OT -> cancelar la programacion -> crear una programacion NUEVA ->
--   su alcance nuevo -> una OT nueva.
-- La programacion vieja y su alcance permanecen intactos como constancia.
-- =====================================================================================

-- ------------------------------------------------------------ 0 · GUARDAS DE PRECONDICION
DO $$
BEGIN
    IF to_regclass('public.ordenes_trabajo') IS NULL
       OR to_regclass('public.ordenes_trabajo_detalle') IS NULL THEN
        RAISE EXCEPTION 'Faltan las tablas de OT: 20260925_013 no se ha aplicado.';
    END IF;

    -- las tres funciones que se reemplazan tienen que existir ya
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('impedir_modificar_ot_cerrada',
            'congelar_alcance_programado', 'congelar_visita_con_ot')) <> 3 THEN
        RAISE EXCEPTION 'Falta alguna de las 3 funciones que esta migracion reemplaza.';
    END IF;

    -- y sus triggers, que NO se recrean
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND t.tgname IN ('trg_impedir_modificar_ot_cerrada',
            'trg_congelar_alcance_programado', 'trg_congelar_visita_con_ot')) <> 3 THEN
        RAISE EXCEPTION 'Falta alguno de los 3 triggers que estas funciones sirven.';
    END IF;

    -- 015 debe estar aplicada: 016 parte de SUS cuerpos de funcion
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'congelar_visita_con_ot'
          AND p.prosrc LIKE '%IF TG_OP = ''INSERT'' THEN%') THEN
        RAISE EXCEPTION '20260925_015 no esta aplicada: congelar_visita_con_ot no trata el '
            'INSERT por separado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validar_coherencia_ciclo_ot') THEN
        RAISE EXCEPTION '20260925_015 no esta aplicada: falta validar_coherencia_ciclo_ot.';
    END IF;
END $$;

-- Foto de los conteos ANTES, para demostrar que esta migracion no mueve ni una fila.
CREATE TEMP TABLE _016_antes AS SELECT
    (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)  AS ciclos,
    (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)  AS anclas,
    (SELECT count(*) FROM programacion_mantenimiento)            AS prog,
    (SELECT count(*) FROM programacion_mantenimiento_equipos)    AS prog_eq,
    (SELECT count(*) FROM ordenes_trabajo)                       AS ot,
    (SELECT count(*) FROM ordenes_trabajo_detalle)               AS otd,
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public')                             AS tablas,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public')                             AS columnas,
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') AS indices,
    (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c')            AS checks;

-- ------------------------------------------- 1 · R1 · NINGUNA OT SE BORRA FISICAMENTE
CREATE OR REPLACE FUNCTION impedir_modificar_ot_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_estado_visita varchar(20);
BEGIN
    -- 016 · R1 · NINGUNA OT se borra fisicamente, en ningun estado. Antes se permitia
    -- borrar una OT ABIERTA, y eso hacia REVERSIBLE el congelado del alcance: bastaba
    -- abrir una OT, borrarla y el EXISTS de congelar_alcance_programado volvia a ser
    -- falso. Medido y reproducido antes de escribir esto.
    --
    -- Una OT creada por error se ANULA, con motivo_anulacion obligatorio, que deja
    -- constancia de quien y por que. No se diseña ningun borrado blando ni columna nueva.
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La OT % no puede borrarse (esta %): ninguna orden de trabajo se '
            'elimina fisicamente, porque su existencia es lo que vuelve historico el '
            'alcance de la visita. Si se abrio por error, ANULALA con su motivo.',
            OLD.id, OLD.estado;
    END IF;
    -- se permite la transicion ABIERTA -> CERRADA o ANULADA, y nada mas
    IF OLD.estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'La OT % esta % y es inmutable.', OLD.id, OLD.estado;
    END IF;

    -- 015 · D · cerrar exige que la visita ya lleve su resultado. Solo el cierre real lo
    -- deja en ese punto: escribe el resultado ANTES de cerrar la OT. Un UPDATE directo
    -- encuentra la visita en PROGRAMADO o REPROGRAMADO y se rechaza aqui.
    -- ANULADA queda fuera: es flujo administrativo de sustitucion.
    IF NEW.estado = 'CERRADA' THEN
        SELECT estado INTO v_estado_visita FROM programacion_mantenimiento
         WHERE id = OLD.programacion_id;
        IF v_estado_visita NOT IN
           ('EJECUTADO', 'EJECUTADO_PARCIAL', 'NO_EJECUTADO', 'NO_APLICA') THEN
            RAISE EXCEPTION 'La OT % no puede cerrarse con un UPDATE directo: su '
                'programacion % sigue en % y no tiene resultado. Una OT se cierra '
                'unicamente con cerrar_orden_trabajo(), que escribe el resultado de la '
                'visita y propaga los ciclos en la misma transaccion. Para desistir de la '
                'visita, anula la OT.', OLD.id, OLD.programacion_id, v_estado_visita;
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION congelar_alcance_programado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_prog_old     integer;
    v_prog_new     integer;
    v_ots_old      integer;
    v_ots_new      integer;
    v_abiertas_old integer;
    v_abiertas_new integer;
    v_culpable     integer;
    v_referencias  integer;
BEGIN
    -- 016 · R2 · el alcance queda historico desde que CUALQUIER OT existio, este ABIERTA,
    -- CERRADA o ANULADA. Y se comprueban LOS DOS EXTREMOS del movimiento, porque un UPDATE
    -- de programacion_id tiene dos victimas posibles y son fugas distintas:
    --
    --   A -> B  con A con OT : sacar un detalle de un alcance ya historico;
    --   A -> B  con B con OT : meter un detalle en un alcance ya historico.
    --
    -- Por eso no se usa un COALESCE que mire solo uno: se cuentan las OT de ambos lados.
    -- En INSERT no hay OLD y en DELETE no hay NEW; el lado ausente queda NULL y su recuento
    -- es 0, porque "programacion_id = NULL" no devuelve filas.
    --
    -- Que la condicion sea IRREVERSIBLE lo garantiza R1: ninguna OT se borra.
    v_prog_old := CASE TG_OP WHEN 'INSERT' THEN NULL ELSE OLD.programacion_id END;
    v_prog_new := CASE TG_OP WHEN 'DELETE' THEN NULL ELSE NEW.programacion_id END;

    SELECT count(*), count(*) FILTER (WHERE estado = 'ABIERTA')
      INTO v_ots_old, v_abiertas_old
      FROM ordenes_trabajo WHERE programacion_id = v_prog_old;
    SELECT count(*), count(*) FILTER (WHERE estado = 'ABIERTA')
      INTO v_ots_new, v_abiertas_new
      FROM ordenes_trabajo WHERE programacion_id = v_prog_new;

    -- la OT ABIERTA conserva su mensaje propio: es el caso que un operador encuentra a
    -- diario, y la salida es distinta -anular la OT- que en los otros dos.
    IF v_abiertas_old > 0 OR v_abiertas_new > 0 THEN
        v_culpable := CASE WHEN v_abiertas_old > 0 THEN v_prog_old ELSE v_prog_new END;
        RAISE EXCEPTION 'La programacion % tiene una OT ABIERTA: el alcance de la visita esta '
            'congelado y no admite % de equipos previstos. Anula la OT si hay que cambiarlo.',
            v_culpable, TG_OP;
    END IF;

    IF v_ots_old > 0 OR v_ots_new > 0 THEN
        v_culpable := CASE WHEN v_ots_old > 0 THEN v_prog_old ELSE v_prog_new END;
        RAISE EXCEPTION 'La programacion % ya tuvo al menos una orden de trabajo: su alcance '
            'es HISTORICO y no admite % de equipos previstos, ni con la OT CERRADA ni con '
            'ella ANULADA. Para cambiar el alcance se crea una programacion NUEVA: anula la '
            'OT, cancela esta visita y genera otra.', v_culpable, TG_OP;
    END IF;

    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- La regla de 013 se conserva TAL CUAL. Tras R2 es inalcanzable por si sola -una fila
    -- referenciada por un detalle de OT implica que su programacion tuvo OT-, pero se deja
    -- como segunda linea de defensa y para no perder sus mensajes.
    SELECT count(*) INTO v_referencias FROM ordenes_trabajo_detalle
     WHERE programacion_equipo_id = OLD.id;
    IF v_referencias > 0 THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'El equipo previsto % ya lo referencia % detalle(s) de OT: no puede '
                'borrarse sin reescribir el historico.', OLD.id, v_referencias;
        END IF;
        IF NEW.tipo_equipo         IS DISTINCT FROM OLD.tipo_equipo
        OR NEW.nivel_mantenimiento IS DISTINCT FROM OLD.nivel_mantenimiento
        OR NEW.programacion_id     IS DISTINCT FROM OLD.programacion_id
        OR NEW.programa_id         IS DISTINCT FROM OLD.programa_id THEN
            RAISE EXCEPTION 'El equipo previsto % (%/%) ya lo referencia % detalle(s) de OT: '
                'sus campos de negocio son inmutables.', OLD.id, OLD.tipo_equipo,
                OLD.nivel_mantenimiento, v_referencias;
        END IF;
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION congelar_visita_con_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_ots      integer;
    v_cerradas integer;
    v_abiertas integer;
    v_ctx      text;
    v_hoy      date;
BEGIN
    -- ============================================================ COMUN A INSERT Y UPDATE
    -- 015 · G · la fecha FISICA nunca puede ser futura respecto a la fecha de negocio de
    -- Peru. Se comprueba en INSERT y en UPDATE, y no solo cuando la columna cambia: asi es
    -- un invariante de la fila y la integridad no depende de que el generador inserte NULL.
    --
    -- Nunca CURRENT_DATE: la sesion de Neon esta en GMT y desde las 19:00 de Lima iria un
    -- dia por delante, aceptando como "no futura" una fecha que en Lima es de manana.
    --
    -- Evaluarlo siempre, y no solo al cambiar, no puede invalidar filas con el tiempo: el
    -- predicado es monotono, una fecha que hoy no es futura no lo sera nunca.
    IF NEW.fecha_ejecucion IS NOT NULL THEN
        v_hoy := (now() AT TIME ZONE 'America/Lima')::date;
        IF NEW.fecha_ejecucion > v_hoy THEN
            RAISE EXCEPTION 'fecha_ejecucion % es futura respecto a la fecha de negocio de '
                'Peru (%): no se puede registrar como ejecutado un trabajo que aun no ha '
                'ocurrido.', NEW.fecha_ejecucion, v_hoy;
        END IF;
    END IF;

    -- ========================================================================= SOLO EN INSERT
    -- En un INSERT no existe OLD, asi que las reglas de comparacion de abajo no tienen
    -- sujeto. Lo que si tiene sentido es acotar COMO NACE una visita.
    IF TG_OP = 'INSERT' THEN
        -- 015 · I · una visita nace proyectada o ya confirmada, y nada mas.
        --   · los cuatro RESULTADOS solo los escribe cerrar_orden_trabajo: una visita que
        --     nace diciendo que ya se ejecuto seria una ejecucion sin OT y sin ciclos;
        --   · REPROGRAMADO no es un estado inicial: reprogramar es modificar una
        --     programacion que ya existia;
        --   · CANCELADO tampoco: cancelar supone que antes hubo algo que cancelar.
        -- Quedan vivos los dos flujos: el generador crea PROYECTADO y lo promueve a
        -- PROGRAMADO, y la creacion manual ya confirmada entra directamente en PROGRAMADO.
        IF NEW.estado NOT IN ('PROYECTADO', 'PROGRAMADO') THEN
            RAISE EXCEPTION 'Una programacion no puede nacer en %: solo PROYECTADO o '
                'PROGRAMADO son estados iniciales. Los resultados (EJECUTADO, '
                'EJECUTADO_PARCIAL, NO_EJECUTADO, NO_APLICA) los escribe unicamente '
                'cerrar_orden_trabajo(); REPROGRAMADO y CANCELADO se alcanzan modificando '
                'una programacion que ya existe.', NEW.estado;
        END IF;

        -- 015 · J · y nace SIN dia fisico. fecha_ejecucion es el dia en que se hizo el
        -- trabajo, y aparece durante el cierre real, no al crear la visita.
        IF NEW.fecha_ejecucion IS NOT NULL THEN
            RAISE EXCEPTION 'Una programacion no puede nacer con fecha_ejecucion (%): esa '
                'columna es el dia FISICO en que se realizo el mantenimiento y la escribe '
                'cerrar_orden_trabajo() al cerrar la OT. Al crear la visita debe ser NULL.',
                NEW.fecha_ejecucion;
        END IF;

        RETURN NEW;
    END IF;

    -- ================================================================= SOLO EN UPDATE
    -- 016 · R3 · la IDENTIDAD de la obligacion es inmutable, haya OT o no la haya.
    --
    --   programa_unidad_id  de que unidad es la visita
    --   programa_id         de que programa
    --   quincena_programada en que quincena NACIO la obligacion
    --
    -- Las tres juntas identifican el termino de cadencia que esta visita representa. El
    -- generador se apoya en ellas para saber que una obligacion ya esta materializada: si
    -- se pudieran mover, una obligacion ya representada volveria a parecer pendiente y se
    -- duplicaria. Medido antes de escribir esto: sin OT se podian cambiar
    -- programa_unidad_id y quincena_programada sin ninguna restriccion.
    --
    -- quincena_reprogramada NO entra aqui: es justamente lo que la reprogramacion cambia.
    -- La regla de 013, mas abajo, sigue gobernando cuando se puede tocar.
    --
    -- Un error de identidad se corrige cancelando la visita y creando otra, nunca
    -- reescribiendo la que ya existe.
    IF NEW.programa_unidad_id  IS DISTINCT FROM OLD.programa_unidad_id
    OR NEW.programa_id         IS DISTINCT FROM OLD.programa_id
    OR NEW.quincena_programada IS DISTINCT FROM OLD.quincena_programada THEN
        RAISE EXCEPTION 'La programacion % no admite cambiar su identidad original '
            '(unidad %, programa %, quincena programada %): esas tres columnas son el '
            'termino de cadencia que la visita representa y son inmutables tras crearla. '
            'Para reprogramar usa quincena_reprogramada; para corregir un error, cancela '
            'esta visita y crea una nueva.',
            OLD.id, OLD.programa_unidad_id, OLD.programa_id, OLD.quincena_programada;
    END IF;

    IF NEW.programa_unidad_id    IS DISTINCT FROM OLD.programa_unidad_id
    OR NEW.quincena_programada   IS DISTINCT FROM OLD.quincena_programada
    OR NEW.quincena_reprogramada IS DISTINCT FROM OLD.quincena_reprogramada THEN
        SELECT count(*) INTO v_ots FROM ordenes_trabajo
         WHERE programacion_id = OLD.id AND estado <> 'ANULADA';
        IF v_ots > 0 THEN
            RAISE EXCEPTION 'La programacion % tiene % OT no anulada(s): su unidad y su '
                'quincena estan congeladas. Anula la OT antes de reprogramar.', OLD.id, v_ots;
        END IF;
    END IF;

    -- Cancelar una programacion libera su slot de quincena y habilita una sustituta. Solo
    -- puede hacerse cuando su OT ya esta ANULADA: con una OT ABIERTA quedaria una OT viva
    -- sobre una visita cancelada, y con una OT CERRADA se estaria cancelando una visita que
    -- realmente se ejecuto y movio ciclos. Una OT CERRADA nunca habilita la sustitucion.
    IF NEW.estado = 'CANCELADO' AND OLD.estado <> 'CANCELADO' THEN
        SELECT count(*) INTO v_ots FROM ordenes_trabajo
         WHERE programacion_id = OLD.id AND estado <> 'ANULADA';
        IF v_ots > 0 THEN
            RAISE EXCEPTION 'La programacion % tiene % OT no anulada(s): no puede cancelarse. '
                'Anula primero la OT; una OT CERRADA no admite sustitucion.', OLD.id, v_ots;
        END IF;
    END IF;

    -- 015 · B · CANCELADO es TERMINAL. Se comprueba primero porque no necesita consultar
    -- nada: una programacion cancelada es historica y no se recicla en ningun estado.
    -- La entrada A CANCELADO la sigue gobernando la regla de arriba; esto cierra la salida.
    IF OLD.estado = 'CANCELADO' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        RAISE EXCEPTION 'La programacion % esta CANCELADA: es historica y no vuelve a un '
            'estado activo (se intento %). Un nuevo intento exige una programacion nueva.',
            OLD.id, NEW.estado;
    END IF;

    -- 015 · A · el RESULTADO de una visita cerrada es inmutable. Con una OT CERRADA, el
    -- estado de la programacion ya no puede reescribirse: EJECUTADO, EJECUTADO_PARCIAL,
    -- NO_EJECUTADO y NO_APLICA quedan congelados.
    --
    -- NO bloquea el cierre normal, y esto se midio sobre la funcion desplegada, no se
    -- supuso: cerrar_orden_trabajo fija el estado de la programacion MIENTRAS su OT sigue
    -- ABIERTA (offset 7268) y solo despues la pasa a CERRADA en su ultima sentencia
    -- (offset 7440), sin volver a tocar la programacion. En el instante de este trigger,
    -- por tanto, el recuento de OT CERRADAS es 0 y la escritura pasa.
    --
    -- Solo se consulta cuando el estado cambia de verdad: un UPDATE de fecha_ejecucion o
    -- de observaciones no paga la consulta, y sigue permitido tras el cierre.
    -- Un solo recuento de OT para todas las reglas que lo necesitan, y solo si algo que
    -- las activa ha cambiado de verdad. Son mutuamente excluyentes: uq_ot_programacion_activa
    -- admite como maximo UNA OT no anulada, asi que una programacion nunca tiene a la vez
    -- una ABIERTA y una CERRADA.
    IF NEW.estado          IS DISTINCT FROM OLD.estado
    OR NEW.fecha_ejecucion IS DISTINCT FROM OLD.fecha_ejecucion THEN
        SELECT count(*) FILTER (WHERE estado = 'CERRADA'),
               count(*) FILTER (WHERE estado = 'ABIERTA')
          INTO v_cerradas, v_abiertas
          FROM ordenes_trabajo WHERE programacion_id = OLD.id;
    END IF;

    -- 015 · F · la fecha fisica de una visita ya cerrada es historica.
    IF NEW.fecha_ejecucion IS DISTINCT FROM OLD.fecha_ejecucion THEN
        IF v_cerradas > 0 THEN
            RAISE EXCEPTION 'La programacion % tiene una OT CERRADA: su fecha_ejecucion (%) '
                'es historica y no admite pasar a %. El dia fisico de un mantenimiento ya '
                'ejecutado no se reescribe; los ciclos que produjo citan esa misma fecha. '
                'Corregirla exigiria un flujo explicito y auditado que todavia no existe.',
                OLD.id, OLD.fecha_ejecucion, NEW.fecha_ejecucion;
        END IF;
        -- la regla G, la de fecha futura, ya se aplico arriba: es comun a INSERT y UPDATE.
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN

        IF v_cerradas > 0 THEN
            RAISE EXCEPTION 'La programacion % tiene una OT CERRADA: su resultado (%) es '
                'historico y no admite pasar a %. Una visita ya ejecutada no se reabre: '
                'el nuevo intento exige una programacion nueva y una OT nueva.',
                OLD.id, OLD.estado, NEW.estado;
        END IF;

        -- 015 · C · LOS CUATRO RESULTADOS SOLO NACEN DEL CIERRE REAL.
        --
        -- La condicion se ancla en el ESTADO DESTINO, no en que exista una OT. Anclarla en
        -- "si hay una OT ABIERTA" dejaba abierto el camino simetrico: una programacion SIN
        -- ninguna OT admitia un UPDATE directo a cualquiera de los cuatro resultados, y no
        -- habia trigger que lo mirara. Medido antes de corregirlo: 8 de 8 combinaciones
        -- (PROGRAMADO y REPROGRAMADO hacia los cuatro resultados) eran ACEPTADAS, dejando
        -- una visita con resultado, sin OT, sin fecha y sin un solo ciclo movido.
        --
        -- Se comprueba el ORIGEN de la escritura, no una señal ni el orden de los
        -- triggers: GET DIAGNOSTICS PG_CONTEXT devuelve la pila de llamada, y un UPDATE
        -- suelto no puede fabricar el marco de una funcion en la que no esta. Se descarto
        -- una señal por set_config/current_setting porque cualquier cliente la fija con
        -- una sentencia extra y el valor esperado es legible en pg_proc.prosrc; y se
        -- descarto la via de permisos porque en esta base existe un unico rol que es
        -- DUENO de las tablas, de modo que no hay nada que revocarle.
        --
        -- Se compara la firma completa, no solo el nombre, para pinchar exactamente esta
        -- funcion y no una homonima con otra signatura.
        IF NEW.estado IN ('EJECUTADO', 'EJECUTADO_PARCIAL', 'NO_EJECUTADO', 'NO_APLICA') THEN
            GET DIAGNOSTICS v_ctx = PG_CONTEXT;
            IF v_ctx NOT LIKE '%cerrar_orden_trabajo(integer,integer,date,integer,text)%' THEN
                RAISE EXCEPTION 'La programacion % no puede pasar a % con un UPDATE: los '
                    'resultados de una visita (EJECUTADO, EJECUTADO_PARCIAL, NO_EJECUTADO, '
                    'NO_APLICA) los escribe unicamente cerrar_orden_trabajo(), que en la '
                    'misma transaccion fija la fecha, propaga los ciclos y cierra la OT. '
                    'Estado actual: %.', OLD.id, NEW.estado, OLD.estado;
            END IF;
            -- el cierre solo parte de una visita viva
            IF OLD.estado NOT IN ('PROGRAMADO', 'REPROGRAMADO') THEN
                RAISE EXCEPTION 'Transicion no valida al cerrar la programacion %: % -> %. '
                    'El cierre lleva PROGRAMADO o REPROGRAMADO a EJECUTADO, '
                    'EJECUTADO_PARCIAL, NO_EJECUTADO o NO_APLICA.',
                    OLD.id, OLD.estado, NEW.estado;
            END IF;

        -- 015 · C.bis · el resto son cambios ADMINISTRATIVOS (PROYECTADO -> PROGRAMADO,
        -- PROGRAMADO <-> REPROGRAMADO, y la cancelacion). Con una OT ABIERTA no caben: el
        -- universo que esa OT debe cerrar no puede cambiar despues de haberla abierto.
        -- La entrada a CANCELADO ya la gobierna, con su propio mensaje, la regla de 013 de
        -- mas arriba; esta rama la respalda para el resto de transiciones.
        ELSIF v_abiertas > 0 THEN
            RAISE EXCEPTION 'La programacion % tiene una OT ABIERTA: no admite cambios '
                'administrativos de estado (se intento % -> %). Cierra la OT con '
                'cerrar_orden_trabajo(), o anulala si hay que cambiar la visita.',
                OLD.id, OLD.estado, NEW.estado;
        END IF;
    END IF;

    RETURN NEW;
END $$;


COMMENT ON FUNCTION impedir_modificar_ot_cerrada() IS
    'Inmutabilidad de la OT. Ninguna OT se borra fisicamente, en ningun estado: su '
    'existencia es lo que vuelve historico el alcance de la visita. Una OT cerrada o '
    'anulada tampoco se edita. Una abierta solo puede pasar a CERRADA o ANULADA. '
    'Ampliada por 20260928_016.';

COMMENT ON FUNCTION congelar_alcance_programado() IS
    'Alcance previsto de la visita. Antes de que exista ninguna OT se puede preparar con '
    'libertad. Desde que existio cualquier OT -abierta, cerrada o anulada- el alcance es '
    'historico: ni INSERT, ni DELETE, ni cambio de programacion, programa, tipo o nivel. '
    'En un UPDATE se comprueban los DOS extremos, origen y destino. Ampliada por '
    '20260928_016.';

COMMENT ON FUNCTION congelar_visita_con_ot() IS
    'Guarda de la visita, en INSERT y en UPDATE. Comun a los dos: fecha_ejecucion nunca '
    'futura respecto a America/Lima. Solo en INSERT: nace en PROYECTADO o PROGRAMADO y sin '
    'fecha_ejecucion. Solo en UPDATE: su identidad original -unidad, programa y quincena '
    'programada- es inmutable haya OT o no; con una OT no anulada se congelan tambien '
    'quincena y unidad y no puede cancelarse; con una OT CERRADA el resultado y la fecha '
    'fisica son historicos; CANCELADO es terminal; y los cuatro resultados solo los escribe '
    'cerrar_orden_trabajo(). Ampliada por 20260928_016.';

-- ------------------------------------------------------------- 4 · VERIFICACION FINAL
DO $$
DECLARE
    v_imp text;
    v_alc text;
    v_vis text;
    v_fn  integer;
    v_trg integer;
BEGIN
    SELECT p.prosrc INTO v_imp FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'impedir_modificar_ot_cerrada';
    SELECT p.prosrc INTO v_alc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'congelar_alcance_programado';
    SELECT p.prosrc INTO v_vis FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'congelar_visita_con_ot';

    -- R1 · el DELETE se rechaza sin mirar el estado
    IF v_imp NOT LIKE '%no puede borrarse (esta %' THEN
        RAISE EXCEPTION 'Falta R1: el borrado de OT no queda prohibido.';
    END IF;
    IF v_imp LIKE '%IF OLD.estado <> ''ABIERTA'' THEN%RETURN OLD;%' THEN
        RAISE EXCEPTION 'R1 incompleta: sigue existiendo el camino que permitia borrar una '
            'OT ABIERTA.';
    END IF;

    -- R2 · los dos extremos, y cualquier estado de OT
    IF v_alc NOT LIKE '%v_prog_old%' OR v_alc NOT LIKE '%v_prog_new%' THEN
        RAISE EXCEPTION 'Falta R2: el alcance no comprueba los dos extremos del movimiento.';
    END IF;
    IF v_alc NOT LIKE '%v_ots_old > 0 OR v_ots_new > 0%' THEN
        RAISE EXCEPTION 'R2 incompleta: no rechaza cuando cualquiera de los dos extremos '
            'tuvo una OT.';
    END IF;
    IF v_alc NOT LIKE '%ya tuvo al menos una orden de trabajo%' THEN
        RAISE EXCEPTION 'R2 incompleta: falta el rechazo por alcance historico.';
    END IF;
    -- y conserva el mensaje propio de la OT ABIERTA, que tiene otra salida operativa
    IF v_alc NOT LIKE '%tiene una OT ABIERTA%' THEN
        RAISE EXCEPTION 'R2 perdio el mensaje especifico de la OT ABIERTA.';
    END IF;
    -- la regla de referencias de 013 sigue presente como segunda linea
    IF v_alc NOT LIKE '%ya lo referencia % detalle(s) de OT%' THEN
        RAISE EXCEPTION 'R2 perdio la regla de referencias de 013.';
    END IF;

    -- R3 · identidad inmutable siempre
    IF v_vis NOT LIKE '%no admite cambiar su identidad original%' THEN
        RAISE EXCEPTION 'Falta R3: la identidad original no queda inmutable.';
    END IF;
    IF v_vis NOT LIKE '%NEW.quincena_programada IS DISTINCT FROM OLD.quincena_programada THEN%' THEN
        RAISE EXCEPTION 'R3 incompleta: quincena_programada no queda congelada.';
    END IF;
    -- quincena_reprogramada NO puede haber entrado en la regla de identidad
    IF v_vis LIKE '%OR NEW.quincena_reprogramada IS DISTINCT FROM OLD.quincena_reprogramada THEN%'
       AND v_vis NOT LIKE '%quincena estan congeladas%' THEN
        RAISE EXCEPTION 'R3 mal aplicada: quincena_reprogramada no debe quedar congelada.';
    END IF;

    -- lo que 015 dejo en congelar_visita_con_ot sigue intacto
    IF v_vis NOT LIKE '%IF TG_OP = ''INSERT'' THEN%'
    OR v_vis NOT LIKE '%NEW.estado NOT IN (''PROYECTADO'', ''PROGRAMADO'')%'
    OR v_vis NOT LIKE '%no puede nacer con fecha_ejecucion%'
    OR v_vis NOT LIKE '%es historica y no admite pasar a%'
    OR v_vis NOT LIKE '%NEW.estado IN (''EJECUTADO'', ''EJECUTADO_PARCIAL'', ''NO_EJECUTADO'', ''NO_APLICA'')%'
    OR v_vis NOT LIKE '%GET DIAGNOSTICS v_ctx = PG_CONTEXT%'
    OR v_vis NOT LIKE '%es historica y no vuelve a un %' THEN
        RAISE EXCEPTION 'El reemplazo de congelar_visita_con_ot perdio alguna regla de '
            '013 o de 015.';
    END IF;

    -- 013, 014 y 015 intactas en lo que 016 no toca
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo'
          AND p.prosrc LIKE '%GET DIAGNOSTICS v_escritas = ROW_COUNT%'
          AND p.prosrc LIKE '%exige fecha_ejecucion%') THEN
        RAISE EXCEPTION 'cerrar_orden_trabajo cambio: 016 no debe tocarla.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validar_apertura_ot'
          AND p.prosrc LIKE '%NOT IN (''PROGRAMADO'', ''REPROGRAMADO'')%') THEN
        RAISE EXCEPTION 'validar_apertura_ot cambio: 016 no debe tocarla.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_programacion_fecha_ejecucion_resultado' AND convalidated) THEN
        RAISE EXCEPTION 'El CHECK de 015 desaparecio.';
    END IF;

    -- las 8 funciones y los 12 triggers siguen siendo los mismos
    SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('validar_coherencia_detalle_ot',
        'impedir_modificar_ot_cerrada', 'impedir_modificar_detalle_ot_cerrada',
        'congelar_alcance_programado', 'congelar_visita_con_ot', 'validar_apertura_ot',
        'cerrar_orden_trabajo', 'validar_coherencia_ciclo_ot');
    SELECT count(*) INTO v_trg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND c.relname IN ('ordenes_trabajo', 'ordenes_trabajo_detalle',
        'programacion_mantenimiento', 'programacion_mantenimiento_equipos',
        'programa_mantenimiento_unidad_ciclos');
    IF v_fn <> 8 OR v_trg <> 12 THEN
        RAISE EXCEPTION 'Esperaba 8 funciones y 12 triggers, encontre % y %', v_fn, v_trg;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('impedir_modificar_ot_cerrada',
            'congelar_alcance_programado', 'congelar_visita_con_ot')
          AND (p.proconfig IS NULL
               OR NOT ('search_path=pg_catalog, public' = ANY(p.proconfig)))) THEN
        RAISE EXCEPTION 'Alguna de las 3 funciones perdio su search_path fijo.';
    END IF;

    -- ni una tabla, columna, indice, CHECK ni fila de diferencia
    IF EXISTS (
        SELECT 1 FROM _016_antes a WHERE
            a.tablas   <> (SELECT count(*) FROM information_schema.tables
                            WHERE table_schema = 'public')
         OR a.columnas <> (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public')
         OR a.indices  <> (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public')
         OR a.checks   <> (SELECT count(*) FROM pg_constraint c
                            JOIN pg_namespace n ON n.oid = c.connamespace
                            WHERE n.nspname = 'public' AND c.contype = 'c')) THEN
        RAISE EXCEPTION 'Esta migracion no debe crear tablas, columnas, indices ni CHECK, y '
            'algun recuento del catalogo cambio.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM _016_antes a WHERE
            a.ciclos  <> (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)
         OR a.anclas  <> (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)
         OR a.prog    <> (SELECT count(*) FROM programacion_mantenimiento)
         OR a.prog_eq <> (SELECT count(*) FROM programacion_mantenimiento_equipos)
         OR a.ot      <> (SELECT count(*) FROM ordenes_trabajo)
         OR a.otd     <> (SELECT count(*) FROM ordenes_trabajo_detalle)) THEN
        RAISE EXCEPTION 'Esta migracion no debe tocar ni una fila, y algun conteo cambio.';
    END IF;

    -- los cleanup siguen sin ejecutarse
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'programacion_mantenimiento'
          AND column_name IN ('fecha_programada', 'fecha_reprogramada', 'nivel_mantenimiento')) <> 3 THEN
        RAISE EXCEPTION '20261001_900 parece ejecutada: faltan columnas vestigiales.';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'programas_mantenimiento'
          AND column_name IN ('version', 'fecha_documento', 'periodo_inicio', 'periodo_fin')) <> 4 THEN
        RAISE EXCEPTION '20261001_901 parece ejecutada: faltan columnas de programa.';
    END IF;

    -- quincena_programada tiene que seguir existiendo: es la identidad que R3 congela
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'programacion_mantenimiento' AND column_name = 'quincena_programada') THEN
        RAISE EXCEPTION 'Falta quincena_programada, que es la identidad temporal que R3 congela.';
    END IF;

    RAISE NOTICE 'Alcance e identidad historicos: ninguna OT se borra, el alcance se congela '
        'desde que existio cualquier OT comprobando los dos extremos del movimiento, y la '
        'identidad original de la visita -unidad, programa y quincena programada- es '
        'inmutable. 3 funciones reemplazadas, 0 tablas, 0 columnas, 0 indices, 0 CHECK, '
        '0 triggers nuevos, 0 DML.';
END $$;

DROP TABLE _016_antes;
