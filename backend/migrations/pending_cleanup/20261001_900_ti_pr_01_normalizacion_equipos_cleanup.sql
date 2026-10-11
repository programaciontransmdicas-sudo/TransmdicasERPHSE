-- ============================================================
-- TI-PR-01  FASE D - LIMPIEZA
--
--   *** ARCHIVO DESTRUCTIVO E IRREVERSIBLE ***
--
-- Elimina 7 columnas. DROP COLUMN borra los datos de forma definitiva:
-- revertir la migracion NO los recupera. Solo se recuperan desde un
-- respaldo o desde una branch de Neon anterior.
--
-- NO EJECUTAR hasta completar, en este orden:
--
--   1. FASE A   20260918_002_..._expand.sql aplicada.
--   2. FASE B   Datos migrados y cargados:
--                 - 13 frecuencias por programa
--                 - inventario de equipos en vehiculos
--                 - programa_id y quincena_programada de cada visita
--                 - referencias de ciclo con evidencia comprobable
--                 - detalle por equipo de las visitas existentes
--   3. FASE B-bis  BACKEND ADAPTADO Y DESPLEGADO:
--                 - modulo programas/unidades sin fecha_base_m1/m2/m3
--                   ni quincena_arranque
--                 - contrato de initDb.js actualizado a las columnas nuevas
--                 Sin esto, al ejecutar este archivo initDb() fallara
--                 y EL SERVIDOR NO ARRANCARA.
--   4. FASE C   Validacion: V7, V9, V10, V12, V13 y V14 en cero filas.
--   5. Autorizacion humana explicita.
--
-- Se recomienda respaldo previo o ejecucion sobre una branch de Neon.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Validar las restricciones creadas como NOT VALID en la FASE A.
--    Si alguna falla, DETENERSE: hay datos que no cumplen la regla.
-- ------------------------------------------------------------
ALTER TABLE programa_mantenimiento_unidades
  VALIDATE CONSTRAINT chk_programa_unidad_quincena_incorporacion;

ALTER TABLE programacion_mantenimiento
  VALIDATE CONSTRAINT fk_programacion_unidad_programa;

ALTER TABLE programacion_mantenimiento
  VALIDATE CONSTRAINT chk_programacion_quincena_programada;

ALTER TABLE programacion_mantenimiento
  VALIDATE CONSTRAINT chk_programacion_quincena_reprogramada;


-- ------------------------------------------------------------
-- 2. Consolidar las columnas nuevas como obligatorias.
--    Falla si quedo alguna fila sin rellenar en la FASE B.
-- ------------------------------------------------------------
ALTER TABLE programacion_mantenimiento
  ALTER COLUMN programa_id SET NOT NULL;

ALTER TABLE programacion_mantenimiento
  ALTER COLUMN quincena_programada SET NOT NULL;


-- ------------------------------------------------------------
-- 3. Retirar restricciones antiguas que ya quedaron reemplazadas.
-- ------------------------------------------------------------

-- 3.a UNIQUE antiguo por fecha_programada.
--     Lo reemplaza el indice unico parcial por quincena efectiva, que ademas
--     permite reutilizar la quincena de una visita CANCELADO.
--
--     YA LO RETIRA 20260925_013, porque bloqueaba el flujo de sustitucion de una
--     visita: al no ser parcial, no excluye 'CANCELADO'. Se conserva aqui con
--     IF EXISTS por dos motivos: que este cleanup no falle sobre una base donde 013
--     ya lo quito, y que siga funcionando sobre una base antigua donde 013 no se
--     hubiera aplicado. Si no existe, es un no-op silencioso y correcto.
ALTER TABLE programacion_mantenimiento
  DROP CONSTRAINT IF EXISTS uq_programacion_mantenimiento_unidad_fecha;

-- 3.b FK simple antigua hacia la unidad del programa.
--     Verificada en la base antes de escribir esta sentencia:
--       fk_programacion_mantenimiento_unidad
--       FOREIGN KEY (programa_unidad_id)
--       REFERENCES programa_mantenimiento_unidades(id)
--       ON UPDATE CASCADE ON DELETE RESTRICT
--
--     Queda cubierta por la compuesta fk_programacion_unidad_programa
--     (programa_unidad_id, programa_id) -> programa_mantenimiento_unidades(id, programa_id),
--     que es mas estricta porque ademas garantiza coherencia de programa.
--     Se retira para no mantener dos FK verificando la misma relacion.
--
--     ORDEN OBLIGATORIO: esta sentencia va DESPUES del paso 1, que valida
--     la FK compuesta. Nunca antes: si se retirara primero, la relacion
--     quedaria sin FK validada durante ese intervalo.
ALTER TABLE programacion_mantenimiento
  DROP CONSTRAINT fk_programacion_mantenimiento_unidad;


-- ------------------------------------------------------------
-- 4. DESTRUCTIVO: eliminar las columnas reemplazadas.
--    Los CHECK asociados caen junto con sus columnas.
-- ------------------------------------------------------------

-- El nivel pasa al detalle por equipo: una visita puede mezclar niveles.
ALTER TABLE programacion_mantenimiento
  DROP COLUMN nivel_mantenimiento;              -- y chk_programacion_mantenimiento_nivel

-- La quincena sustituye a la fecha suelta como unidad de planificacion.
ALTER TABLE programacion_mantenimiento
  DROP COLUMN fecha_programada,
  DROP COLUMN fecha_reprogramada;

-- La base del ciclo pasa a programa_mantenimiento_unidad_ciclos,
-- por unidad + equipo + nivel. quincena_arranque se sustituye por
-- quincena_incorporacion, que significa otra cosa: desde cuando participa.
ALTER TABLE programa_mantenimiento_unidades
  DROP COLUMN fecha_base_m1,
  DROP COLUMN fecha_base_m2,
  DROP COLUMN fecha_base_m3,
  DROP COLUMN quincena_arranque;

-- La periodicidad pasa a programa_mantenimiento_frecuencias,
-- por equipo y nivel, medida en quincenas.
ALTER TABLE programas_mantenimiento
  DROP COLUMN frecuencia_m1_dias,               -- y chk_..._frecuencia_m1
  DROP COLUMN frecuencia_m2_dias,               -- y chk_..._frecuencia_m2
  DROP COLUMN frecuencia_m3_dias;               -- y chk_..._frecuencia_m3


-- ------------------------------------------------------------
-- 5. Despues de este archivo:
--      - volver a ejecutar el bloque de validacion (V1-V15);
--      - initDb() debe seguir pasando CON EL CONTRATO YA ACTUALIZADO;
--      - regenerar schema_actual.sql desde la base real.
-- ------------------------------------------------------------
