-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260925_015 · INMUTABILIDAD DEL RESULTADO DE LA VISITA
-- =====================================================================================
-- CLASIFICACION: CORRECTIVA DE LOGICA. Reemplaza 3 funciones, crea 1 funcion y 1
-- trigger nuevos, y añade 1 CHECK.
--   0 CREATE TABLE. 0 ADD COLUMN. 0 DROP. 0 INDEX. 0 DML.
--   1 ALTER TABLE, solo para ADD CONSTRAINT de un CHECK. Ninguna columna se toca.
--   Los 3 triggers de las funciones reemplazadas ya existen y apuntan por nombre: no
--   se recrean salvo trg_congelar_visita_con_ot, que cambia de evento a INSERT OR UPDATE
--   y por tanto no se puede modificar con ALTER. El unico trigger NUEVO es el de
--   coherencia de ciclos, sobre una tabla que no tenia ninguna guarda de negocio.
--   No toca los ciclos, las anclas ni ninguna tabla historica.
--
-- Debe ejecutarse DESPUES de 20260925_014 y ANTES de los cleanup de pending_cleanup/.
-- No modifica 013 ni 014: ambas estan commiteadas, pusheadas y aplicadas.
--
-- -------------------------------------------------------------------------------------
-- EL HUECO QUE CIERRA
-- -------------------------------------------------------------------------------------
-- 014 impidio ABRIR una OT sobre una visita ya resuelta, pero no impedia REESCRIBIR su
-- estado. Es decir esto se aceptaba:
--
--     UPDATE programacion_mantenimiento SET estado = 'PROGRAMADO'
--      WHERE estado = 'NO_EJECUTADO';
--
-- Los indices seguian impidiendo la reutilizacion real -la OT cerrada ocupa
-- uq_ot_programacion_activa y la programacion no cancelada ocupa
-- uq_programacion_unidad_quincena_efectiva-, asi que no se podia volver a intervenir.
-- Pero la ETIQUETA quedaba falsificada: un informe diria manana que aquella visita
-- estaba PROGRAMADO cuando realmente termino sin ejecucion.
--
-- Auditado antes de escribir esto: congelar_visita_con_ot vigilaba el estado en UNA sola
-- transicion, la ENTRADA a CANCELADO. Toda otra reescritura pasaba sin control:
-- NO_EJECUTADO -> PROGRAMADO, EJECUTADO -> PROGRAMADO, EJECUTADO_PARCIAL ->
-- REPROGRAMADO, NO_APLICA -> PROGRAMADO, CANCELADO -> PROGRAMADO y CANCELADO ->
-- REPROGRAMADO.
--
-- -------------------------------------------------------------------------------------
-- LAS DOS REGLAS QUE SE AÑADEN
-- -------------------------------------------------------------------------------------
-- A · Si la programacion tiene una OT CERRADA, su estado es inmutable. Congela de una
--     vez EJECUTADO, EJECUTADO_PARCIAL, NO_EJECUTADO y NO_APLICA sin enumerarlos: la
--     condicion no es "que estado tiene" sino "ya hubo un cierre".
--
-- B · CANCELADO es TERMINAL. Una vez cancelada, la programacion no vuelve a ningun
--     estado activo. La ENTRADA a CANCELADO la sigue gobernando la regla que ya existia
--     (solo con la OT ANULADA); esta cierra la SALIDA.
--
-- C · Los cuatro RESULTADOS de una visita -EJECUTADO, EJECUTADO_PARCIAL, NO_EJECUTADO
--     y NO_APLICA- solo nacen de cerrar_orden_trabajo(). La regla se ancla en el estado
--     DESTINO, no en que exista una OT.
--
--     Anclarla en "si hay una OT ABIERTA" dejaba abierto el camino simetrico: una
--     programacion SIN ninguna OT admitia un UPDATE directo a cualquiera de los cuatro
--     resultados. Medido antes de corregirlo: 8 de 8 combinaciones ACEPTADAS, dejando una
--     visita con resultado, sin OT, sin fecha_ejecucion y sin un solo ciclo movido.
--
--     Y por separado, con una OT ABIERTA tampoco caben los cambios administrativos de
--     estado: el universo que esa OT debe cerrar no puede cambiar tras haberla abierto.
--
--     Alternativas evaluadas y medidas contra esta base antes de elegir:
--
--     A) maquina de estados sola: con OT ABIERTA permitir solo PROGRAMADO/REPROGRAMADO
--        hacia los cuatro resultados. Insuficiente: un UPDATE suelto puede imitar el
--        cierre, dejando una visita marcada EJECUTADO con su OT todavia ABIERTA y sin un
--        solo ciclo movido. Si esa OT no se cierra nunca, la mentira es permanente.
--
--     B) señal transaccional con set_config/current_setting(is_local=true): FALSIFICABLE.
--        Se probo desde un cliente normal: una sola sentencia extra fija la señal, y el
--        nombre y el valor esperados son legibles en pg_proc.prosrc. No es una frontera
--        de integridad, es una convencion.
--
--     C) permisos: NO DISPONIBLE en esta base. Auditado: existe un unico rol, que es
--        DUENO de las tablas, miembro de neon_superuser, con bypassrls, con privilegio
--        TRIGGER y con derecho a crear roles. A un dueño no se le revoca nada util. Y el
--        proyecto no usa SECURITY DEFINER en ninguna funcion, asi que introducirlo aqui
--        seria un patron nuevo sin una necesidad que lo justifique.
--
--     D) ELEGIDA: comprobar el ORIGEN de la escritura con GET DIAGNOSTICS PG_CONTEXT.
--        Verificado experimentalmente: la pila distingue un UPDATE directo de uno emitido
--        dentro de una funcion. Un UPDATE suelto no puede fabricar el marco de una
--        funcion en la que no esta, y no depende de una señal, ni del orden de los
--        triggers, ni de tablas o columnas nuevas.
--
--     Techo honesto de esta proteccion: el rol de la aplicacion es dueño del esquema, asi
--     que puede desactivar el trigger o reemplazar la funcion. Lo que D garantiza es que
--     NINGUNA sentencia UPDATE, por si sola, puede hacerse pasar por un cierre. Eso es
--     exactamente la amenaza que habia que cerrar; el resto ya no es materia de la base
--     sino de quien administra el rol.
--
-- D · Una OT solo pasa de ABIERTA a CERRADA como consecuencia del cierre real.
--
--     Hueco auditado y reproducido antes de escribir esto. impedir_modificar_ot_cerrada
--     solo comprobaba OLD.estado <> 'ABIERTA', es decir protegia una OT YA cerrada pero
--     dejaba pasar la transicion ABIERTA -> CERRADA; y chk_ot_cierre solo exige que
--     fecha_cierre y cerrada_por_id acompañen al estado. Un UPDATE directo bien formado
--     era ACEPTADO y dejaba este estado incoherente:
--
--         ordenes_trabajo.estado ....... CERRADA
--         programacion.estado .......... PROGRAMADO
--         programacion.fecha_ejecucion . NULL
--         ciclos de la unidad .......... 0
--
--     La comprobacion NO usa PG_CONTEXT aqui, sino un INVARIANTE DE DATOS: para cerrar,
--     la programacion debe llevar ya su resultado escrito. Se apoya en el orden real del
--     cierre, medido sobre la funcion desplegada: la programacion recibe su resultado en
--     el offset 7268 y la OT se cierra en el 7440. Cuando el cierre real llega a cerrar
--     la OT, la visita ya esta en EJECUTADO, EJECUTADO_PARCIAL, NO_EJECUTADO o NO_APLICA.
--     Un UPDATE directo a la OT, en cambio, encuentra la visita todavia en PROGRAMADO o
--     REPROGRAMADO, y se rechaza.
--
--     Las reglas C y D se cierran en pinza, y por eso ninguna puede saltarse por separado:
--       · no se puede adelantar el resultado de la visita, porque C exige que la escritura
--         venga del cierre real;
--       · no se puede cerrar la OT sin ese resultado, porque D lo exige.
--     El resultado es la atomicidad que se buscaba: no existe un estado en el que la OT
--     este CERRADA y la visita siga sin resultado.
--
--     Se prefirio el invariante de datos a repetir PG_CONTEXT en una segunda funcion: deja
--     el acoplamiento a la firma de cerrar_orden_trabajo en UN solo sitio (la regla C) en
--     lugar de dos.
--
--     ABIERTA -> ANULADA no se toca: pertenece al flujo administrativo de la sustitucion A
--     y sigue permitida sin condiciones.
--
-- E · La fecha FISICA de ejecucion es obligatoria solo cuando el resultado afirma que se
--     ejecuto mantenimiento:
--
--         EJECUTADO         -> fecha_ejecucion NOT NULL
--         EJECUTADO_PARCIAL -> fecha_ejecucion NOT NULL
--         NO_EJECUTADO      -> puede ser NULL, no hubo ejecucion fisica
--         NO_APLICA         -> puede ser NULL
--
--     Hecho medido antes de imponerlo: los cuatro resultados admitian fecha NULL, de modo
--     que una visita podia quedar EJECUTADO con sus ciclos avanzados y ultima_fecha_real en
--     NULL, perdiendo en silencio la trazabilidad del dia fisico.
--
--     LA FECHA NO DEFINE LA QUINCENA. La fase administrativa sigue siendo
--     quincena_efectiva = COALESCE(quincena_reprogramada, quincena_programada), y el ciclo
--     se sigue actualizando con ella, nunca con fecha_ejecucion. Por eso NO se exige que la
--     fecha caiga dentro de la quincena: quincena_efectiva 2026-09-16 con fecha_ejecucion
--     2026-09-14 es un caso valido y se prueba como tal.
--
--     Se impone por DOS vias complementarias, y se verifico que el CHECK es compatible con
--     el orden real del cierre antes de escribirlo:
--
--       a) CHECK chk_programacion_fecha_ejecucion_resultado, como invariante declarativo.
--          El cierre escribe fecha_ejecucion (offset 3493) ANTES del resultado (offset
--          7302), asi que en el UPDATE del estado la fecha ya esta puesta y el CHECK pasa;
--          si el llamante paso NULL, el CHECK aborta el cierre entero. Medido: los cuatro
--          resultados con fecha valida siguen cerrando, y con fecha NULL solo se rechazan
--          EJECUTADO y EJECUTADO_PARCIAL. Efecto colateral util y comprobado: tambien
--          impide vaciar despues la fecha de una visita ya cerrada como ejecutada.
--
--       b) una comprobacion explicita dentro de cerrar_orden_trabajo, para que el operador
--          lea por que se rechaza en vez de una violacion de restriccion. Va entre la
--          derivacion del resultado y el UPDATE del estado, porque antes de la derivacion
--          no se sabe todavia si la visita sera EJECUTADO.
--
-- F · fecha_ejecucion es HISTORICA una vez que existe una OT CERRADA para la visita. No
--     se cambia por otra fecha, ni a NULL, ni a una futura. No se diseña correccion
--     historica: si algun dia hay que corregir una fecha ya cerrada, sera un flujo
--     explicito y auditado aparte.
--
--     Hueco auditado y reproducido: no habia NINGUNA regla sobre modificar fecha_ejecucion.
--     Un UPDATE posterior al cierre la cambio de 2026-09-16 a 2026-09-23 mientras los
--     cuatro ciclos conservaban 2026-09-16, sin tocar ninguna fila de ciclos y sin aviso.
--
--     La condicion es un HECHO DE DATOS -existe una OT CERRADA para esta programacion-, no
--     PG_CONTEXT, ni una señal, ni el nombre de una funcion. El cierre normal no tropieza
--     con ella porque escribe fecha_ejecucion (offset 3493) cuando su OT sigue ABIERTA; la
--     OT no pasa a CERRADA hasta el offset 7470. Reverificado empiricamente.
--
-- G · fecha_ejecucion no puede ser FUTURA respecto a la fecha de negocio de Peru. Ni en
--     UPDATE ni en INSERT, ni con OT ni sin ella.
--
--     Segundo hueco auditado: el trigger era BEFORE UPDATE, asi que un INSERT directo de una
--     programacion con fecha futura no pasaba por ninguna comprobacion. Que hoy no se
--     alcance porque el generador inserta NULL no es integridad, es suerte. Por eso el
--     trigger se recrea como BEFORE INSERT OR UPDATE y la regla se evalua como invariante de
--     la fila, no solo cuando la columna cambia.
--
--     Hueco auditado: la validacion de fecha futura vivia SOLO dentro de
--     cerrar_orden_trabajo, asi que un UPDATE directo la esquivaba. Medido: con Lima en
--     2026-09-26 se acepto fecha_ejecucion = 2026-10-26.
--
--     POR QUE UN TRIGGER Y NO UN CHECK. Se comprobo que PostgreSQL 18.6 SI admite now() en
--     un CHECK -contra lo que cabria esperar-, y en este caso concreto el predicado incluso
--     seria monotono: una fecha que hoy no es futura no lo sera nunca, asi que no se
--     invalidaria con el tiempo ni romperia un restore. Pero un CHECK sigue siendo el sitio
--     equivocado por dos razones de fondo:
--       · la regla F, que es la principal, necesita comparar OLD con NEW y consultar
--         ordenes_trabajo. Un CHECK no puede hacer ninguna de las dos cosas. El trigger es
--         obligatorio de todos modos, y partir la misma columna entre dos mecanismos solo
--         dispersaria la regla;
--       · la semantica de un CHECK es "invariante siempre verdadero para toda fila", y
--         PostgreSQL lo asume al planificar; un predicado que depende del reloj traiciona
--         esa promesa aunque aqui no de problemas practicos.
--     Se compara explicitamente contra (now() AT TIME ZONE 'America/Lima')::date, nunca
--     contra CURRENT_DATE, que depende de la timezone de la sesion. La sesion de Neon esta
--     en GMT y desde las 19:00 de Lima iria un dia por delante.
--
-- H · Un ciclo con fuente ORDENES_TRABAJO no puede divergir de la visita que lo origino.
--
--     La traza es inequivoca y se auditaron las FK: ciclo.orden_trabajo_detalle_id ->
--     ordenes_trabajo_detalle.id, y esa fila lleva programacion_id NOT NULL pinchado por
--     DOS FK compuestas (fk_otd_orden hacia ordenes_trabajo(id, programacion_id) y
--     fk_otd_programado hacia programacion_mantenimiento_equipos(id, programacion_id)). Un
--     solo salto, sin ambiguedad posible.
--
--     Invariantes impuestas para fuente = 'ORDENES_TRABAJO':
--         ultima_quincena   = programacion_mantenimiento.quincena_efectiva
--         ultima_fecha_real = programacion_mantenimiento.fecha_ejecucion
--         orden_trabajo_detalle_id IS NOT NULL
--
--     Se comparan contra la programacion del DETALLE QUE LA FILA CITA, no contra la que se
--     este cerrando. Ese matiz es lo que hace que el anti-retroceso no la contradiga:
--     cuando la guarda descarta el upsert, la fila no se escribe y conserva quincena, fecha
--     y detalle del cierre ANTERIOR, que siguen siendo coherentes entre si.
--
--     La quincena sigue siendo la referencia administrativa de cadencia. La invariante NO
--     relaciona fecha_ejecucion con la quincena: son cosas distintas y una fecha fisica
--     fuera de su quincena es valida.
--
--     Va en un TRIGGER NUEVO porque sobre programa_mantenimiento_unidad_ciclos no existe
--     ninguna funcion de negocio que ampliar: se auditó y el unico trigger de esa tabla es
--     el set_updated_at estandar. No se duplica nada.
--
-- I · Una visita solo puede NACER en PROYECTADO o PROGRAMADO.
--
--     Tercer hueco auditado y medido: con el trigger ya cubriendo el INSERT, los cuatro
--     resultados seguian siendo estados iniciales validos. Los cuatro fueron ACEPTADOS en un
--     INSERT directo, creando visitas que afirmaban haberse ejecutado con 0 OT y 0 ciclos.
--     La regla C solo miraba el UPDATE, asi que el INSERT la esquivaba entera.
--
--     REPROGRAMADO y CANCELADO tampoco son estados iniciales: el primero supone una
--     programacion previa que se mueve, el segundo una que se anula. Ambos se alcanzan por
--     UPDATE, y sus reglas ya aprobadas siguen gobernando esa transicion.
--
-- J · Y una visita nace SIN fecha_ejecucion, sin excepcion.
--
--     El hallazgo anterior -"INSERT con fecha pasada permitido"- era una descripcion del
--     estado actual, no una regla de negocio, y no se conserva. fecha_ejecucion es el dia
--     FISICO del trabajo y aparece durante el cierre real, no al crear la programacion.
--     Con esta regla, la comprobacion comun de fecha futura queda como red adicional: un
--     INSERT legitimo no trae fecha ninguna.
--
-- Se amplia la funcion existente en lugar de crear un segundo trigger: las cuatro reglas
-- responden a la misma pregunta -que puede cambiar de esta visita y cuando- y repartirlas
-- entre dos triggers BEFORE UPDATE sobre la misma tabla dejaria el orden de evaluacion
-- dependiendo del nombre del trigger, que es una forma pesima de expresar precedencia.
--
-- -------------------------------------------------------------------------------------
-- POR QUE NO BLOQUEA EL CIERRE NORMAL · MEDIDO, NO SUPUESTO
-- -------------------------------------------------------------------------------------
-- Se leyo el cuerpo REALMENTE DESPLEGADO de cerrar_orden_trabajo y se localizaron sus
-- hitos por posicion. Orden real:
--
--     offset  633  lee la OT con FOR UPDATE
--     offset  865  exige que la OT este ABIERTA
--     offset 2126  valida la fecha contra America/Lima
--     offset 3138  exige que la visita este completa
--     offset 3452  UPDATE programacion SET fecha_ejecucion
--     offset 4419  propaga los ciclos
--     offset 7268  UPDATE programacion SET estado = <resultado>     <-- OT aun ABIERTA
--     offset 7440  UPDATE ordenes_trabajo SET estado = 'CERRADA'    <-- ultimo paso
--
-- El resultado de la visita se escribe MIENTRAS la OT sigue ABIERTA, y la OT pasa a
-- CERRADA en la ultima sentencia. Despues no hay ningun UPDATE de
-- programacion_mantenimiento: se verifico que la cola de la funcion no contiene ninguno.
--
-- Por tanto, en el instante en que este trigger evalua la regla A, el recuento de OT
-- CERRADAS de esa programacion es 0 y la escritura pasa. El cierre fija el resultado por
-- PRIMERA vez sin tropezar con la regla; a partir del commit, ese resultado es inmutable.
--
-- -------------------------------------------------------------------------------------
-- LA SUSTITUCION SIGUE VIVA
-- -------------------------------------------------------------------------------------
-- El flujo aprobado no se rompe, porque la regla A mira CERRADA y no ANULADA:
--
--     P1 PROGRAMADO -> OT1 ABIERTA -> OT1 ANULADA -> P1 CANCELADO
--     -> P2 nueva (misma quincena permitida) -> OT2 ABIERTA -> OT2 CERRADA
--
-- Al cancelar P1 su unica OT esta ANULADA, asi que no hay OT CERRADA y la transicion a
-- CANCELADO pasa. Desde ahi, la regla B la deja congelada para siempre.
--
-- -------------------------------------------------------------------------------------
-- LO QUE SIGUE SIENDO ESCRIBIBLE
-- -------------------------------------------------------------------------------------
-- La regla A solo mira la columna estado. fecha_ejecucion y observaciones siguen siendo
-- modificables tras el cierre, y la consulta de OT cerradas solo se paga cuando el estado
-- cambia de verdad.
--
-- Nota de coexistencia: el comentario de 013 que decia "fecha_ejecucion, estado y
-- observaciones siguen siendo escribibles" queda parcialmente superado en cuanto a
-- estado. 013 no se edita; la regla vigente es la de esta migracion.
-- =====================================================================================

-- ------------------------------------------------------------ 0 · GUARDAS DE PRECONDICION
DO $$
BEGIN
    IF to_regclass('public.ordenes_trabajo') IS NULL THEN
        RAISE EXCEPTION 'Falta ordenes_trabajo: 20260925_013 no se ha aplicado.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'congelar_visita_con_ot') THEN
        RAISE EXCEPTION 'Falta congelar_visita_con_ot: la crea 013.';
    END IF;

    -- el trigger tiene que seguir existiendo: esta migracion NO lo recrea
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname = 'programacion_mantenimiento'
          AND t.tgname = 'trg_congelar_visita_con_ot') THEN
        RAISE EXCEPTION 'Falta trg_congelar_visita_con_ot sobre programacion_mantenimiento.';
    END IF;

    -- 014 debe estar aplicada: 015 se apoya en que abrir OT ya esta restringido
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validar_apertura_ot'
          AND p.prosrc LIKE '%NOT IN (''PROGRAMADO'', ''REPROGRAMADO'')%') THEN
        RAISE EXCEPTION '20260925_014 no esta aplicada: validar_apertura_ot no restringe '
            'la apertura a PROGRAMADO/REPROGRAMADO.';
    END IF;

    -- el orden del cierre es la premisa de la regla A: si alguien reordenara la funcion
    -- para cerrar la OT antes de fijar el estado, esta migracion bloquearia el cierre
    IF (SELECT position('UPDATE programacion_mantenimiento SET estado = v_estado' IN p.prosrc)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo')
       >= (SELECT position('SET estado         = ''CERRADA''' IN p.prosrc)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo') THEN
        RAISE EXCEPTION 'cerrar_orden_trabajo no fija el estado de la programacion antes de '
            'cerrar la OT. La regla A de esta migracion bloquearia el cierre normal.';
    END IF;
END $$;

-- Foto de los conteos ANTES de tocar nada, igual que en 014: la verificacion final compara
-- contra ella en vez de afirmar valores absolutos, para que 015 siga siendo aplicable
-- cuando ya exista programacion real.
CREATE TEMP TABLE _015_antes AS SELECT
    (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)  AS ciclos,
    (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)  AS anclas,
    (SELECT count(*) FROM programacion_mantenimiento)            AS prog,
    (SELECT count(*) FROM programacion_mantenimiento_equipos)    AS prog_eq,
    (SELECT count(*) FROM ordenes_trabajo)                       AS ot,
    (SELECT count(*) FROM ordenes_trabajo_detalle)               AS otd;

-- ------------------------------------ 1 · QUE PUEDE CAMBIAR DE UNA VISITA, Y CUANDO
-- Las dos primeras reglas son las de 013, sin cambios. Las dos ultimas son nuevas.
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

-- El trigger pasa a cubrir tambien el INSERT. Es el UNICO trigger que esta migracion
-- recrea, y se recrea porque su evento tiene que cambiar: no se puede añadir INSERT a un
-- trigger existente con ALTER. No se crea ninguno paralelo: sigue habiendo un solo trigger
-- de congelado sobre programacion_mantenimiento, con el mismo nombre y la misma funcion.
DROP TRIGGER trg_congelar_visita_con_ot ON programacion_mantenimiento;
CREATE TRIGGER trg_congelar_visita_con_ot
    BEFORE INSERT OR UPDATE ON programacion_mantenimiento
    FOR EACH ROW EXECUTE FUNCTION congelar_visita_con_ot();

COMMENT ON FUNCTION congelar_visita_con_ot() IS
    'Guarda de la visita, en INSERT y en UPDATE. Comun a los dos: fecha_ejecucion nunca '
    'futura respecto a America/Lima. Solo en INSERT: nace en PROYECTADO o PROGRAMADO y sin '
    'fecha_ejecucion. Solo en UPDATE, porque necesitan OLD: '
    'con una OT no anulada congela unidad y quincena y '
    'prohibe cancelar. Con una OT CERRADA congela tambien el estado: el resultado de una '
    'visita ejecutada es historico. Y CANCELADO es terminal. No bloquea el cierre porque '
    'cerrar_orden_trabajo fija el estado mientras su OT sigue ABIERTA. Ampliada por '
    '20260925_015.';

-- ----------------------------------- 2 · UNA OT SE CIERRA SOLO POR EL CIERRE REAL
-- Cuerpo identico al de 013 salvo la regla D. Se mantiene el nombre y la firma:
-- trg_impedir_modificar_ot_cerrada sigue sirviendo sin recrearse.
CREATE OR REPLACE FUNCTION impedir_modificar_ot_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_estado_visita varchar(20);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.estado <> 'ABIERTA' THEN
            RAISE EXCEPTION 'La OT % esta % y no puede borrarse.', OLD.id, OLD.estado;
        END IF;
        RETURN OLD;
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

COMMENT ON FUNCTION impedir_modificar_ot_cerrada() IS
    'Inmutabilidad de la OT. Una OT cerrada o anulada no se edita ni se borra, y una OT '
    'solo pasa a CERRADA cuando su programacion ya lleva resultado, cosa que unicamente '
    'consigue cerrar_orden_trabajo(). ABIERTA -> ANULADA sigue siendo administrativa. '
    'Ampliada por 20260925_015.';

-- --------------------- 3 · UN CICLO DE OT NO PUEDE DIVERGIR DE LA VISITA QUE LO ORIGINO
-- Trigger NUEVO: sobre programa_mantenimiento_unidad_ciclos no hay ninguna funcion de
-- negocio que ampliar, solo el set_updated_at estandar.
CREATE FUNCTION validar_coherencia_ciclo_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_quincena date;
    v_fecha    date;
    v_prog     integer;
BEGIN
    -- los 688 ciclos historicos del Excel y cualquier otra fuente quedan fuera
    IF NEW.fuente <> 'ORDENES_TRABAJO' THEN
        RETURN NEW;
    END IF;

    -- chk_ciclo_trazabilidad_ot ya ata fuente y detalle, pero se comprueba aqui para dar un
    -- mensaje propio y para no depender del orden en que se evaluen CHECK y trigger.
    IF NEW.orden_trabajo_detalle_id IS NULL THEN
        RAISE EXCEPTION 'Un ciclo con fuente ORDENES_TRABAJO debe citar el detalle de OT que '
            'lo produjo: sin el no hay forma de saber que visita lo origino.';
    END IF;

    -- la visita se obtiene del DETALLE QUE LA FILA CITA, no de ninguna otra: es lo que hace
    -- que el anti-retroceso siga siendo coherente.
    SELECT d.programacion_id, pm.quincena_efectiva, pm.fecha_ejecucion
      INTO v_prog, v_quincena, v_fecha
      FROM ordenes_trabajo_detalle d
      JOIN programacion_mantenimiento pm ON pm.id = d.programacion_id
     WHERE d.id = NEW.orden_trabajo_detalle_id;
    IF v_prog IS NULL THEN
        RAISE EXCEPTION 'El detalle de OT % no existe: no se puede validar la coherencia del '
            'ciclo.', NEW.orden_trabajo_detalle_id;
    END IF;

    IF NEW.ultima_quincena IS DISTINCT FROM v_quincena THEN
        RAISE EXCEPTION 'El ciclo %/% dice quincena % pero la visita % que lo origino esta en '
            'la quincena efectiva %. La fase administrativa de un ciclo de OT es la de su '
            'visita.', NEW.tipo_equipo, NEW.nivel_mantenimiento, NEW.ultima_quincena,
            v_prog, v_quincena;
    END IF;

    IF NEW.ultima_fecha_real IS DISTINCT FROM v_fecha THEN
        RAISE EXCEPTION 'El ciclo %/% dice fecha fisica % pero la visita % que lo origino se '
            'ejecuto el %. Las dos tienen que ser el mismo dia.',
            NEW.tipo_equipo, NEW.nivel_mantenimiento, NEW.ultima_fecha_real, v_prog, v_fecha;
    END IF;

    RETURN NEW;
END $$;

COMMENT ON FUNCTION validar_coherencia_ciclo_ot() IS
    'Impide que un ciclo con fuente ORDENES_TRABAJO diverja de la visita que lo produjo: '
    'ultima_quincena y ultima_fecha_real deben coincidir con quincena_efectiva y '
    'fecha_ejecucion de la programacion del detalle que el ciclo cita. No relaciona la '
    'fecha fisica con la quincena: son cosas distintas. Creada por 20260925_015.';

CREATE TRIGGER trg_validar_coherencia_ciclo_ot
    BEFORE INSERT OR UPDATE ON programa_mantenimiento_unidad_ciclos
    FOR EACH ROW EXECUTE FUNCTION validar_coherencia_ciclo_ot();

-- ------------------------------- 4 · LA FECHA FISICA CUANDO SE AFIRMA QUE SE EJECUTO
-- Invariante declarativo. NO exige que la fecha caiga en la quincena: son cosas distintas.
-- Se añade VALIDADO (sin NOT VALID) a proposito: debe comprobar tambien las filas que ya
-- existan cuando se aplique, y si alguna las violara es una discrepancia que hay que ver.
ALTER TABLE programacion_mantenimiento
    ADD CONSTRAINT chk_programacion_fecha_ejecucion_resultado CHECK (
        estado NOT IN ('EJECUTADO', 'EJECUTADO_PARCIAL') OR fecha_ejecucion IS NOT NULL);

COMMENT ON CONSTRAINT chk_programacion_fecha_ejecucion_resultado ON programacion_mantenimiento IS
    'Un resultado que afirma ejecucion exige el dia fisico. NO_EJECUTADO y NO_APLICA '
    'admiten fecha nula. No relaciona la fecha con la quincena: la fase sigue siendo '
    'quincena_efectiva. Añadido por 20260925_015.';

-- --------------------- 5 · EL MISMO INVARIANTE, CON MENSAJE OPERATIVO, EN EL CIERRE
-- Cuerpo identico al que dejo 014 -verificado carater a carater contra la funcion
-- desplegada- salvo la comprobacion de fecha marcada como 015 · E.
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

    -- 015 · E · la fecha FISICA es obligatoria cuando el resultado afirma que se ejecuto
    -- mantenimiento. El invariante lo impone chk_programacion_fecha_ejecucion_resultado;
    -- esta comprobacion se adelanta para dar un mensaje operativo entendible en vez de una
    -- violacion de restriccion. Se coloca aqui porque el resultado no se conoce hasta la
    -- derivacion de arriba: antes de este punto no se sabe si la visita sera EJECUTADO.
    IF v_estado IN ('EJECUTADO', 'EJECUTADO_PARCIAL') AND p_fecha_ejecucion IS NULL THEN
        RAISE EXCEPTION 'La OT % cierra la visita como % y exige fecha_ejecucion: es el dia '
            'FISICO del trabajo, y sin ella los ciclos quedarian sin ultima_fecha_real. '
            'NO_EJECUTADO y NO_APLICA si admiten fecha nula. Recuerda que la fecha NO define '
            'la quincena: la fase administrativa sigue siendo quincena_efectiva (%).',
            p_ot_id, v_estado, v_quincena;
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

-- ------------------------------------------------------------- 6 · VERIFICACION FINAL
DO $$
DECLARE
    v_src    text;
    v_src_ot text;
    v_src_cierre text;
    v_src_ciclo  text;
    v_fn     integer;
    v_trg    integer;
    v_trg_pm integer;
    v_ciclos integer;
    v_anclas integer;
BEGIN
    SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'congelar_visita_con_ot';

    -- las dos reglas NUEVAS
    IF v_src NOT LIKE '%OLD.estado = ''CANCELADO'' AND NEW.estado IS DISTINCT FROM OLD.estado%' THEN
        RAISE EXCEPTION 'Falta la regla B: CANCELADO no quedo terminal.';
    END IF;
    IF v_src NOT LIKE '%estado = ''CERRADA''%' OR v_src NOT LIKE '%v_cerradas > 0%' THEN
        RAISE EXCEPTION 'Falta la regla A: el estado no queda congelado tras el cierre.';
    END IF;
    IF v_src NOT LIKE '%GET DIAGNOSTICS v_ctx = PG_CONTEXT%'
    OR v_src NOT LIKE '%cerrar_orden_trabajo(integer,integer,date,integer,text)%' THEN
        RAISE EXCEPTION 'Falta la regla C: los resultados no quedan ligados al cierre real.';
    END IF;
    -- la regla C tiene que estar anclada en el ESTADO DESTINO, no en que exista una OT:
    -- de lo contrario reaparece el hueco de la visita sin OT.
    IF v_src NOT LIKE
       '%NEW.estado IN (''EJECUTADO'', ''EJECUTADO_PARCIAL'', ''NO_EJECUTADO'', ''NO_APLICA'')%' THEN
        RAISE EXCEPTION 'La regla C no esta anclada en el estado destino: una programacion '
            'sin OT podria recibir un resultado por UPDATE directo.';
    END IF;
    -- La comprobacion anterior solo mira el texto que esta migracion acaba de escribir, asi
    -- que por si sola es autorreferencial. Lo que de verdad hay que exigir es que exista una
    -- funcion con EXACTAMENTE la firma que la regla C espera reconocer en la pila: si alguien
    -- renombra cerrar_orden_trabajo o le cambia la signatura, la regla C dejaria de
    -- reconocer el cierre y lo rechazaria. Falla cerrado, y se detecta aqui.
    IF to_regprocedure('public.cerrar_orden_trabajo(integer,integer,date,integer,text)') IS NULL THEN
        RAISE EXCEPTION 'No existe cerrar_orden_trabajo(integer,integer,date,integer,text). '
            'La regla C reconoce el cierre por esa firma exacta: si cambia, hay que migrar '
            'tambien esta proteccion.';
    END IF;

    -- la regla D, en la funcion del lado de la OT
    SELECT p.prosrc INTO v_src_ot FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'impedir_modificar_ot_cerrada';
    IF v_src_ot NOT LIKE '%NEW.estado = ''CERRADA''%'
    OR v_src_ot NOT LIKE '%no tiene resultado%' THEN
        RAISE EXCEPTION 'Falta la regla D: una OT podria cerrarse con un UPDATE directo.';
    END IF;
    -- y sus reglas de 013 siguen intactas
    IF v_src_ot NOT LIKE '%no puede borrarse%' OR v_src_ot NOT LIKE '%es inmutable%' THEN
        RAISE EXCEPTION 'Se perdio la inmutabilidad de 013 en impedir_modificar_ot_cerrada.';
    END IF;

    -- las dos reglas VIEJAS siguen intactas
    IF v_src NOT LIKE '%su unidad y su %quincena estan congeladas%' THEN
        RAISE EXCEPTION 'Se perdio la regla de 013 que congela unidad y quincena.';
    END IF;
    IF v_src NOT LIKE '%no puede cancelarse%' THEN
        RAISE EXCEPTION 'Se perdio la regla de 013 que exige anular la OT antes de cancelar.';
    END IF;

    -- el trigger de la visita cubre INSERT y UPDATE, y sigue siendo uno solo
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname = 'programacion_mantenimiento'
          AND t.tgname = 'trg_congelar_visita_con_ot'
          AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE%') THEN
        RAISE EXCEPTION 'trg_congelar_visita_con_ot no cubre INSERT OR UPDATE.';
    END IF;
    -- y la funcion distingue explicitamente el INSERT, donde no hay OLD
    IF v_src NOT LIKE '%IF TG_OP = ''INSERT'' THEN%' THEN
        RAISE EXCEPTION 'congelar_visita_con_ot no trata el INSERT por separado: en un '
            'INSERT no existe OLD y las reglas de UPDATE no tienen sujeto.';
    END IF;

    -- las reglas I y J, en la rama de INSERT
    IF v_src NOT LIKE '%NEW.estado NOT IN (''PROYECTADO'', ''PROGRAMADO'')%' THEN
        RAISE EXCEPTION 'Falta la regla I: una visita podria nacer con un resultado, o en '
            'REPROGRAMADO o CANCELADO.';
    END IF;
    IF v_src NOT LIKE '%no puede nacer con fecha_ejecucion%' THEN
        RAISE EXCEPTION 'Falta la regla J: una visita podria nacer con fecha fisica.';
    END IF;

    -- las reglas F y G, en congelar_visita_con_ot
    IF v_src NOT LIKE '%es historica y no admite pasar a%'
    OR v_src NOT LIKE '%NEW.fecha_ejecucion IS DISTINCT FROM OLD.fecha_ejecucion%' THEN
        RAISE EXCEPTION 'Falta la regla F: fecha_ejecucion no queda inmutable tras el cierre.';
    END IF;
    -- se comprueba la SENTENCIA, no la palabra: buscar 'CURRENT_DATE' a secas daria un
    -- falso positivo con el propio comentario que explica por que no se usa.
    IF v_src NOT LIKE '%v_hoy := (now() AT TIME ZONE ''America/Lima'')::date%'
    OR v_src NOT LIKE '%IF NEW.fecha_ejecucion > v_hoy THEN%' THEN
        RAISE EXCEPTION 'Falta la regla G: la fecha futura no se compara contra la fecha de '
            'negocio de America/Lima.';
    END IF;

    -- la regla H, en su trigger propio
    SELECT p.prosrc INTO v_src_ciclo FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'validar_coherencia_ciclo_ot';
    IF v_src_ciclo IS NULL THEN
        RAISE EXCEPTION 'Falta validar_coherencia_ciclo_ot.';
    END IF;
    IF v_src_ciclo NOT LIKE '%NEW.ultima_quincena IS DISTINCT FROM v_quincena%'
    OR v_src_ciclo NOT LIKE '%NEW.ultima_fecha_real IS DISTINCT FROM v_fecha%'
    OR v_src_ciclo NOT LIKE '%NEW.orden_trabajo_detalle_id IS NULL%' THEN
        RAISE EXCEPTION 'La regla H no impone las tres invariantes del ciclo de OT.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND cl.relname = 'programa_mantenimiento_unidad_ciclos'
          AND t.tgname = 'trg_validar_coherencia_ciclo_ot') THEN
        RAISE EXCEPTION 'Falta trg_validar_coherencia_ciclo_ot sobre los ciclos.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validar_coherencia_ciclo_ot'
          AND 'search_path=pg_catalog, public' = ANY(p.proconfig)) THEN
        RAISE EXCEPTION 'validar_coherencia_ciclo_ot no fija su search_path.';
    END IF;

    -- la regla E, por sus dos vias
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.programacion_mantenimiento'::regclass
          AND conname = 'chk_programacion_fecha_ejecucion_resultado' AND convalidated) THEN
        RAISE EXCEPTION 'Falta el CHECK chk_programacion_fecha_ejecucion_resultado validado.';
    END IF;
    SELECT p.prosrc INTO v_src_cierre FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo';
    IF v_src_cierre NOT LIKE '%exige fecha_ejecucion%' THEN
        RAISE EXCEPTION 'Falta el mensaje explicito de fecha en cerrar_orden_trabajo.';
    END IF;
    -- y lo que 014 dejo en esa funcion NO se ha perdido al reemplazarla
    IF v_src_cierre NOT LIKE '%GET DIAGNOSTICS v_escritas = ROW_COUNT%'
    OR v_src_cierre NOT LIKE '%EXCLUDED.ultima_quincena > programa_mantenimiento_unidad_ciclos.ultima_quincena%'
    OR v_src_cierre NOT LIKE '%FOR UPDATE%'
    OR v_src_cierre NOT LIKE '%America/Lima%' THEN
        RAISE EXCEPTION 'El reemplazo de cerrar_orden_trabajo perdio algo de 013/014: '
            'ROW_COUNT, anti-retroceso, FOR UPDATE o la validacion de fecha futura.';
    END IF;
    IF pg_get_function_result((SELECT p.oid FROM pg_proc p JOIN pg_namespace n
        ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'cerrar_orden_trabajo'))
       <> 'TABLE(estado_programacion character varying, ciclos_afectados integer)' THEN
        RAISE EXCEPTION 'El tipo de retorno de cerrar_orden_trabajo cambio.';
    END IF;

    -- la funcion conserva su search_path fijo
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'congelar_visita_con_ot'
          AND 'search_path=pg_catalog, public' = ANY(p.proconfig)) THEN
        RAISE EXCEPTION 'congelar_visita_con_ot perdio su search_path fijo.';
    END IF;

    -- ni una funcion ni un trigger mas: 7 y 10, y uno solo sobre programacion_mantenimiento
    SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('validar_coherencia_detalle_ot',
        'impedir_modificar_ot_cerrada', 'impedir_modificar_detalle_ot_cerrada',
        'congelar_alcance_programado', 'congelar_visita_con_ot', 'validar_apertura_ot',
        'cerrar_orden_trabajo', 'validar_coherencia_ciclo_ot');
    SELECT count(*) INTO v_trg FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND c.relname IN ('ordenes_trabajo', 'ordenes_trabajo_detalle',
        'programacion_mantenimiento', 'programacion_mantenimiento_equipos',
        'programa_mantenimiento_unidad_ciclos');
    SELECT count(*) INTO v_trg_pm FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND c.relname = 'programacion_mantenimiento'
       AND p.proname = 'congelar_visita_con_ot';
    IF v_fn <> 8 OR v_trg <> 12 OR v_trg_pm <> 1 THEN
        RAISE EXCEPTION 'Esperaba 8 funciones, 12 triggers y 1 trigger de congelado, '
            'encontre %, % y %', v_fn, v_trg, v_trg_pm;
    END IF;

    -- ni una fila movida
    IF EXISTS (
        SELECT 1 FROM _015_antes a WHERE
            a.ciclos  <> (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos)
         OR a.anclas  <> (SELECT count(*) FROM programa_mantenimiento_unidad_anclas)
         OR a.prog    <> (SELECT count(*) FROM programacion_mantenimiento)
         OR a.prog_eq <> (SELECT count(*) FROM programacion_mantenimiento_equipos)
         OR a.ot      <> (SELECT count(*) FROM ordenes_trabajo)
         OR a.otd     <> (SELECT count(*) FROM ordenes_trabajo_detalle)) THEN
        RAISE EXCEPTION 'Esta migracion no debe tocar ni una fila, y algun conteo cambio.';
    END IF;
    SELECT ciclos, anclas INTO v_ciclos, v_anclas FROM _015_antes;

    -- los cleanup siguen sin ejecutarse
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'programacion_mantenimiento' AND column_name = 'fecha_programada') THEN
        RAISE EXCEPTION 'Esta migracion no debe retirar fecha_programada.';
    END IF;

    RAISE NOTICE 'Inmutabilidad del resultado aplicada: con una OT CERRADA el estado de la '
        'visita queda congelado, CANCELADO es terminal, los cuatro resultados solo nacen '
        'de cerrar_orden_trabajo() haya o no OT, con OT ABIERTA no hay cambio '
        'administrativo, una OT solo se cierra si la visita ya lleva resultado, un '
        'resultado ejecutado exige su dia fisico, la fecha fisica es historica tras el '
        'cierre y nunca futura -en INSERT y en UPDATE-, un ciclo de OT no puede divergir '
        'de su visita, y una visita solo nace en PROYECTADO o PROGRAMADO y sin dia fisico. '
        '3 funciones ampliadas, 1 funcion y 1 trigger nuevos, 1 CHECK, 0 tablas, '
        '0 columnas, 0 indices, 0 triggers nuevos, 0 DML. Sin cambios de datos: '
        'ciclos=%, anclas=%.', v_ciclos, v_anclas;
END $$;

DROP TABLE _015_antes;
