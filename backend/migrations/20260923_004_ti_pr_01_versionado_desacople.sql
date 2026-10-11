-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260923_004 · DESACOPLE DEL VERSIONADO DOCUMENTAL
-- =====================================================================================
-- CLASIFICACION: DESACOPLE ESTRUCTURAL (expansion + contraccion controlada de
--                constraints introducidas por 20260922_003, sobre tablas VACIAS).
--
-- MIGRACION FORWARD. No reescribe ni revierte 20260922_003, que ya esta ejecutada
-- persistentemente en la branch de pruebas. Corrige el modelo hacia adelante.
--
-- PROBLEMA QUE RESUELVE
-- ---------------------
-- 20260922_003 hizo del documento SIG (V01/V02) la columna vertebral OPERATIVA:
--   a) chk_version_vigencia_quincena obligaba a que la vigencia del documento
--      empezara dia 1 o 16. La fecha real del cajetin V01 es 2026-09-25 -> 23514.
--   b) uq_frecuencia_version_equipo_nivel ataba cada periodicidad a una version,
--      de modo que publicar V02 obligaba a reinsertar las periodicidades y a
--      repuntar toda la programacion existente.
--   c) programacion_mantenimiento_equipos resolvia la periodicidad valida contra
--      la VERSION, no contra el PROGRAMA.
--
-- MODELO RESULTANTE
-- -----------------
--   TI-PR-01 es UN programa permanente. programa_id es la clave operativa.
--   V01/V02 son revisiones DOCUMENTALES: se registran, no gobiernan.
--   Las quincenas siguen siendo obligatorias donde de verdad son quincenas
--   (quincena_programada, quincena_reprogramada, ultima_quincena,
--    quincena_incorporacion), NO en la fecha del documento.
--
-- LO QUE 003 INTRODUJO Y AQUI SE CONSERVA INTACTO
-- ------------------------------------------------
--   * tabla programas_mantenimiento_versiones completa (registro documental)
--   * chk_version_estado, chk_version_periodo, chk_version_vigencia
--   * exc_version_vigencia_sin_solape (btree_gist)  <- linea de tiempo sin solapes
--   * uq_version_programa_version, uq_version_id_programa, fk_version_programa
--   * trg_set_updated_at_programas_mantenimiento_versiones
--   * idx_versiones_programa_vigencia
--   * uq_programas_mantenimiento_codigo
--   * chk_ciclo_tipo_equipo, chk_ciclo_nivel, chk_ciclo_gps_solo_m3
--   * chk_programacion_mantenimiento_estado (6 estados, con PROYECTADO)
--   * programacion_mantenimiento.version_programa_id + fk_programacion_version
--     (se conserva NULLABLE: etiqueta documental de la visita, no requisito)
--   * fk_programacion_equipo_visita (programacion_id, programa_id)
--
-- LO QUE SE REEMPLAZA  (sustituto de integridad indicado en cada paso)
-- --------------------------------------------------------------------
--   uq_frecuencia_version_equipo_nivel        -> uq_frecuencia_programa_equipo_nivel
--   fk_programacion_equipo_frecuencia_version -> fk_programacion_equipo_frecuencia
--   fk_programacion_equipo_visita_version     -> fk_programacion_equipo_visita (ya existe)
--   fk_frecuencia_version_programa            -> fk_frecuencia_version + fk_frecuencia_programa
--   uq_programacion_id_version                -> programacion_mantenimiento_pkey (id es PK)
--   chk_version_vigencia_quincena             -> sin sustituto directo: la disciplina
--        de quincena se queda donde de verdad hay quincenas. Sobreviven intactos los
--        4 CHECK que la exigen:
--            chk_ciclo_ultima_quincena                     (ultima_quincena)
--            chk_programa_unidad_quincena_incorporacion     (quincena_incorporacion)
--            chk_programacion_quincena_programada           (quincena_programada)
--            chk_programacion_quincena_reprogramada         (quincena_reprogramada)
--        La quinta columna de quincena, programacion_mantenimiento.quincena_efectiva,
--        no necesita CHECK propio: es GENERATED ALWAYS AS
--        COALESCE(quincena_reprogramada, quincena_programada) STORED, asi que hereda
--        la restriccion de sus dos origenes.
--        La buena formacion de la linea de tiempo documental la sostienen
--        chk_version_vigencia y exc_version_vigencia_sin_solape.
--   frecuencias.version_id NOT NULL           -> NULLABLE (referencia documental)
--   equipos.version_programa_id (columna)     -> se elimina; la version de la
--        visita vive en programacion_mantenimiento y se alcanza por
--        fk_programacion_equipo_visita. Evita que detalle y visita etiqueten
--        versiones distintas sin necesidad de un trigger.
--
-- PRECONDICION VERIFICADA: las 7 tablas TI-PR-01 tienen 0 filas.
-- Ninguna operacion de este archivo pierde datos.
--
-- ORDEN: todo sustituto se crea ANTES de retirar lo que sustituye.
-- TRANSACCIONAL: ejecutar completa dentro de BEGIN/COMMIT.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1 · SUSTITUTO: unicidad de periodicidad por PROGRAMA (no por version)
--     Una periodicidad de TI-PR-01 es (tipo_equipo, nivel_mantenimiento) unica en el
--     programa. Publicar V02 ya no obliga a duplicar filas.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT uq_frecuencia_programa_equipo_nivel
    UNIQUE (programa_id, tipo_equipo, nivel_mantenimiento);

-- -------------------------------------------------------------------------------------
-- 2 · SUSTITUTO: el detalle por equipo resuelve la periodicidad contra el PROGRAMA.
--     programacion_mantenimiento_equipos.programa_id es NOT NULL, por lo que esta FK
--     queda plenamente exigida (sin el escape de MATCH SIMPLE por columna nula).
-- -------------------------------------------------------------------------------------
ALTER TABLE programacion_mantenimiento_equipos
    ADD CONSTRAINT fk_programacion_equipo_frecuencia
    FOREIGN KEY (programa_id, tipo_equipo, nivel_mantenimiento)
    REFERENCES programa_mantenimiento_frecuencias (programa_id, tipo_equipo, nivel_mantenimiento)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- -------------------------------------------------------------------------------------
-- 3 · RETIRO: FK de periodicidad por version (sustituida en el paso 2)
-- -------------------------------------------------------------------------------------
ALTER TABLE programacion_mantenimiento_equipos
    DROP CONSTRAINT fk_programacion_equipo_frecuencia_version;

-- -------------------------------------------------------------------------------------
-- 4 · RETIRO: FK visita-por-version.
--     Sustituto ya existente: fk_programacion_equipo_visita (programacion_id, programa_id),
--     que sigue garantizando que el detalle pertenezca a una visita del mismo programa.
-- -------------------------------------------------------------------------------------
ALTER TABLE programacion_mantenimiento_equipos
    DROP CONSTRAINT fk_programacion_equipo_visita_version;

-- -------------------------------------------------------------------------------------
-- 5 · RETIRO: unicidad de periodicidad por version (sustituida en el paso 1).
--     Solo es posible ahora que ninguna FK la referencia.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    DROP CONSTRAINT uq_frecuencia_version_equipo_nivel;

-- -------------------------------------------------------------------------------------
-- 6 · RETIRO: UNIQUE (id, version_programa_id) de programacion_mantenimiento.
--     Era el destino de la FK retirada en el paso 4. Es redundante por construccion:
--     id ya es PRIMARY KEY, luego (id, cualquier_cosa) no puede repetirse nunca.
--     Sustituto: programacion_mantenimiento_pkey.
-- -------------------------------------------------------------------------------------
ALTER TABLE programacion_mantenimiento
    DROP CONSTRAINT uq_programacion_id_version;

-- -------------------------------------------------------------------------------------
-- 7 · La version documental de una periodicidad pasa a ser OPCIONAL.
--     Deja de ser un requisito operativo: una periodicidad existe por programa.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    ALTER COLUMN version_id DROP NOT NULL;

-- -------------------------------------------------------------------------------------
-- 8 · RETIRO: FK compuesta (version_id, programa_id).
--     Exigia coherencia version<->programa en cada periodicidad; con version_id
--     opcional esa coherencia ya no es una regla operativa.
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    DROP CONSTRAINT fk_frecuencia_version_programa;

-- -------------------------------------------------------------------------------------
-- 9 · SUSTITUTO: la referencia documental sigue teniendo que apuntar a una version
--     que exista. Lo que ya no se exige es que sea del mismo programa.
--     La pertenencia al programa la garantiza fk_frecuencia_programa (intacta).
-- -------------------------------------------------------------------------------------
ALTER TABLE programa_mantenimiento_frecuencias
    ADD CONSTRAINT fk_frecuencia_version
    FOREIGN KEY (version_id)
    REFERENCES programas_mantenimiento_versiones (id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- -------------------------------------------------------------------------------------
-- 10 · RETIRO: obligacion de que la vigencia del DOCUMENTO caiga en dia 1 o 16.
--      La fecha de un documento SIG es la que firma la Gerencia (2026-09-25), no una
--      quincena de mantenimiento. Sin sustituto directo: ver cabecera.
--      NO se toca ningun CHECK de las columnas quincena_*.
-- -------------------------------------------------------------------------------------
ALTER TABLE programas_mantenimiento_versiones
    DROP CONSTRAINT chk_version_vigencia_quincena;

-- -------------------------------------------------------------------------------------
-- 11 · Se elimina la etiqueta de version del DETALLE por equipo.
--      Tabla vacia (0 filas) verificada antes de ejecutar: no hay perdida de datos.
--      La version de la visita vive en programacion_mantenimiento.version_programa_id
--      y el detalle la alcanza por fk_programacion_equipo_visita. Asi no puede
--      existir un detalle etiquetado con una version distinta a la de su visita.
-- -------------------------------------------------------------------------------------
ALTER TABLE programacion_mantenimiento_equipos
    DROP COLUMN version_programa_id;

-- -------------------------------------------------------------------------------------
-- DOCUMENTACION DEL MODELO RESULTANTE
-- -------------------------------------------------------------------------------------
COMMENT ON TABLE programas_mantenimiento_versiones IS
    'Revisiones DOCUMENTALES del programa (V01, V02, ...). Registro trazable del documento SIG. NO gobierna unidades, ciclos, periodicidades ni programacion: esas cuelgan de programa_id. vigencia_desde puede ser cualquier fecha.';

COMMENT ON COLUMN programa_mantenimiento_frecuencias.version_id IS
    'OPCIONAL. Version documental en la que se publico esta periodicidad. Referencia informativa; la clave operativa es (programa_id, tipo_equipo, nivel_mantenimiento).';

COMMENT ON COLUMN programacion_mantenimiento.version_programa_id IS
    'OPCIONAL. Version documental vigente cuando se genero la visita. No condiciona la ejecucion ni la reprogramacion.';

COMMENT ON TABLE programa_mantenimiento_unidad_ciclos IS
    'Estado de ciclo por programa/unidad/equipo/nivel. NO se versiona documentalmente: publicar V02 no reinicia ciclos ni pierde la ultima quincena ejecutada.';
