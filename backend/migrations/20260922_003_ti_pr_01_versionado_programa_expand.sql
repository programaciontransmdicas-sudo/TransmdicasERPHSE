-- ============================================================
-- TI-PR-01  FASE V-A
-- EXPANSION DE VERSIONADO CON CONTRACCION CONTROLADA DE
-- CONSTRAINTS LEGACY
--
-- Corrige el modelo de versionado: TI-PR-01 es UN SOLO PROGRAMA
-- permanente y sus revisiones SIG (V01, V02, ...) son filas de una
-- tabla de versiones, no programas nuevos.
--
-- CLASIFICACION DEL ARCHIVO
--   No es una migracion 100% aditiva. Ademas de crear estructura,
--   retira CUATRO restricciones legacy cuyo sustituto se crea en
--   este mismo archivo, ANTES de retirarlas (apartados 7 y 9).
--   Recuento exacto:
--       4 DROP CONSTRAINT
--       1 SET NOT NULL   (solo frecuencias.version_id, apartado 4)
--       0 DROP COLUMN
--       0 DROP TABLE
--       0 RENAME de objetos de base de datos
--       0 DML  (INSERT / UPDATE / DELETE / TRUNCATE)
--   * NO toca inspecciones_flota ni mantenimientos_tecnicos.
--   * NO toca vehiculos ni personal.
--
-- POR QUE HAY CONTRACCION AQUI Y NO EN EL CLEANUP
--   La clave legacy uq_frecuencia_programa_equipo_nivel
--       UNIQUE (programa_id, tipo_equipo, nivel_mantenimiento)
--   hace IMPOSIBLE el objetivo central de esta migracion: como V01 y
--   V02 pertenecen al mismo programa, la tupla (programa, DVR, M2)
--   se repetiria y esa clave la rechaza (23505). Verificado en
--   prueba transaccional. Dejarla viva hasta la FASE V-G significaria
--   que el versionado por frecuencias no funciona hasta despues de
--   una limpieza destructiva.
--   Retirarla exige retirar antes las dos FK que dependen de ella
--   (2BP01 en caso contrario). Las tres se retiran en el apartado 9.
--
-- PRECONDICION VERIFICADA al escribir este archivo:
--   programas_mantenimiento              0 filas
--   programa_mantenimiento_frecuencias   0 filas
--   programa_mantenimiento_unidades      0 filas
--   programa_mantenimiento_unidad_ciclos 0 filas
--   programacion_mantenimiento           0 filas
--   programacion_mantenimiento_equipos   0 filas
-- Gracias a eso, todas las restricciones nacen VALIDADAS: no hace
-- falta NOT VALID ni una fase posterior de convalidacion.
-- Si alguna tabla tuviera filas, DETENERSE y revisar este archivo.
--
-- DECISIONES DE NEGOCIO QUE IMPLEMENTA (confirmadas):
--   1. btree_gist SI: el solapamiento de vigencias se impide con
--      una restriccion EXCLUDE, no con disciplina de aplicacion.
--   2. Vigencia como intervalo SEMIABIERTO [desde, hasta):
--      vigencia_hasta de una version es EXACTAMENTE vigencia_desde
--      de la siguiente. No hay dia frontera compartido ni huerfano.
--      Ambos extremos anclados a dia 1 o 16.
--   3. Estado PROYECTADO SI, y participa en el indice unico por
--      quincena efectiva (ver apartado 7).
--   4. periodo_inicio / periodo_fin viven en la VERSION, son
--      NULLABLE y son SOLO ventana documental de planificacion:
--      NO gobiernan ciclos ni vigencia.
--   5. Una version es OPERATIVAMENTE APLICABLE solo si su estado es
--      VIGENTE o SUPERSEDIDA y ademas cubre la fecha consultada.
--   6. Una version que ya tuvo ejecuciones NO se ANULA: queda
--      SUPERSEDIDA, para no romper la trazabilidad de lo ejecutado.
--      Esta regla es de proceso; se comprueba en el archivo de
--      validacion, no con un constraint.
--
-- CONSULTA CANONICA "version aplicable en una fecha":
--
--     SELECT v.*
--     FROM programas_mantenimiento_versiones v
--     WHERE v.programa_id = $1
--       AND v.estado IN ('VIGENTE','SUPERSEDIDA')
--       AND v.vigencia_desde <= $2
--       AND (v.vigencia_hasta IS NULL OR v.vigencia_hasta > $2);
--
--   Notese el > y no >= en vigencia_hasta: es la consecuencia
--   directa del intervalo semiabierto. La restriccion EXCLUDE
--   garantiza que esta consulta devuelve como mucho UNA fila.
--
-- QUE NO HACE ESTE ARCHIVO (queda para la FASE V-G, cleanup):
--   retirar programas_mantenimiento.version, .fecha_documento,
--   .periodo_inicio, .periodo_fin;
--   retirar frecuencias.programa_id y su FK compuesta temporal;
--   retirar uq_programas_mantenimiento_codigo_periodo_version;
--   poner NOT NULL version_programa_id en programacion_mantenimiento
--     y en programacion_mantenimiento_equipos, tras el backfill.
--     (frecuencias.version_id ya nace NOT NULL en el apartado 4.)
-- ============================================================


-- ------------------------------------------------------------
-- 1. EXTENSION btree_gist
--    Necesaria para que un EXCLUDE pueda combinar la igualdad de
--    un integer (programa_id) con el solapamiento de un daterange
--    dentro del mismo indice GiST.
--    Es una extension "trusted" desde PostgreSQL 13: no requiere
--    superusuario. Disponible en esta base en la version 1.8.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ------------------------------------------------------------
-- 2. TABLA DE VERSIONES
--    Responsabilidad unica: las revisiones documentales del mismo
--    programa. No contiene unidades, ni ciclos, ni programacion.
-- ------------------------------------------------------------
CREATE TABLE programas_mantenimiento_versiones (
    id               integer      GENERATED BY DEFAULT AS IDENTITY,
    programa_id      integer      NOT NULL,
    version          varchar(20)  NOT NULL,
    fecha_documento  date         NOT NULL,
    vigencia_desde   date         NOT NULL,
    vigencia_hasta   date         NULL,
    periodo_inicio   date         NULL,
    periodo_fin      date         NULL,
    estado           varchar(20)  NOT NULL DEFAULT 'BORRADOR',
    observaciones    text         NULL,
    created_at       timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT programas_mantenimiento_versiones_pkey PRIMARY KEY (id),

    CONSTRAINT fk_version_programa
        FOREIGN KEY (programa_id)
        REFERENCES programas_mantenimiento (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    -- Una sola V01 por programa, incluso mientras es borrador.
    CONSTRAINT uq_version_programa_version
        UNIQUE (programa_id, version),

    -- Objetivo de las FK compuestas que arrastran programa_id.
    -- Mismo patron que uq_programa_unidad_id_programa de la FASE A:
    -- permite exigir declarativamente que la version referida por
    -- una programacion pertenezca al MISMO programa que la visita.
    CONSTRAINT uq_version_id_programa
        UNIQUE (id, programa_id),

    CONSTRAINT chk_version_estado
        CHECK (estado IN ('BORRADOR','VIGENTE','SUPERSEDIDA','ANULADA')),

    -- Intervalo semiabierto: hasta es exclusivo, por eso > y no >=.
    CONSTRAINT chk_version_vigencia
        CHECK (vigencia_hasta IS NULL OR vigencia_hasta > vigencia_desde),

    -- El modelo entero razona en quincenas ancladas a dia 1 y 16.
    -- Una version que entrara en vigor el dia 7 partiria una
    -- quincena en dos, y "la version vigente para la quincena X"
    -- dejaria de tener respuesta unica.
    CONSTRAINT chk_version_vigencia_quincena
        CHECK (
            EXTRACT(day FROM vigencia_desde) IN (1, 16)
            AND (vigencia_hasta IS NULL
                 OR EXTRACT(day FROM vigencia_hasta) IN (1, 16))
        ),

    -- Ventana documental: o estan las dos fechas o ninguna.
    -- NO participa en ningun calculo de ciclo ni de vigencia.
    CONSTRAINT chk_version_periodo
        CHECK (
            (periodo_inicio IS NULL) = (periodo_fin IS NULL)
            AND (periodo_inicio IS NULL OR periodo_fin >= periodo_inicio)
        ),

    -- IMPOSIBILIDAD DE SOLAPAMIENTO.
    --   El filtro por estado es deliberado: sin el, no se podria
    --   registrar V02 como BORRADOR con vigencia futura mientras
    --   V01 sigue con vigencia_hasta NULL, porque un rango sin
    --   limite superior solapa con cualquier rango posterior.
    --   Con el filtro, la aprobacion de V02 es una transaccion:
    --     UPDATE ... SET vigencia_hasta = X, estado = 'SUPERSEDIDA'
    --     UPDATE ... SET estado = 'VIGENTE'
    --   y el constraint valida el estado final, no los intermedios.
    --
    --   Ademas hace innecesario un indice unico parcial del tipo
    --   "solo una version abierta por programa": dos rangos sin
    --   limite superior del mismo programa siempre solapan.
    CONSTRAINT exc_version_vigencia_sin_solape
        EXCLUDE USING gist (
            programa_id WITH =,
            (daterange(vigencia_desde, vigencia_hasta, '[)')) WITH &&
        )
        WHERE (estado IN ('VIGENTE','SUPERSEDIDA'))
);

CREATE TRIGGER trg_set_updated_at_programas_mantenimiento_versiones
    BEFORE UPDATE ON programas_mantenimiento_versiones
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- El EXCLUDE crea su propio indice GiST, util para el solapamiento
-- pero no para la busqueda ordenada por fecha. Este btree sirve a la
-- consulta canonica de "version aplicable".
CREATE INDEX idx_versiones_programa_vigencia
    ON programas_mantenimiento_versiones (programa_id, vigencia_desde DESC);


-- ------------------------------------------------------------
-- 3. UN SOLO TI-PR-01
--
--    Esta es la correccion central del modelo.
--
--    La clave natural vigente hasta ahora es:
--      uq_programas_mantenimiento_codigo_periodo_version
--          UNIQUE (codigo, periodo_inicio, version)
--    que NO impide varias filas de TI-PR-01: las autoriza, una por
--    version y periodo. Es decir, el modelo actual expresa justo lo
--    contrario al principio de negocio: hoy V02 seria un programa
--    distinto, con su propio id, y por tanto con sus propias
--    unidades, ciclos y programacion.
--
--    Se anade la clave correcta ahora, mientras la tabla esta vacia.
--    La antigua se retira en la FASE V-G, cuando el backend ya no
--    dependa de sus columnas.
-- ------------------------------------------------------------
ALTER TABLE programas_mantenimiento
    ADD CONSTRAINT uq_programas_mantenimiento_codigo UNIQUE (codigo);


-- ------------------------------------------------------------
-- 4. LAS FRECUENCIAS PASAN A DEPENDER DE LA VERSION
--
--    version_id nace NULLABLE para que esta migracion estructural
--    pueda ejecutarse ANTES de que exista V01. Pasa a NOT NULL en
--    la FASE V-G, cuando programa_id se retire.
--
--    INTEGRIDAD TEMPORAL programa_id + version_id
--
--    Durante la convivencia la tabla lleva las DOS columnas. Con una
--    FK simple version_id -> versiones(id) la base permitiria esto:
--        programa_id = programa A
--        version_id  = una version del programa B
--    Comprobado en prueba transaccional: el INSERT cruzado FUE
--    ACEPTADO. El hueco es real y no depende de que nuestro INSERT
--    sea correcto.
--
--    Por eso la FK de esta etapa es COMPUESTA y apunta a la clave
--    uq_version_id_programa (id, programa_id) creada en el apartado 2:
--    obliga a que frecuencia.programa_id = version.programa_id.
--    Verificado: el INSERT cruzado pasa a rechazarse con 23503.
--
--    La cadena queda aciclica: frecuencias -> versiones -> programas.
--    Comprobado sobre todo el esquema: 0 ciclos de FK.
--
--    RETIRADA: esta FK compuesta desaparece en la FASE V-G junto con
--    frecuencias.programa_id. El orden alli es:
--        1) DROP CONSTRAINT fk_frecuencia_version_programa
--        2) DROP COLUMN programa_id
--        3) ADD CONSTRAINT fk_frecuencia_version
--               FOREIGN KEY (version_id) -> versiones(id)
--    El paso 3 es obligatorio: sin el, la contraccion dejaria
--    version_id sin ninguna FK.
--
--    POR QUE version_id NACE NOT NULL
--
--    Una frecuencia sin version no significa nada en el modelo
--    nuevo. Dejarla nullable "durante la expansion" abria dos
--    huecos, ambos comprobados en prueba transaccional:
--      a) con version_id NULL la FK compuesta NO se evalua
--         (MATCH SIMPLE), de modo que la coherencia
--         programa <-> version quedaba sin verificar. Solo
--         programa_id seguia validado, por fk_frecuencia_programa.
--      b) uq_frecuencia_version_equipo_nivel admitia VARIAS filas
--         con version_id NULL y el mismo equipo/nivel, porque
--         UNIQUE trata cada NULL como distinto. Medido: 3 filas
--         coexistiendo.
--
--    El SET NOT NULL va inmediatamente despues del ADD COLUMN y
--    ANTES de la FK y del UNIQUE: asi no existe ni un instante, ni
--    siquiera dentro de la transaccion, en que la columna admita
--    NULL mientras hay restricciones que dependen de ella.
--
--    Es gratis porque la tabla tiene 0 filas, y no bloquea nada: la
--    FASE V-B crea el programa y la version ANTES que las
--    frecuencias, que es el orden correcto de todos modos.
--
--    ATENCION: este NOT NULL aplica SOLO aqui. Las columnas
--    programacion_mantenimiento.version_programa_id y
--    programacion_mantenimiento_equipos.version_programa_id siguen
--    NULLABLE a proposito hasta la FASE V-G: necesitan adaptacion
--    de backend y backfill antes de poder exigirse.
-- ------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    ADD COLUMN version_id integer;

ALTER TABLE programa_mantenimiento_frecuencias
    ALTER COLUMN version_id SET NOT NULL;

ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT fk_frecuencia_version_programa
        FOREIGN KEY (version_id, programa_id)
        REFERENCES programas_mantenimiento_versiones (id, programa_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;

-- Clave funcional nueva. Convive con uq_frecuencia_programa_equipo_nivel
-- hasta la FASE V-G. Mientras version_id sea NULL no restringe nada,
-- porque UNIQUE trata cada NULL como distinto.
ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT uq_frecuencia_version_equipo_nivel
        UNIQUE (version_id, tipo_equipo, nivel_mantenimiento);


-- ------------------------------------------------------------
-- 5. LOS CICLOS RECUPERAN SU VALIDACION DE DOMINIO
--
--    Los ciclos NO dependen de la version: representan continuidad
--    de unidad + equipo + nivel dentro del mismo programa, y deben
--    sobrevivir intactos a la entrada de V02.
--
--    Por eso la FASE V-G retirara fk_ciclo_frecuencia, que hoy
--    apunta a frecuencias(programa_id, tipo_equipo, nivel): si se
--    mantuviera contra la tabla ya versionada, obligaria a cada
--    ciclo a nombrar una version.
--
--    Esa FK era, ademas, lo que garantizaba el dominio de
--    tipo_equipo y nivel_mantenimiento y la regla GPS-solo-M3. Por
--    eso en la FASE A se acordo NO duplicarlos como CHECK.
--    Al desaparecer la FK, la justificacion desaparece con ella:
--    sin estos tres CHECK la tabla aceptaria tipo_equipo='FOO' o un
--    GPS M1. Se restituyen aqui, ANTES de retirar la FK.
--
--    Lo que estos CHECK NO restituyen: la FK tambien exigia que la
--    combinacion estuviera declarada por el programa. Ahora solo se
--    exige que pertenezca al dominio del negocio. Es deliberado: un
--    ciclo debe sobrevivir a una version que deje de programar su
--    nivel.
--
--    Nacen VALIDADOS (sin NOT VALID) porque la tabla esta vacia.
-- ------------------------------------------------------------
ALTER TABLE programa_mantenimiento_unidad_ciclos
    ADD CONSTRAINT chk_ciclo_tipo_equipo
        CHECK (tipo_equipo IN ('DVR','COPILOTO','RADIO_BASE','CAMARAS','GPS')),
    ADD CONSTRAINT chk_ciclo_nivel
        CHECK (nivel_mantenimiento IN ('M1','M2','M3')),
    ADD CONSTRAINT chk_ciclo_gps_solo_m3
        CHECK (tipo_equipo <> 'GPS' OR nivel_mantenimiento = 'M3');


-- ------------------------------------------------------------
-- 6. LA PROGRAMACION RECUERDA CON QUE VERSION FUE CALCULADA
--
--    version_programa_id nace NULLABLE por dos razones:
--      a) no puede calcularse en el mismo ALTER que lo crea:
--         depende de una consulta a versiones, que aun no tiene
--         filas cuando corre esta migracion;
--      b) esta migracion estructural debe poder ejecutarse antes de
--         que V01 exista, sin mezclar estructura y datos.
--    Pasa a NOT NULL en la FASE V-G.
--
--    SEMANTICA, confirmada: la version aplicada es la vigente para
--    la QUINCENA EFECTIVA de la programacion, no la vigente el dia
--    en que se creo el registro. Consecuencia que hay que tener
--    presente: mientras la visita esta pendiente el valor es
--    MUTABLE (una reprogramacion que cruce el limite de vigencia lo
--    cambia). Solo queda congelado cuando estado = 'EJECUTADO'.
--    Ningun constraint impone esa congelacion: es responsabilidad
--    del service, y se comprueba en el archivo de validacion.
-- ------------------------------------------------------------
ALTER TABLE programacion_mantenimiento
    ADD COLUMN version_programa_id integer;

-- Objetivo de FK para el detalle por equipo del apartado 8.
ALTER TABLE programacion_mantenimiento
    ADD CONSTRAINT uq_programacion_id_version
        UNIQUE (id, version_programa_id);

-- Garantiza que la version aplicada pertenece AL MISMO PROGRAMA que
-- la visita. Junto con fk_programacion_unidad_programa, que ancla la
-- unidad al mismo programa_id, cierra la cadena:
--     unidad.programa = visita.programa = version.programa
-- MATCH SIMPLE: mientras version_programa_id o programa_id sean
-- NULL la FK no se exige, que es lo que necesita la expansion.
ALTER TABLE programacion_mantenimiento
    ADD CONSTRAINT fk_programacion_version
        FOREIGN KEY (version_programa_id, programa_id)
        REFERENCES programas_mantenimiento_versiones (id, programa_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;


-- ------------------------------------------------------------
-- 7. ESTADO 'PROYECTADO'
--
--    *** UNICA SENTENCIA NO ADITIVA DE ESTE ARCHIVO ***
--
--    Es un DROP CONSTRAINT seguido de un ADD CONSTRAINT sobre el
--    mismo CHECK. No se pierde ningun dato ni ninguna columna, y la
--    tabla tiene 0 filas, por lo que el nuevo CHECK se valida
--    instantaneamente. Con datos en produccion habria que hacerlo
--    con NOT VALID + VALIDATE en dos fases.
--
--    POR QUE HACE FALTA: sin este estado, una proyeccion calculada
--    automaticamente y una visita ya confirmada con la operacion
--    son la misma fila (estado='PROGRAMADO'), y la regla "al entrar
--    una version nueva se recalculan solo las proyecciones" queda
--    inexpresable en SQL: degeneraria en "recalcula lo que este en
--    el futuro", que pisaria compromisos ya confirmados.
--
--    EL INDICE PARCIAL NO SE TOCA. uq_programacion_unidad_quincena_efectiva
--    filtra por WHERE estado <> 'CANCELADO', asi que 'PROYECTADO'
--    entra automaticamente en la unicidad por quincena efectiva,
--    como se decidio. Promover una proyeccion a confirmada es un
--    UPDATE de estado, no un INSERT, de modo que no hay colision.
--
--    El DEFAULT de estado se mantiene en 'PROGRAMADO' y no se
--    cambia aqui: alterarlo afectaria al backend congelado. Si el
--    generador debe crear proyecciones por defecto, es una decision
--    aparte.
-- ------------------------------------------------------------
ALTER TABLE programacion_mantenimiento
    DROP CONSTRAINT chk_programacion_mantenimiento_estado;

ALTER TABLE programacion_mantenimiento
    ADD CONSTRAINT chk_programacion_mantenimiento_estado
        CHECK (estado IN ('PROYECTADO','PROGRAMADO','EJECUTADO',
                          'NO_EJECUTADO','REPROGRAMADO','CANCELADO'));


-- ------------------------------------------------------------
-- 8. EL DETALLE POR EQUIPO USA LA FRECUENCIA DE ESA VERSION
--
--    Cierra la cadena declarativa completa:
--      fk_programacion_equipo_visita_version
--          el detalle usa la MISMA version que su visita
--      fk_programacion_equipo_frecuencia_version
--          esa combinacion equipo+nivel esta declarada EN esa version
--      (y la version pertenece al programa de la visita, por el
--       apartado 6)
--
--    La FK antigua fk_programacion_equipo_frecuencia, que apunta a
--    frecuencias(programa_id, tipo_equipo, nivel), sigue activa
--    durante la convivencia y se retira en la FASE V-G.
-- ------------------------------------------------------------
ALTER TABLE programacion_mantenimiento_equipos
    ADD COLUMN version_programa_id integer;

ALTER TABLE programacion_mantenimiento_equipos
    ADD CONSTRAINT fk_programacion_equipo_visita_version
        FOREIGN KEY (programacion_id, version_programa_id)
        REFERENCES programacion_mantenimiento (id, version_programa_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;

ALTER TABLE programacion_mantenimiento_equipos
    ADD CONSTRAINT fk_programacion_equipo_frecuencia_version
        FOREIGN KEY (version_programa_id, tipo_equipo, nivel_mantenimiento)
        REFERENCES programa_mantenimiento_frecuencias (version_id, tipo_equipo, nivel_mantenimiento)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;


-- ------------------------------------------------------------
-- 9. CONTRACCION CONTROLADA DE LAS RESTRICCIONES LEGACY
--
--    *** LAS TRES SENTENCIAS RESTANTES NO ADITIVAS ***
--
--    Ninguna elimina datos ni columnas. Cada una retira una garantia
--    legacy cuyo SUSTITUTO YA FUE CREADO mas arriba en este mismo
--    archivo. El orden es obligatorio y esta razonado:
--
--      9.a  fk_ciclo_frecuencia
--           sustituto: chk_ciclo_tipo_equipo + chk_ciclo_nivel +
--                      chk_ciclo_gps_solo_m3      (apartado 5)
--           Debe irse: apunta a frecuencias(programa_id, ...), de
--           modo que ataria cada ciclo a una version, justo lo que
--           el modelo prohibe. Lo que garantizaba -dominio de equipo
--           y nivel, y GPS solo M3- lo cubren los tres CHECK.
--           Lo unico que NO se conserva es la exigencia de que la
--           combinacion este declarada por el programa; es
--           deliberado, para que un ciclo sobreviva a una version
--           que deje de programar su nivel.
--
--      9.b  fk_programacion_equipo_frecuencia
--           sustituto: fk_programacion_equipo_frecuencia_version
--                                                  (apartado 8)
--           El sustituto es MAS estricto: exige que la combinacion
--           equipo+nivel este declarada en ESA version, no solo en
--           el programa. Mientras la antigua siguiera viva ademas
--           enmascaraba a la nueva: en la prueba, tres rechazos se
--           atribuyeron a la FK legacy y la nueva nunca llegaba a
--           evaluarse.
--
--      9.c  uq_frecuencia_programa_equipo_nivel
--           sustituto: uq_frecuencia_version_equipo_nivel
--                                                  (apartado 4)
--           VA LA ULTIMA por obligacion tecnica: 9.a y 9.b dependen
--           de esta clave y PostgreSQL rechaza el DROP con 2BP01
--           mientras existan.
-- ------------------------------------------------------------

ALTER TABLE programa_mantenimiento_unidad_ciclos
    DROP CONSTRAINT fk_ciclo_frecuencia;

ALTER TABLE programacion_mantenimiento_equipos
    DROP CONSTRAINT fk_programacion_equipo_frecuencia;

ALTER TABLE programa_mantenimiento_frecuencias
    DROP CONSTRAINT uq_frecuencia_programa_equipo_nivel;


-- ------------------------------------------------------------
-- 10. DESPUES DE ESTE ARCHIVO
--      - ejecutar el bloque de validacion V16-V2x;
--      - FASE V-B: crear el programa, la version V01 y las 13
--        frecuencias (esto es la FASE B original, ahora con version);
--      - FASE V-E: adaptar backend e initDb.js ANTES del cleanup;
--      - FASE V-G: 20260922_005_..._versionado_programa_cleanup.sql
--
--    Las columnas que retira el cleanup de versionado
--      (version, fecha_documento, periodo_inicio, periodo_fin,
--       frecuencias.programa_id)
--    son DISJUNTAS de las que retira el cleanup de equipos
--      (frecuencia_m1_dias, frecuencia_m2_dias, frecuencia_m3_dias,
--       fecha_programada, fecha_reprogramada, nivel_mantenimiento,
--       fecha_base_m1/m2/m3, quincena_arranque).
--    Por eso pueden ejecutarse en cualquier orden entre si, pero
--    NINGUNO de los dos antes de que el backend este adaptado.
-- ------------------------------------------------------------
