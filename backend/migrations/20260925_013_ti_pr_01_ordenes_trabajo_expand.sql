-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260925_013 · ORDENES DE TRABAJO
-- =====================================================================================
-- CLASIFICACION: EXPANSION. Crea 2 tablas, 1 columna nullable, amplia 2 CHECK.
--   0 DROP TABLE. 0 DROP COLUMN. 0 DELETE. 0 TRUNCATE.
--   Los 2 UPDATE de dominio son DROP+ADD de CHECK, no DML.
--   No toca los 688 ciclos ni las 1062 anclas: la columna nueva nace NULL y el valor
--   'EXCEL' sigue siendo valido.
--
-- Debe ejecutarse DESPUES de 20260924_012 y ANTES de los cleanup de pending_cleanup/.
--
-- -------------------------------------------------------------------------------------
-- PRINCIPIO OPERATIVO
-- -------------------------------------------------------------------------------------
-- Una programacion_mantenimiento es UNA visita de UNA unidad en UNA quincena, y genera
-- como maximo UNA OT activa.
--
--   programacion_mantenimiento  --1:1-->  ordenes_trabajo (activa)
--            |                                    |
--            N                                    N
--   programacion_mantenimiento_equipos  <--1:1--  ordenes_trabajo_detalle
--
-- La programacion es la fuente de verdad de LO PREVISTO. La OT registra LO REALIZADO.
-- Por eso ordenes_trabajo_detalle NO duplica tipo_equipo ni nivel_programado: los lee de
-- programacion_mantenimiento_equipos a traves de una FK compuesta. Asi es imposible que
-- la OT diga CAMARAS/M2 mientras lo programado diga CAMARAS/M3.
--
-- La elevacion del nivel regular (todas las familias aplicables de la unidad al mismo
-- nivel_regular) la resuelve el GENERADOR al crear la programacion. Este DDL no la
-- reimplementa: solo consume lo ya generado. Ver GENERADOR.md.
--
-- GPS y ADAS conservan su periodicidad anual propia. Si coinciden con una visita regular
-- entran como detalles adicionales de LA MISMA OT, sin elevar ni ser elevados.
--
-- -------------------------------------------------------------------------------------
-- POR QUE UN INDICE PARCIAL Y NO UNIQUE(programacion_id)
-- -------------------------------------------------------------------------------------
-- Un UNIQUE normal dejaria una programacion bloqueada para siempre si su OT se anula.
-- Con el indice parcial cabe como maximo UNA OT no anulada, y las anuladas se conservan
-- como historial permitiendo abrir una sustituta.
--
-- -------------------------------------------------------------------------------------
-- SUSTITUCION POR ERROR DE ALCANCE · LA PROGRAMACION VIEJA NO SE REUTILIZA
-- -------------------------------------------------------------------------------------
-- Como ordenes_trabajo_detalle NO duplica tipo_equipo ni nivel_programado -a proposito-,
-- corregir el alcance modificando programacion_mantenimiento_equipos reescribiria lo que
-- una OT ya declaro. Por eso el alcance de una visita con OT queda congelado para siempre.
--
-- Si hay que corregirlo, NO se toca la programacion antigua. El flujo es:
--
--   1. ANULAR la OT activa            estado = 'ANULADA', motivo_anulacion obligatorio
--   2. CANCELAR su programacion       estado = 'CANCELADO'
--   3. conservar ambas como historia  no se borra ni se reescribe nada
--   4. crear una programacion NUEVA   misma unidad y quincena si procede
--   5. generar sus equipos previstos  con las reglas vigentes del generador
--   6. abrir una OT nueva sobre ella
--
-- El slot de quincena se libera porque uq_programacion_unidad_quincena_efectiva excluye
-- 'CANCELADO', pero la programacion vieja permanece registrada y sigue mostrando
-- exactamente que estaba previsto cuando se abrio aquella OT.
--
-- Una OT CERRADA nunca habilita este mecanismo: su programacion no puede cancelarse ni
-- cambiar de alcance, porque describe una ejecucion real que movio ciclos.
--
-- Guardas que lo sostienen:
--   congelar_alcance_programado  el alcance referenciado por una OT es inmutable
--   congelar_visita_con_ot       unidad, quincena y cancelacion bloqueadas si hay OT no anulada
--   validar_apertura_ot          no se abre una OT sobre una programacion CANCELADA
--
-- -------------------------------------------------------------------------------------
-- QUE NO HACE ESTA MIGRACION
-- -------------------------------------------------------------------------------------
-- No inserta ninguna fila. No crea programaciones ni OTs. No implementa el endpoint de
-- apertura: la apertura debera crear un detalle por CADA programacion_mantenimiento_equipos
-- de la programacion, sin omitir ninguno, y el esquema esta preparado para exigirlo (la
-- guarda del cierre lo comprueba).
-- =====================================================================================

-- ------------------------------------------------------------- 1 · GUARDAS ESTRUCTURALES
-- Solo invariantes de estructura. Los conteos de esta carga (688 ciclos, 1062 anclas...)
-- NO estan aqui: pertenecen al snapshot de esta base, no al DDL.
DO $$
BEGIN
    IF to_regclass('public.ordenes_trabajo') IS NOT NULL
       OR to_regclass('public.ordenes_trabajo_detalle') IS NOT NULL THEN
        RAISE EXCEPTION 'Las tablas de ordenes de trabajo ya existen. Esta migracion no se reaplica.';
    END IF;

    IF to_regclass('public.programacion_mantenimiento') IS NULL
       OR to_regclass('public.programacion_mantenimiento_equipos') IS NULL
       OR to_regclass('public.programa_mantenimiento_unidad_ciclos') IS NULL
       OR to_regclass('public.personal') IS NULL
       OR to_regclass('public.usuarios') IS NULL THEN
        RAISE EXCEPTION 'Falta alguna tabla requerida: programacion_mantenimiento, '
            'programacion_mantenimiento_equipos, programa_mantenimiento_unidad_ciclos, '
            'personal o usuarios.';
    END IF;

    -- la clave que la FK compuesta del detalle necesita en la cabecera de programacion
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_programacion_id_programa' AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'programacion_mantenimiento no tiene UNIQUE (id, programa_id).';
    END IF;

    -- quincena_efectiva es la fase que usaran los ciclos; sin ella el cierre no puede operar
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'programacion_mantenimiento'
          AND column_name = 'quincena_efectiva'
    ) THEN
        RAISE EXCEPTION 'programacion_mantenimiento.quincena_efectiva no existe.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    ) THEN
        RAISE EXCEPTION 'No existe public.set_updated_at(). La crea 20260918_001; '
            'no se recrea aqui para no alterar su search_path.';
    END IF;
END $$;

-- ------------------------- 1-bis · RETIRAR EL UNIQUE LEGACY POR fecha_programada
-- uq_programacion_mantenimiento_unidad_fecha (programa_unidad_id, fecha_programada) ya no
-- expresa una regla vigente. La unicidad de una visita la gobierna
--   uq_programacion_unidad_quincena_efectiva (programa_unidad_id, quincena_efectiva)
--   WHERE estado <> 'CANCELADO'
-- que es la regla de negocio: una visita activa por unidad y quincena administrativa.
--
-- El legacy NO es parcial, asi que no excluye 'CANCELADO' y bloquea el flujo de
-- sustitucion: obligaria a que la programacion sustituta usara una fecha_programada
-- distinta solo para esquivarlo, cuando la razon por la que puede ocupar el slot debe ser
-- que la anterior esta CANCELADA.
--
-- Auditado en la base antes de escribir esto:
--   * contype='u' sobre (programa_unidad_id, fecha_programada);
--   * 0 claves foraneas lo referencian. La unica FK que entra a programacion_mantenimiento
--     es fk_programacion_equipo_visita, que apunta a uq_programacion_id_programa;
--   * 0 dependencias no internas de su indice de respaldo: ni vistas, ni reglas, ni triggers;
--   * 0 referencias en backend/src, app_flotas_web, initDb.js y los loaders;
--   * la tabla tiene 0 filas, asi que retirarlo no puede crear duplicados;
--   * idx_programacion_mantenimiento_fecha y ..._estado_fecha sobreviven, de modo que las
--     consultas por fecha_programada conservan indice.
--
-- NO se retiran las columnas fecha_programada ni fecha_reprogramada: eso es trabajo del
-- cleanup 900, que sigue sin ejecutar. fecha_programada continua siendo NOT NULL.
--
-- IF EXISTS para que la migracion sea idempotente y desplegable en una base donde ya no
-- estuviera; la verificacion final comprueba que al terminar no existe.
ALTER TABLE programacion_mantenimiento
    DROP CONSTRAINT IF EXISTS uq_programacion_mantenimiento_unidad_fecha;

-- --------------------------------- 2 · CLAVE QUE NECESITA LA FK COMPUESTA DEL DETALLE
-- programacion_mantenimiento_equipos tiene PK(id) y UNIQUE(programacion_id, tipo_equipo),
-- pero no UNIQUE(id, programacion_id). Sin ella, una FK de una sola columna permitiria que
-- un detalle de OT apuntara al equipo programado de OTRA programacion.
ALTER TABLE programacion_mantenimiento_equipos
    ADD CONSTRAINT uq_programacion_equipo_id_programacion UNIQUE (id, programacion_id);

-- -------------------------------------------------------------------- 3 · LA CABECERA
CREATE TABLE ordenes_trabajo (
    id               integer     GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    programacion_id  integer     NOT NULL,
    tecnico_id       integer     NULL,
    abierta_por_id   integer     NOT NULL,
    cerrada_por_id   integer     NULL,
    fecha_apertura   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre     timestamptz NULL,
    estado           varchar(10) NOT NULL DEFAULT 'ABIERTA',
    motivo_anulacion text        NULL,
    minutos          integer     NULL,
    evidencias       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    observaciones    text        NULL,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ordenes_trabajo IS
    'Orden de trabajo preventiva de TI. Una por visita (programacion_mantenimiento). '
    'Registra LO REALIZADO; lo previsto vive en programacion_mantenimiento_equipos.';
COMMENT ON COLUMN ordenes_trabajo.fecha_cierre IS
    'Sello administrativo de cuando se registro el cierre en el ERP. NO es la fecha '
    'fisica del trabajo: esa es programacion_mantenimiento.fecha_ejecucion, y es la que '
    'va a programa_mantenimiento_unidad_ciclos.ultima_fecha_real.';
COMMENT ON COLUMN ordenes_trabajo.tecnico_id IS
    'Ejecutor tecnico fisico -> personal(id). Distinto de abierta_por_id/cerrada_por_id, '
    'que son usuarios del ERP -> usuarios(id), igual que audit_logs.user_id.';

ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT fk_ot_programacion FOREIGN KEY (programacion_id)
        REFERENCES programacion_mantenimiento (id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT fk_ot_tecnico FOREIGN KEY (tecnico_id)
        REFERENCES personal (id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT fk_ot_abierta_por FOREIGN KEY (abierta_por_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT fk_ot_cerrada_por FOREIGN KEY (cerrada_por_id)
        REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT chk_ot_estado CHECK (estado IN ('ABIERTA', 'CERRADA', 'ANULADA'));
-- ABIERTA: sin cierre ni actor de cierre. CERRADA o ANULADA: ambos obligatorios.
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT chk_ot_cierre CHECK (
        (estado = 'ABIERTA' AND fecha_cierre IS NULL AND cerrada_por_id IS NULL)
     OR (estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL AND cerrada_por_id IS NOT NULL));
-- el motivo existe si y solo si esta anulada
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT chk_ot_anulacion CHECK ((motivo_anulacion IS NOT NULL) = (estado = 'ANULADA'));
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT chk_ot_minutos CHECK (minutos IS NULL OR minutos > 0);
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT chk_ot_evidencias CHECK (jsonb_typeof(evidencias) = 'array');
-- necesaria para la FK compuesta del detalle
ALTER TABLE ordenes_trabajo
    ADD CONSTRAINT uq_ot_id_programacion UNIQUE (id, programacion_id);

-- Como maximo UNA OT no anulada por programacion. Las anuladas quedan como historial y
-- permiten abrir una sustituta. Mismo patron que uq_programacion_unidad_quincena_efectiva.
CREATE UNIQUE INDEX uq_ot_programacion_activa
    ON ordenes_trabajo (programacion_id) WHERE estado <> 'ANULADA';
CREATE INDEX idx_ot_estado_apertura ON ordenes_trabajo (estado, fecha_apertura);

CREATE TRIGGER trg_set_updated_at_ordenes_trabajo
    BEFORE UPDATE ON ordenes_trabajo
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------- 4 · EL DETALLE
CREATE TABLE ordenes_trabajo_detalle (
    id                     integer     GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    orden_trabajo_id       integer     NOT NULL,
    programacion_id        integer     NOT NULL,
    programacion_equipo_id integer     NOT NULL,
    nivel_completado       varchar(2)  NULL,
    estado                 varchar(12) NOT NULL,
    observaciones          text        NULL,
    evidencias             jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ordenes_trabajo_detalle IS
    'Resultado por familia de una OT. NO duplica tipo_equipo ni nivel_programado: los lee '
    'de programacion_mantenimiento_equipos por FK compuesta, que es la unica fuente de '
    'verdad de lo previsto.';
COMMENT ON COLUMN ordenes_trabajo_detalle.programacion_id IS
    'Redundante a proposito: permite las dos FK compuestas que impiden que un detalle '
    'apunte al equipo programado de otra programacion. Su valor queda pinchado por ambas.';
COMMENT ON COLUMN ordenes_trabajo_detalle.nivel_completado IS
    'Nivel realmente alcanzado. NULL = nada completado. Nunca puede superar el '
    'nivel_mantenimiento previsto: lo verifica trg_validar_coherencia_detalle_ot.';

ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT fk_otd_orden FOREIGN KEY (orden_trabajo_id, programacion_id)
        REFERENCES ordenes_trabajo (id, programacion_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT fk_otd_programado FOREIGN KEY (programacion_equipo_id, programacion_id)
        REFERENCES programacion_mantenimiento_equipos (id, programacion_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT uq_otd_orden_programado UNIQUE (orden_trabajo_id, programacion_equipo_id);
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT chk_otd_nivel CHECK (
        nivel_completado IS NULL OR nivel_completado IN ('M1', 'M2', 'M3'));
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT chk_otd_estado CHECK (
        estado IN ('COMPLETADO', 'PARCIAL', 'PENDIENTE', 'NO_APLICA'));
-- Lo que SI cabe en un CHECK: presencia o ausencia de nivel_completado segun el estado.
-- La comparacion con el nivel previsto vive en otra tabla y va en el trigger.
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT chk_otd_presencia CHECK (
        (estado IN ('COMPLETADO', 'PARCIAL')  AND nivel_completado IS NOT NULL)
     OR (estado IN ('PENDIENTE', 'NO_APLICA') AND nivel_completado IS NULL));
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT chk_otd_evidencias CHECK (jsonb_typeof(evidencias) = 'array');
-- necesaria para la FK nullable desde ciclos
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT uq_otd_id UNIQUE (id);

CREATE INDEX idx_otd_orden ON ordenes_trabajo_detalle (orden_trabajo_id);
CREATE INDEX idx_otd_programado ON ordenes_trabajo_detalle (programacion_equipo_id);

CREATE TRIGGER trg_set_updated_at_ordenes_trabajo_detalle
    BEFORE UPDATE ON ordenes_trabajo_detalle
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------- 5 · TRAZABILIDAD DESDE LOS CICLOS
-- Nullable a proposito: los 688 ciclos historicos del Excel NO tienen OT y eso es
-- correcto. ON DELETE RESTRICT: un detalle que ya movio un ciclo no puede borrarse.
ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD COLUMN orden_trabajo_detalle_id integer NULL;

ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT fk_ciclo_orden_trabajo_detalle FOREIGN KEY (orden_trabajo_detalle_id)
        REFERENCES ordenes_trabajo_detalle (id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_ciclos_orden_trabajo_detalle
    ON programa_mantenimiento_unidad_ciclos (orden_trabajo_detalle_id)
    WHERE orden_trabajo_detalle_id IS NOT NULL;

COMMENT ON COLUMN programa_mantenimiento_unidad_ciclos.orden_trabajo_detalle_id IS
    'Detalle de OT que produjo el estado ACTUAL de esta referencia. NULL en los 688 '
    'ciclos historicos del Excel. Las filas de nivel inferior creadas por propagacion '
    'llevan el MISMO detalle que las cubrio: no son OTs ficticias.';

-- ------------------------------------------------------------- 6 · DOMINIO DE fuente
-- Se anade ORDENES_TRABAJO siguiendo la convencion existente: el nombre de la tabla de
-- origen en mayusculas, igual que INSPECCIONES_FLOTA y MANTENIMIENTOS_TECNICOS.
ALTER TABLE programa_mantenimiento_unidad_ciclos DROP CONSTRAINT chk_ciclo_fuente;
ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT chk_ciclo_fuente CHECK (fuente IN (
        'INSPECCIONES_FLOTA', 'MANTENIMIENTOS_TECNICOS', 'EXCEL', 'MANUAL', 'ORDENES_TRABAJO'));

-- Un ciclo con fuente ORDENES_TRABAJO debe citar su detalle, y al reves: el resto de
-- fuentes no puede inventarse uno.
ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT chk_ciclo_trazabilidad_ot CHECK (
        (fuente = 'ORDENES_TRABAJO') = (orden_trabajo_detalle_id IS NOT NULL));

-- --------------------------------------------------- 7 · DOMINIO DE estado DE LA VISITA
-- EJECUTADO_PARCIAL: se atendio parte de la visita. NO_APLICA: todos los detalles
-- resultaron NO_APLICA, por ejemplo porque el inventario cambio entre generar y ejecutar.
-- Ninguno de los dos cuenta como incumplimiento silencioso.
ALTER TABLE programacion_mantenimiento DROP CONSTRAINT chk_programacion_mantenimiento_estado;
ALTER TABLE programacion_mantenimiento
    ADD CONSTRAINT chk_programacion_mantenimiento_estado CHECK (estado IN (
        'PROYECTADO', 'PROGRAMADO', 'EJECUTADO', 'EJECUTADO_PARCIAL',
        'NO_EJECUTADO', 'NO_APLICA', 'REPROGRAMADO', 'CANCELADO'));

-- ------------------------------------------- 8 · COHERENCIA PROGRAMADO vs COMPLETADO
-- nivel_programado vive en programacion_mantenimiento_equipos, asi que un CHECK no puede
-- leerlo. Va en trigger, siguiendo el precedente de validar_cierre_ticket_unidad.
CREATE FUNCTION validar_coherencia_detalle_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_programado varchar(2);
    v_orden_p    integer;
    v_orden_c    integer;
BEGIN
    SELECT nivel_mantenimiento INTO v_programado
      FROM programacion_mantenimiento_equipos
     WHERE id = NEW.programacion_equipo_id;
    IF v_programado IS NULL THEN
        RAISE EXCEPTION 'El equipo programado % no existe.', NEW.programacion_equipo_id;
    END IF;

    v_orden_p := CASE v_programado WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 WHEN 'M3' THEN 3 END;
    v_orden_c := CASE NEW.nivel_completado WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 WHEN 'M3' THEN 3 END;

    IF NEW.nivel_completado IS NOT NULL AND v_orden_c > v_orden_p THEN
        RAISE EXCEPTION 'nivel_completado % supera el programado % (equipo programado %).',
            NEW.nivel_completado, v_programado, NEW.programacion_equipo_id;
    END IF;

    IF NEW.estado = 'COMPLETADO' AND NEW.nivel_completado <> v_programado THEN
        RAISE EXCEPTION 'COMPLETADO exige nivel_completado = programado (% vs %).',
            NEW.nivel_completado, v_programado;
    END IF;

    IF NEW.estado = 'PARCIAL' THEN
        IF v_orden_c >= v_orden_p THEN
            RAISE EXCEPTION 'PARCIAL exige nivel_completado menor que el programado (% vs %).',
                NEW.nivel_completado, v_programado;
        END IF;
        -- Solo alcanzable con nivel_completado NULL y programado M1: con un nivel no nulo
        -- la comprobacion anterior (completado >= programado) ya lo rechaza. Redundante
        -- con chk_otd_presencia, pero da un mensaje concreto en vez de un fallo de CHECK.
        IF v_programado = 'M1' THEN
            RAISE EXCEPTION 'PARCIAL es imposible con programado M1: no hay nivel inferior.';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_validar_coherencia_detalle_ot
    BEFORE INSERT OR UPDATE OF nivel_completado, estado, programacion_equipo_id
    ON ordenes_trabajo_detalle
    FOR EACH ROW EXECUTE FUNCTION validar_coherencia_detalle_ot();

-- ------------------------------------------------------------------ 9 · INMUTABILIDAD
-- Una OT CERRADA o ANULADA no se edita ni se borra. No se disena reapertura.
CREATE FUNCTION impedir_modificar_ot_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
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
    RETURN NEW;
END $$;

CREATE TRIGGER trg_impedir_modificar_ot_cerrada
    BEFORE UPDATE OR DELETE ON ordenes_trabajo
    FOR EACH ROW EXECUTE FUNCTION impedir_modificar_ot_cerrada();

CREATE FUNCTION impedir_modificar_detalle_ot_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_estado varchar(10);
    v_fila   ordenes_trabajo_detalle;
BEGIN
    v_fila := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    SELECT estado INTO v_estado FROM ordenes_trabajo WHERE id = v_fila.orden_trabajo_id;
    -- si la cabecera ya no existe, es un DELETE en cascada: se permite
    IF v_estado IS NOT NULL AND v_estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'La OT % esta %: sus detalles son inmutables.',
            v_fila.orden_trabajo_id, v_estado;
    END IF;
    RETURN v_fila;
END $$;

CREATE TRIGGER trg_impedir_modificar_detalle_ot_cerrada
    BEFORE UPDATE OR DELETE ON ordenes_trabajo_detalle
    FOR EACH ROW EXECUTE FUNCTION impedir_modificar_detalle_ot_cerrada();

-- ------------------------------------------- 9-bis · ALCANCE CONGELADO DE LA VISITA
-- Auditado antes de escribir esto: programacion_mantenimiento_equipos NO tenia ninguna
-- proteccion (1 solo trigger, el de updated_at; 0 rules) y el rol tiene UPDATE y DELETE.
--
-- Como ordenes_trabajo_detalle NO duplica tipo_equipo ni nivel_programado -a proposito, para
-- que lo programado tenga una sola fuente de verdad-, modificar esas columnas despues de
-- cerrar una OT reescribiria en silencio lo que esa OT declaro haber ejecutado. Un informe
-- historico diria manana algo distinto de lo que estaba programado cuando se ejecuto.
--
-- Dos reglas:
--   a) una fila ya referenciada por CUALQUIER detalle de OT es inmutable en sus campos de
--      negocio y no puede borrarse. El DELETE ya lo cubre fk_otd_programado con ON DELETE
--      RESTRICT; el UPDATE no lo cubre ninguna FK, porque la FK es sobre (id, programacion_id);
--   b) mientras exista una OT ABIERTA para la programacion, el alcance esta CONGELADO: no se
--      insertan, ni se borran, ni se modifican equipos previstos. Si no, el universo que la
--      OT debe cerrar cambiaria despues de haberla abierto.
--
-- updated_at no se compara: lo gestiona el trigger estandar y cambiarlo no altera el alcance.
CREATE FUNCTION congelar_alcance_programado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_programacion integer;
    v_abiertas     integer;
    v_referencias  integer;
BEGIN
    v_programacion := CASE TG_OP WHEN 'DELETE' THEN OLD.programacion_id ELSE NEW.programacion_id END;

    SELECT count(*) INTO v_abiertas FROM ordenes_trabajo
     WHERE programacion_id = v_programacion AND estado = 'ABIERTA';
    IF v_abiertas > 0 THEN
        RAISE EXCEPTION 'La programacion % tiene una OT ABIERTA: el alcance de la visita esta '
            'congelado y no admite % de equipos previstos. Anula la OT si hay que cambiarlo.',
            v_programacion, TG_OP;
    END IF;

    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

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

CREATE TRIGGER trg_congelar_alcance_programado
    BEFORE INSERT OR UPDATE OR DELETE ON programacion_mantenimiento_equipos
    FOR EACH ROW EXECUTE FUNCTION congelar_alcance_programado();

-- ------------------------------------------ 9-ter · UNIDAD Y QUINCENA CONGELADAS
-- La OT corresponde a UNA visita concreta. Si se abriera una OT para la quincena X y luego
-- alguien reprogramara a Y, esa misma OT acabaria cerrandose como si siempre hubiera sido Y.
--
-- Se congelan SOLO las columnas de alcance temporal y de unidad. fecha_ejecucion, estado y
-- observaciones siguen siendo escribibles: son precisamente lo que el cierre actualiza.
--
-- Condicion: existe una OT NO ANULADA (ABIERTA o CERRADA). Antes de abrir OT, y tras
-- anularla, reprogramar sigue siendo posible.
CREATE FUNCTION congelar_visita_con_ot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_ots integer;
BEGIN
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

    RETURN NEW;
END $$;

CREATE TRIGGER trg_congelar_visita_con_ot
    BEFORE UPDATE ON programacion_mantenimiento
    FOR EACH ROW EXECUTE FUNCTION congelar_visita_con_ot();

-- No se abre una OT sobre una visita cancelada. Sin esta guarda quedaria un hueco: tras
-- anular OT1 y cancelar P1, el indice parcial uq_ot_programacion_activa considera el slot
-- libre -OT1 esta ANULADA- y admitiria una OT2 sobre la propia P1 cancelada, saltandose el
-- mecanismo de sustitucion, que exige una programacion NUEVA.
CREATE FUNCTION validar_apertura_ot()
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
    IF v_estado = 'CANCELADO' THEN
        RAISE EXCEPTION 'La programacion % esta CANCELADA: no admite abrir una OT. '
            'La sustitucion exige crear una programacion nueva.', NEW.programacion_id;
    END IF;
    IF NEW.estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'Una OT nace ABIERTA; se recibio %.', NEW.estado;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_validar_apertura_ot
    BEFORE INSERT ON ordenes_trabajo
    FOR EACH ROW EXECUTE FUNCTION validar_apertura_ot();

-- ------------------------------------------------------- 10 · CIERRE TRANSACCIONAL
-- Todo en una sola transaccion: o queda la OT cerrada Y los ciclos movidos, o nada.
--
-- Idempotencia por construccion: el cierre escribe una quincena ABSOLUTA
-- (quincena_efectiva), nunca "anterior + frecuencia". Reproducirlo escribe el mismo
-- valor. Un cierre que incrementara seria el diseno peligroso.
CREATE FUNCTION cerrar_orden_trabajo(
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
            v_ciclos := v_ciclos + 1;
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
    'escribe quincenas absolutas y nunca incrementos.';

-- ------------------------------------------------------------- 11 · VERIFICACION FINAL
DO $$
DECLARE
    v_cols_ot   integer;
    v_cols_otd  integer;
    v_idx_parc  integer;
    v_fn        integer;
    v_trg       integer;
    v_filas     integer;
    v_fuentes   integer;
    v_estados   integer;
    v_ciclos_ot integer;
BEGIN
    SELECT count(*) INTO v_cols_ot FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo';
    SELECT count(*) INTO v_cols_otd FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_detalle';
    IF v_cols_ot <> 14 OR v_cols_otd <> 10 THEN
        RAISE EXCEPTION 'Esperaba 14 y 10 columnas, encontre % y %', v_cols_ot, v_cols_otd;
    END IF;

    SELECT count(*) INTO v_idx_parc FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_ot_programacion_activa'
       AND indexdef LIKE '%WHERE%ANULADA%';
    IF v_idx_parc <> 1 THEN
        RAISE EXCEPTION 'Falta el indice unico parcial de OT activa.';
    END IF;

    SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('validar_coherencia_detalle_ot',
        'impedir_modificar_ot_cerrada', 'impedir_modificar_detalle_ot_cerrada',
        'congelar_alcance_programado', 'congelar_visita_con_ot', 'validar_apertura_ot',
        'cerrar_orden_trabajo');
    IF v_fn <> 7 THEN
        RAISE EXCEPTION 'Esperaba 7 funciones nuevas, encontre %', v_fn;
    END IF;

    SELECT count(*) INTO v_trg FROM pg_trigger
     WHERE NOT tgisinternal AND tgname IN ('trg_validar_coherencia_detalle_ot',
        'trg_impedir_modificar_ot_cerrada', 'trg_impedir_modificar_detalle_ot_cerrada',
        'trg_congelar_alcance_programado', 'trg_congelar_visita_con_ot',
        'trg_validar_apertura_ot',
        'trg_set_updated_at_ordenes_trabajo', 'trg_set_updated_at_ordenes_trabajo_detalle');
    IF v_trg <> 8 THEN
        RAISE EXCEPTION 'Esperaba 8 triggers nuevos, encontre %', v_trg;
    END IF;

    -- las dos tablas nacen vacias
    SELECT (SELECT count(*) FROM ordenes_trabajo) + (SELECT count(*) FROM ordenes_trabajo_detalle)
      INTO v_filas;
    IF v_filas <> 0 THEN
        RAISE EXCEPTION 'Las tablas de OT deberian nacer vacias, tienen % filas', v_filas;
    END IF;

    -- dominios ampliados
    SELECT count(*) INTO v_fuentes FROM pg_constraint
     WHERE conname = 'chk_ciclo_fuente' AND pg_get_constraintdef(oid) LIKE '%ORDENES_TRABAJO%';
    SELECT count(*) INTO v_estados FROM pg_constraint
     WHERE conname = 'chk_programacion_mantenimiento_estado'
       AND pg_get_constraintdef(oid) LIKE '%EJECUTADO_PARCIAL%'
       AND pg_get_constraintdef(oid) LIKE '%NO_APLICA%';
    IF v_fuentes <> 1 OR v_estados <> 1 THEN
        RAISE EXCEPTION 'Dominios no ampliados: fuente=% estado=%', v_fuentes, v_estados;
    END IF;

    -- el unique legacy por fecha_programada ya no existe, y la proteccion por quincena si
    IF EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_programacion_mantenimiento_unidad_fecha') THEN
        RAISE EXCEPTION 'uq_programacion_mantenimiento_unidad_fecha sigue existiendo.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND indexname = 'uq_programacion_unidad_quincena_efectiva') THEN
        RAISE EXCEPTION 'Falta uq_programacion_unidad_quincena_efectiva: sin ella no queda '
            'ninguna proteccion de unicidad de visita.';
    END IF;
    -- las columnas legacy NO se tocan: eso es trabajo del cleanup 900
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'programacion_mantenimiento' AND column_name = 'fecha_programada')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'programacion_mantenimiento' AND column_name = 'fecha_reprogramada') THEN
        RAISE EXCEPTION 'Esta migracion no debe retirar fecha_programada ni fecha_reprogramada.';
    END IF;

    -- ningun ciclo existente quedo con trazabilidad de OT
    SELECT count(*) INTO v_ciclos_ot FROM programa_mantenimiento_unidad_ciclos
     WHERE orden_trabajo_detalle_id IS NOT NULL OR fuente = 'ORDENES_TRABAJO';
    IF v_ciclos_ot <> 0 THEN
        RAISE EXCEPTION 'Esperaba 0 ciclos con OT, encontre %', v_ciclos_ot;
    END IF;

    RAISE NOTICE 'Ordenes de trabajo creadas: 2 tablas (14 y 10 columnas), 1 indice parcial, '
        '7 funciones, 8 triggers, unique legacy por fecha retirado, dominios ampliados, '
        'columna de trazabilidad nullable. Tablas vacias, 0 ciclos con OT.';
END $$;
