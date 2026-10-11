-- =====================================================================================
-- TI-PR-01 · MIGRACION 20261001_901 · CLEANUP DEL VERSIONADO DOCUMENTAL
-- =====================================================================================
-- CLASIFICACION: CONTRACCION DESTRUCTIVA. Elimina columnas y constraints.
--
-- *** NO EJECUTAR TODAVIA ***
-- Requisitos previos, en este orden:
--   1. 20260923_004 (desacople) ejecutada
--   2. 20260923_005 (inventario) ejecutada
--   3. 20260923_006 (reconciliacion de placas) ejecutada
--   4. Fase B cargada y validada
--   5. backend/frontend/initDb.js adaptados y en produccion
--   6. validation/20260922_003 ejecutada sin hallazgos
-- Ejecutarla antes de (5) rompe el arranque: initDb.js declara hoy
-- programas_mantenimiento.periodo_inicio, .periodo_fin y .fecha_documento en
-- CAMPOS_DATE y en ESQUEMA_ESPERADO.
--
-- ESTE ARCHIVO FUE REESCRITO EL 2026-09-23
-- ----------------------------------------
-- Version anterior (hash git f7d4f8d1, 243 lineas, 9 sentencias): escrita para el
-- modelo en el que la VERSION documental era la clave operativa. Nunca se ejecuto.
-- La migracion 20260923_004 invirtio ese modelo, y eso dejo 6 de sus 9 sentencias
-- incorrectas o imposibles:
--
--   sentencia anterior                                    por que ya no vale
--   ---------------------------------------------------   ------------------------------
--   ADD  fk_frecuencia_version                            004 ya la crea -> 42710
--   DROP fk_frecuencia_version_programa                   004 ya la retiro -> 42704
--   DROP fk_frecuencia_programa                           es el ancla operativa: NO
--   DROP COLUMN frecuencias.programa_id                   es la clave operativa: NO
--   programacion.version_programa_id SET NOT NULL         debe seguir OPCIONAL: NO
--   equipos.version_programa_id SET NOT NULL              columna eliminada por 004 -> 42703
--
-- Sobreviven las 3 sentencias que retiran del ENCABEZADO del programa los datos
-- documentales que ahora viven en programas_mantenimiento_versiones. Eso es lo
-- unico que este cleanup debe hacer.
--
-- QUE ELIMINA Y CUAL ES SU SUSTITUTO
-- ----------------------------------
--   programas_mantenimiento.version            -> programas_mantenimiento_versiones.version
--   programas_mantenimiento.fecha_documento     -> ..._versiones.fecha_documento
--   programas_mantenimiento.periodo_inicio      -> ..._versiones.periodo_inicio
--   programas_mantenimiento.periodo_fin         -> ..._versiones.periodo_fin
--   uq_programas_mantenimiento_codigo_periodo_version
--        -> uq_programas_mantenimiento_codigo (creada por 003). Es la que expresa el
--           modelo correcto: UN programa por codigo, permanente. La anterior permitia
--           varios TI-PR-01 distintos, uno por periodo y version, que es justamente
--           el error que todo este trabajo corrige.
--   chk_programas_mantenimiento_periodo (periodo_fin >= periodo_inicio)
--        -> chk_version_periodo, que ademas exige que ambos sean nulos o ninguno.
--
-- LO QUE NO TOCA
-- --------------
--   * No toca programa_mantenimiento_frecuencias: programa_id y fk_frecuencia_programa
--     se conservan. version_id se conserva como referencia documental OPCIONAL.
--   * No toca programacion_mantenimiento.version_programa_id: sigue siendo opcional.
--   * No borra ninguna fila. No hay DML.
--   * No hay CASCADE en ningun DROP.
--
-- ANTES DE EJECUTAR: migrar los datos del encabezado a una fila de
-- programas_mantenimiento_versiones. Si el encabezado tiene valores y no existe la
-- version correspondiente, el bloque de guarda aborta.
--
-- TRANSACCIONAL: ejecutar completa dentro de BEGIN/COMMIT.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0 · GUARDA: no perder el dato documental del encabezado sin haberlo migrado.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_sin_version integer;
BEGIN
    SELECT count(*) INTO v_sin_version
    FROM programas_mantenimiento p
    WHERE (p.version IS NOT NULL OR p.fecha_documento IS NOT NULL
           OR p.periodo_inicio IS NOT NULL OR p.periodo_fin IS NOT NULL)
      AND NOT EXISTS (
          SELECT 1 FROM programas_mantenimiento_versiones v
          WHERE v.programa_id = p.id
      );

    IF v_sin_version > 0 THEN
        RAISE EXCEPTION
            'Hay % programa(s) con datos documentales en el encabezado y sin ninguna fila en programas_mantenimiento_versiones. Migrar primero.',
            v_sin_version;
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1 · Retirar la unicidad por (codigo, periodo, version).
--     Sustituto: uq_programas_mantenimiento_codigo, creada por 20260922_003.
-- -------------------------------------------------------------------------------------
ALTER TABLE programas_mantenimiento
    DROP CONSTRAINT uq_programas_mantenimiento_codigo_periodo_version;

-- -------------------------------------------------------------------------------------
-- 2 · Retirar el CHECK de periodo del encabezado.
--     Sustituto: chk_version_periodo en programas_mantenimiento_versiones.
-- -------------------------------------------------------------------------------------
ALTER TABLE programas_mantenimiento
    DROP CONSTRAINT chk_programas_mantenimiento_periodo;

-- -------------------------------------------------------------------------------------
-- 3 · Retirar del encabezado las 4 columnas documentales.
--     Su contenido vive ahora en programas_mantenimiento_versiones.
-- -------------------------------------------------------------------------------------
ALTER TABLE programas_mantenimiento
    DROP COLUMN version,
    DROP COLUMN fecha_documento,
    DROP COLUMN periodo_inicio,
    DROP COLUMN periodo_fin;

-- -------------------------------------------------------------------------------------
-- DOCUMENTACION
-- -------------------------------------------------------------------------------------
COMMENT ON TABLE programas_mantenimiento IS
    'Encabezado del programa permanente (TI-PR-01). Un unico registro por codigo. No guarda version ni periodo: eso vive en programas_mantenimiento_versiones.';
