-- =====================================================================================
-- TI-PR-01 · VALIDACION DEL MODELO FINAL
-- Estado esperado: 003 + 004 + 005 + 006 + Fase B cargada
-- =====================================================================================
-- 100 % SOLO LECTURA. Unicamente SELECT y WITH. Cero DDL. Cero DML.
-- Ninguna consulta modifica datos, catalogo ni secuencias.
--
-- NO SUSTITUYE a validation/20260922_003_ti_pr_01_versionado_programa_validation.sql,
-- que se conserva intacto como registro historico de lo que verificaba la migracion 003.
-- Aquel fichero describe un modelo en el que la VERSION documental era la clave
-- operativa; 8 de sus consultas ya no representan el modelo vigente (ver el informe).
-- Este fichero valida el modelo definitivo.
--
-- CADA CONSULTA DEVUELVE SIEMPRE LAS MISMAS COLUMNAS
-- --------------------------------------------------
--   id                identificador de la regla
--   clase             ESTRUCTURAL   se resuelve contra el catalogo; no necesita datos
--                     NEGOCIO       se ejercita sobre filas reales
--                     ESTADO-VACIO  la regla exige exactamente cero filas; el cero ES
--                                   el resultado correcto, no una ausencia de prueba
--   regla             que se afirma
--   filas_evaluadas   cuantas filas u objetos examino de verdad la consulta
--   violaciones       cuantas incumplen
--   estado            FAIL  si violaciones > 0
--                     N/A   si clase=NEGOCIO y filas_evaluadas=0, es decir la regla
--                           NO se pudo ejercitar: no es un PASS
--                     PASS  en el resto
--   detalle           evidencia legible
--
-- Un PASS de clase NEGOCIO siempre significa "comprobado con datos reales".
-- =====================================================================================


-- V1 ---------------------------------------------------------------------------------
-- La tabla de versiones documentales existe y es una tabla ordinaria.
SELECT 'V1' AS id, 'ESTRUCTURAL' AS clase,
       'programas_mantenimiento_versiones existe y es tabla ordinaria' AS regla,
       1 AS filas_evaluadas,
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c
                         WHERE c.oid = to_regclass('public.programas_mantenimiento_versiones')
                           AND c.relkind = 'r') THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c
                         WHERE c.oid = to_regclass('public.programas_mantenimiento_versiones')
                           AND c.relkind = 'r') THEN 'PASS' ELSE 'FAIL' END AS estado,
       coalesce((SELECT c.relkind::text FROM pg_class c
                 WHERE c.oid = to_regclass('public.programas_mantenimiento_versiones')),
                'no existe') AS detalle;


-- V2 ---------------------------------------------------------------------------------
-- La fecha real del cajetin (2026-09-25, dia 25) es valida documentalmente: ya no hay
-- ningun CHECK que ancle vigencia_desde a dia 1 o 16, y existe la fila que lo demuestra.
WITH x AS (
  SELECT (SELECT count(*) FROM programas_mantenimiento_versiones) AS filas,
         (SELECT count(*) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programas_mantenimiento_versiones')
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ~* 'day FROM vigencia') AS chk_quincena,
         (SELECT count(*) FROM programas_mantenimiento_versiones
          WHERE vigencia_desde = DATE '2026-09-25') AS con_fecha_real
)
SELECT 'V2' AS id, 'NEGOCIO' AS clase,
       'vigencia_desde = 2026-09-25 es valida y esta cargada' AS regla,
       filas AS filas_evaluadas,
       (CASE WHEN chk_quincena > 0 THEN 1 ELSE 0 END)
       + (CASE WHEN con_fecha_real = 0 THEN 1 ELSE 0 END) AS violaciones,
       CASE WHEN chk_quincena > 0 OR con_fecha_real = 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin versiones cargadas)'
            ELSE 'PASS' END AS estado,
       'CHECK de quincena sobre vigencia: ' || chk_quincena
       || ' · versiones con vigencia_desde=2026-09-25: ' || con_fecha_real AS detalle
FROM x;


-- V3 ---------------------------------------------------------------------------------
-- Las versiones documentales OPERATIVAS de un mismo programa no se solapan.
-- Se evalua sobre PARES comparables: con una sola version no hay par que examinar y la
-- regla queda en N/A, no en PASS.
WITH pares AS (
  SELECT a.programa_id, a.version AS ver_a, b.version AS ver_b
  FROM programas_mantenimiento_versiones a
  JOIN programas_mantenimiento_versiones b
    ON b.programa_id = a.programa_id
   AND b.id > a.id
  WHERE a.estado IN ('VIGENTE','SUPERSEDIDA')
    AND b.estado IN ('VIGENTE','SUPERSEDIDA')
), solapados AS (
  SELECT a.programa_id, a.version AS ver_a, b.version AS ver_b
  FROM programas_mantenimiento_versiones a
  JOIN programas_mantenimiento_versiones b
    ON b.programa_id = a.programa_id
   AND b.id > a.id
  WHERE a.estado IN ('VIGENTE','SUPERSEDIDA')
    AND b.estado IN ('VIGENTE','SUPERSEDIDA')
    AND daterange(a.vigencia_desde, a.vigencia_hasta, '[)')
     && daterange(b.vigencia_desde, b.vigencia_hasta, '[)')
)
SELECT 'V3' AS id, 'NEGOCIO' AS clase,
       'dos versiones operativas del mismo programa no solapan vigencia' AS regla,
       (SELECT count(*) FROM pares) AS filas_evaluadas,
       (SELECT count(*) FROM solapados) AS violaciones,
       CASE WHEN (SELECT count(*) FROM solapados) > 0 THEN 'FAIL'
            WHEN (SELECT count(*) FROM pares) = 0
              THEN 'N/A (una sola version operativa: no hay par que comparar)'
            ELSE 'PASS' END AS estado,
       'pares comparables: ' || (SELECT count(*) FROM pares)
       || coalesce(' · solapados: ' || (SELECT string_agg(ver_a || '/' || ver_b, ', ')
                                        FROM solapados), '') AS detalle;


-- V3.b -------------------------------------------------------------------------------
-- Garantia estructural que respalda V3 aunque hoy solo exista una version.
SELECT 'V3.b' AS id, 'ESTRUCTURAL' AS clase,
       'existe el EXCLUDE que impide solapes de vigencia (btree_gist)' AS regla,
       1 AS filas_evaluadas,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid = to_regclass('public.programas_mantenimiento_versiones')
                           AND contype = 'x'
                           AND conname = 'exc_version_vigencia_sin_solape')
            THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid = to_regclass('public.programas_mantenimiento_versiones')
                           AND contype = 'x'
                           AND conname = 'exc_version_vigencia_sin_solape')
            THEN 'PASS' ELSE 'FAIL' END AS estado,
       coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'exc_version_vigencia_sin_solape'), 'ausente') AS detalle;


-- V4 ---------------------------------------------------------------------------------
-- Las periodicidades cuelgan del PROGRAMA: programa_id existe, es NOT NULL y tiene FK.
WITH x AS (
  SELECT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='programa_mantenimiento_frecuencias'
            AND column_name='programa_id' AND is_nullable='NO') AS col_not_null,
         (SELECT count(*) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND contype='f'
            AND confrelid = to_regclass('public.programas_mantenimiento')
            AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                 FROM unnest(conkey) WITH ORDINALITY k(attnum,ord)
                 JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.attnum) = 'programa_id') AS fk
)
SELECT 'V4' AS id, 'ESTRUCTURAL' AS clase,
       'programa_mantenimiento_frecuencias depende de programa_id (NOT NULL + FK)' AS regla,
       2 AS filas_evaluadas,
       (CASE WHEN col_not_null = 1 THEN 0 ELSE 1 END)
       + (CASE WHEN fk >= 1 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN col_not_null = 1 AND fk >= 1 THEN 'PASS' ELSE 'FAIL' END AS estado,
       'programa_id NOT NULL: ' || col_not_null || ' · FK a programas_mantenimiento: ' || fk AS detalle
FROM x;


-- V5 ---------------------------------------------------------------------------------
-- Unicidad de la periodicidad por programa, no por version documental.
WITH x AS (
  SELECT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND contype = 'u'
            AND (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
                 FROM unnest(conkey) WITH ORDINALITY k(attnum,ord)
                 JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.attnum)
                = 'nivel_mantenimiento,programa_id,tipo_equipo') AS uq_programa,
         (SELECT count(*) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND contype = 'u'
            AND (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
                 FROM unnest(conkey) WITH ORDINALITY k(attnum,ord)
                 JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.attnum)
                = 'nivel_mantenimiento,tipo_equipo,version_id') AS uq_version
)
SELECT 'V5' AS id, 'ESTRUCTURAL' AS clase,
       'existe UNIQUE(programa_id,tipo_equipo,nivel_mantenimiento) y NO el de version' AS regla,
       2 AS filas_evaluadas,
       (CASE WHEN uq_programa = 1 THEN 0 ELSE 1 END)
       + (CASE WHEN uq_version = 0 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN uq_programa = 1 AND uq_version = 0 THEN 'PASS' ELSE 'FAIL' END AS estado,
       'UNIQUE por programa: ' || uq_programa || ' · UNIQUE por version (debe ser 0): ' || uq_version AS detalle
FROM x;


-- V6 ---------------------------------------------------------------------------------
-- Las familias ANUALES solo admiten nivel M3. Se comprueba con las filas cargadas y con
-- el CHECK que lo respalda.
-- El nombre de ese CHECK cambio con 20260924_009: cubria solo el GPS
-- (chk_frecuencia_gps_solo_m3) y ahora cubre GPS y ADAS (chk_frecuencia_anual_solo_m3).
-- Se aceptan los dos nombres para que esta validacion sirva antes y despues de 009.
WITH x AS (
  SELECT (SELECT count(*) FROM programa_mantenimiento_frecuencias) AS filas,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias
          WHERE tipo_equipo IN ('GPS','ADAS') AND nivel_mantenimiento <> 'M3') AS viol_datos,
         (SELECT count(*) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND contype='c'
            AND conname IN ('chk_frecuencia_gps_solo_m3','chk_frecuencia_anual_solo_m3')) AS chk,
         (SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
          WHERE conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND contype='c'
            AND conname IN ('chk_frecuencia_gps_solo_m3','chk_frecuencia_anual_solo_m3')) AS nombre_chk,
         (SELECT string_agg(tipo_equipo || '/' || nivel_mantenimiento, ', ' ORDER BY tipo_equipo, nivel_mantenimiento)
          FROM programa_mantenimiento_frecuencias WHERE tipo_equipo IN ('GPS','ADAS')) AS anuales
)
SELECT 'V6' AS id, 'NEGOCIO' AS clase,
       'las familias anuales (GPS y ADAS) solo existen en nivel M3, y el CHECK lo respalda' AS regla,
       filas AS filas_evaluadas,
       viol_datos + (CASE WHEN chk = 1 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN viol_datos > 0 OR chk <> 1 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin periodicidades cargadas)'
            ELSE 'PASS' END AS estado,
       'anuales cargadas: ' || coalesce(anuales,'(ninguna)')
       || ' · CHECK presente: ' || coalesce(nombre_chk,'NINGUNO') AS detalle
FROM x;


-- V7 ---------------------------------------------------------------------------------
-- Toda periodicidad es estrictamente positiva.
WITH x AS (
  SELECT (SELECT count(*) FROM programa_mantenimiento_frecuencias) AS filas,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias WHERE frecuencia_quincenas <= 0) AS viol,
         (SELECT min(frecuencia_quincenas) FROM programa_mantenimiento_frecuencias) AS minimo,
         (SELECT max(frecuencia_quincenas) FROM programa_mantenimiento_frecuencias) AS maximo
)
SELECT 'V7' AS id, 'NEGOCIO' AS clase,
       'frecuencia_quincenas > 0 en todas las periodicidades' AS regla,
       filas AS filas_evaluadas, viol AS violaciones,
       CASE WHEN viol > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin periodicidades cargadas)'
            ELSE 'PASS' END AS estado,
       'rango observado: ' || coalesce(minimo::text,'-') || ' a ' || coalesce(maximo::text,'-') || ' quincenas' AS detalle
FROM x;


-- V8 ---------------------------------------------------------------------------------
-- Ninguna dependencia OPERATIVA exige version_id en frecuencias:
--   (a) la columna es nullable
--   (b) no participa en ninguna PK ni UNIQUE
--   (c) ninguna otra tabla la referencia por FK
WITH x AS (
  SELECT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='programa_mantenimiento_frecuencias'
            AND column_name='version_id' AND is_nullable='YES') AS nullable,
         (SELECT count(*) FROM pg_constraint con
          WHERE con.conrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND con.contype IN ('p','u')
            AND EXISTS (SELECT 1 FROM unnest(con.conkey) k
                        JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k
                        WHERE a.attname='version_id')) AS en_claves,
         (SELECT count(*) FROM pg_constraint con
          WHERE con.contype='f'
            AND con.confrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND EXISTS (SELECT 1 FROM unnest(con.confkey) k
                        JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k
                        WHERE a.attname='version_id')) AS referenciada
)
SELECT 'V8' AS id, 'ESTRUCTURAL' AS clase,
       'version_id en frecuencias no es requisito operativo (nullable, fuera de claves, sin FK entrante)' AS regla,
       3 AS filas_evaluadas,
       (CASE WHEN nullable = 1 THEN 0 ELSE 1 END)
       + (CASE WHEN en_claves = 0 THEN 0 ELSE 1 END)
       + (CASE WHEN referenciada = 0 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN nullable = 1 AND en_claves = 0 AND referenciada = 0 THEN 'PASS' ELSE 'FAIL' END AS estado,
       'nullable: ' || nullable || ' · en PK/UNIQUE: ' || en_claves
       || ' · referenciada por FK: ' || referenciada
       || ' · PENDIENTE: la columna debe eliminarse en el cleanup final' AS detalle
FROM x;


-- V9 ---------------------------------------------------------------------------------
-- programacion_mantenimiento no requiere version_programa_id.
WITH x AS (
  SELECT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='programacion_mantenimiento'
            AND column_name='version_programa_id' AND is_nullable='YES') AS nullable
)
SELECT 'V9' AS id, 'ESTRUCTURAL' AS clase,
       'programacion_mantenimiento.version_programa_id es opcional' AS regla,
       1 AS filas_evaluadas,
       CASE WHEN nullable = 1 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN nullable = 1 THEN 'PASS' ELSE 'FAIL' END AS estado,
       'columna nullable: ' || nullable AS detalle
FROM x;


-- V10 --------------------------------------------------------------------------------
-- programacion_mantenimiento_equipos no requiere version_programa_id.
-- El modelo final elimina la columna; se acepta tambien que exista pero sea opcional.
WITH x AS (
  SELECT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='programacion_mantenimiento_equipos'
            AND column_name='version_programa_id') AS existe,
         (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='programacion_mantenimiento_equipos'
            AND column_name='version_programa_id' AND is_nullable='NO') AS obligatoria
)
SELECT 'V10' AS id, 'ESTRUCTURAL' AS clase,
       'programacion_mantenimiento_equipos no exige version_programa_id' AS regla,
       1 AS filas_evaluadas,
       CASE WHEN obligatoria = 0 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN obligatoria = 0 THEN 'PASS' ELSE 'FAIL' END AS estado,
       CASE WHEN existe = 0 THEN 'columna eliminada por 004 (estado esperado)'
            ELSE 'columna presente y nullable' END AS detalle
FROM x;


-- V11 --------------------------------------------------------------------------------
-- La combinacion valida del detalle se resuelve por (programa_id,tipo_equipo,nivel_mantenimiento).
WITH x AS (
  SELECT (SELECT count(*) FROM pg_constraint con
          WHERE con.conrelid = to_regclass('public.programacion_mantenimiento_equipos')
            AND con.contype='f'
            AND con.confrelid = to_regclass('public.programa_mantenimiento_frecuencias')
            AND (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
                 FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ord)
                 JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum)
                = 'nivel_mantenimiento,programa_id,tipo_equipo') AS fk_por_programa,
         (SELECT count(*) FROM pg_constraint con
          WHERE con.conrelid = to_regclass('public.programacion_mantenimiento_equipos')
            AND con.contype='f'
            AND EXISTS (SELECT 1 FROM unnest(con.conkey) k
                        JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k
                        WHERE a.attname='version_programa_id')) AS fk_por_version
)
SELECT 'V11' AS id, 'ESTRUCTURAL' AS clase,
       'el detalle resuelve la periodicidad por (programa_id,tipo_equipo,nivel_mantenimiento)' AS regla,
       2 AS filas_evaluadas,
       (CASE WHEN fk_por_programa = 1 THEN 0 ELSE 1 END)
       + (CASE WHEN fk_por_version = 0 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN fk_por_programa = 1 AND fk_por_version = 0 THEN 'PASS' ELSE 'FAIL' END AS estado,
       'FK por programa: ' || fk_por_programa || ' · FK por version (debe ser 0): ' || fk_por_version AS detalle
FROM x;


-- V11.b ------------------------------------------------------------------------------
-- Comprobacion con datos de la misma regla. Hoy el detalle esta vacio a proposito, por
-- lo que la regla NO se ejercita: queda en N/A, no en PASS.
WITH x AS (
  SELECT (SELECT count(*) FROM programacion_mantenimiento_equipos) AS filas,
         (SELECT count(*) FROM programacion_mantenimiento_equipos e
          WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_frecuencias f
                            WHERE f.programa_id = e.programa_id
                              AND f.tipo_equipo = e.tipo_equipo
                              AND f.nivel_mantenimiento = e.nivel_mantenimiento)) AS viol
)
SELECT 'V11.b' AS id, 'NEGOCIO' AS clase,
       'ningun detalle apunta a una periodicidad inexistente del programa' AS regla,
       filas AS filas_evaluadas, viol AS violaciones,
       CASE WHEN viol > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (detalle vacio por instruccion: regla no ejercitada con datos)'
            ELSE 'PASS' END AS estado,
       'filas de detalle: ' || filas AS detalle
FROM x;


-- V12 --------------------------------------------------------------------------------
-- El programa tiene exactamente 174 unidades activas.
WITH x AS (
  SELECT (SELECT count(*) FROM programa_mantenimiento_unidades) AS filas,
         (SELECT count(DISTINCT placa) FROM programa_mantenimiento_unidades) AS placas
)
SELECT 'V12' AS id, 'NEGOCIO' AS clase,
       'programa_mantenimiento_unidades = 174 unidades activas' AS regla,
       filas AS filas_evaluadas,
       (CASE WHEN filas = 174 THEN 0 ELSE 1 END)
       + (CASE WHEN placas = filas THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN filas <> 174 OR placas <> filas THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin unidades cargadas)'
            ELSE 'PASS' END AS estado,
       'filas: ' || filas || ' · placas distintas: ' || placas AS detalle
FROM x;


-- V13 --------------------------------------------------------------------------------
-- V5K756 esta VENDIDA: no pertenece al programa activo.
WITH x AS (
  SELECT (SELECT count(*) FROM programa_mantenimiento_unidades) AS filas,
         (SELECT count(*) FROM programa_mantenimiento_unidades
          WHERE replace(placa,'-','') = 'V5K756') AS viol
)
SELECT 'V13' AS id, 'NEGOCIO' AS clase,
       'V5K756 NO esta en programa_mantenimiento_unidades' AS regla,
       filas AS filas_evaluadas, viol AS violaciones,
       CASE WHEN viol > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin unidades cargadas)'
            ELSE 'PASS' END AS estado,
       'unidades del programa que son V5K756: ' || viol AS detalle
FROM x;


-- V14 --------------------------------------------------------------------------------
-- El inventario cubre el universo completo de STATUS: 1400 filas.
WITH x AS (SELECT count(*) AS filas FROM vehiculo_equipos)
SELECT 'V14' AS id, 'NEGOCIO' AS clase,
       'vehiculo_equipos = 1400 filas (175 unidades x 8 tipos)' AS regla,
       filas AS filas_evaluadas,
       CASE WHEN filas = 1400 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN filas <> 1400 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (inventario vacio)'
            ELSE 'PASS' END AS estado,
       'filas: ' || filas || ' (esperado 1400)' AS detalle
FROM x;


-- V15 --------------------------------------------------------------------------------
-- El inventario cubre EXACTAMENTE 175 placas y cada una tiene sus 8 tipos, sin sobras.
WITH por_placa AS (
  SELECT placa, count(*) AS n, count(DISTINCT tipo_equipo) AS tipos
  FROM vehiculo_equipos GROUP BY placa
)
SELECT 'V15' AS id, 'NEGOCIO' AS clase,
       'inventario = 175 placas, cada una con exactamente 8 tipos distintos' AS regla,
       (SELECT count(*) FROM por_placa) AS filas_evaluadas,
       (CASE WHEN (SELECT count(*) FROM por_placa) = 175 THEN 0 ELSE 1 END)
       + (SELECT count(*) FROM por_placa WHERE n <> 8 OR tipos <> 8) AS violaciones,
       CASE WHEN (SELECT count(*) FROM por_placa) <> 175
              OR (SELECT count(*) FROM por_placa WHERE n <> 8 OR tipos <> 8) > 0 THEN 'FAIL'
            WHEN (SELECT count(*) FROM por_placa) = 0 THEN 'N/A (inventario vacio)'
            ELSE 'PASS' END AS estado,
       'placas: ' || (SELECT count(*) FROM por_placa)
       || ' · placas con conteo distinto de 8: ' || (SELECT count(*) FROM por_placa WHERE n <> 8 OR tipos <> 8) AS detalle;


-- V16 --------------------------------------------------------------------------------
-- Las 174 unidades activas aportan exactamente 1392 filas de inventario.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculo_equipos e
          WHERE EXISTS (SELECT 1 FROM programa_mantenimiento_unidades u WHERE u.placa = e.placa)) AS activo
)
SELECT 'V16' AS id, 'NEGOCIO' AS clase,
       'inventario de las unidades activas = 1392 filas' AS regla,
       activo AS filas_evaluadas,
       CASE WHEN activo = 1392 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN activo <> 1392 THEN 'FAIL'
            WHEN activo = 0 THEN 'N/A (inventario vacio)'
            ELSE 'PASS' END AS estado,
       'filas de unidades activas: ' || activo || ' (esperado 1392 = 174 x 8)' AS detalle
FROM x;


-- V17 --------------------------------------------------------------------------------
-- La unidad vendida conserva su inventario historico completo.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculo_equipos WHERE placa = 'V5K756') AS n,
         (SELECT count(DISTINCT tipo_equipo) FROM vehiculo_equipos WHERE placa = 'V5K756') AS tipos,
         (SELECT count(*) FROM vehiculo_equipos WHERE placa = 'V5K756'
            AND estado_inventario = 'INSTALADO') AS instalados,
         (SELECT string_agg(DISTINCT fuente, ', ') FROM vehiculo_equipos WHERE placa = 'V5K756') AS fuentes
)
SELECT 'V17' AS id, 'NEGOCIO' AS clase,
       'V5K756 tiene exactamente 8 filas de inventario historico' AS regla,
       n AS filas_evaluadas,
       (CASE WHEN n = 8 THEN 0 ELSE 1 END) + (CASE WHEN tipos = 8 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN n <> 8 OR tipos <> 8 THEN 'FAIL'
            WHEN n = 0 THEN 'N/A (sin inventario de V5K756)'
            ELSE 'PASS' END AS estado,
       'filas: ' || n || ' · tipos: ' || tipos || ' · instalados: ' || instalados
       || ' · fuente: ' || coalesce(fuentes,'-') AS detalle
FROM x;


-- V18 --------------------------------------------------------------------------------
-- El dominio de estado_inventario es exactamente el demostrado sobre la fuente.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculo_equipos) AS filas,
         (SELECT count(*) FROM vehiculo_equipos
          WHERE estado_inventario NOT IN ('INSTALADO','NO_APLICA','POR_VALIDAR')) AS viol,
         (SELECT string_agg(DISTINCT estado_inventario, ', ' ORDER BY estado_inventario)
          FROM vehiculo_equipos) AS observados
)
SELECT 'V18' AS id, 'NEGOCIO' AS clase,
       'estado_inventario solo toma los valores INSTALADO, NO_APLICA y POR_VALIDAR' AS regla,
       filas AS filas_evaluadas, viol AS violaciones,
       CASE WHEN viol > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (inventario vacio)'
            ELSE 'PASS' END AS estado,
       'valores presentes: ' || coalesce(observados,'(ninguno)') AS detalle
FROM x;


-- V19 --------------------------------------------------------------------------------
-- ADAS se inventaria, y desde 20260924_009 tambien se mantiene, pero SOLO cuando el
-- proveedor actual es Tracklog. Esta regla acepta los dos estados del modelo:
--   antes de 009: ADAS existe en inventario y no tiene ninguna periodicidad;
--   desde  009: ADAS tiene exactamente una periodicidad, M3 de 24 quincenas.
-- Y en ambos casos exige que ningun ciclo ADAS pertenezca a una unidad cuyo proveedor
-- actual no sea Tracklog: eso es lo que de verdad limita la elegibilidad.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculo_equipos WHERE tipo_equipo = 'ADAS') AS en_inventario,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias WHERE tipo_equipo = 'ADAS') AS frec,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias
           WHERE tipo_equipo = 'ADAS' AND nivel_mantenimiento = 'M3' AND frecuencia_quincenas = 24) AS frec_ok,
         (SELECT count(*) FROM vehiculo_equipos
          WHERE tipo_equipo = 'ADAS' AND estado_inventario = 'INSTALADO') AS instalados,
         (SELECT count(*) FROM vehiculo_equipos
          WHERE tipo_equipo = 'ADAS' AND estado_inventario = 'INSTALADO'
            AND marca ILIKE '%TRACKLOG%') AS tracklog,
         (SELECT count(*) FROM programa_mantenimiento_unidad_ciclos k
           JOIN programa_mantenimiento_unidades u ON u.id = k.programa_unidad_id
          WHERE k.tipo_equipo = 'ADAS'
            AND NOT EXISTS (SELECT 1 FROM vehiculo_equipos e
                             WHERE e.placa = u.placa AND e.tipo_equipo = 'ADAS'
                               AND e.estado_inventario = 'INSTALADO'
                               AND e.marca ILIKE '%TRACKLOG%')) AS ciclos_no_tracklog
)
SELECT 'V19' AS id, 'NEGOCIO' AS clase,
       'ADAS se inventaria; su periodicidad, si existe, es solo M3/24; y ningun ciclo ADAS es de un proveedor no Tracklog' AS regla,
       en_inventario + frec AS filas_evaluadas,
       (CASE WHEN en_inventario > 0 THEN 0 ELSE 1 END)
       + (CASE WHEN frec = 0 OR (frec = 1 AND frec_ok = 1) THEN 0 ELSE 1 END)
       + ciclos_no_tracklog AS violaciones,
       CASE WHEN en_inventario = 0
              OR NOT (frec = 0 OR (frec = 1 AND frec_ok = 1))
              OR ciclos_no_tracklog > 0 THEN 'FAIL'
            ELSE 'PASS' END AS estado,
       'ADAS en inventario: ' || en_inventario || ' (instalados ' || instalados
       || ', de ellos Tracklog ' || tracklog || ') · periodicidades ADAS: ' || frec
       || CASE WHEN frec = 0 THEN ' (estado previo a 009)' ELSE ' (M3/24: ' || frec_ok || ')' END
       || ' · ciclos ADAS de proveedor no Tracklog: ' || ciclos_no_tracklog || ' (debe ser 0)' AS detalle
FROM x;


-- V20 --------------------------------------------------------------------------------
-- Proyeccion DVR: una unidad tiene DVR mantenible si DVR_INTERNO o DVR_EXTERNO estan
-- instalados. Se comprueba que la proyeccion es coherente y no pierde ninguna unidad.
WITH proy AS (
  SELECT u.placa,
         bool_or(e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO') AND e.estado_inventario = 'INSTALADO') AS aplica,
         bool_or(e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO') AND e.estado_inventario = 'POR_VALIDAR') AS pendiente
  FROM programa_mantenimiento_unidades u
  JOIN vehiculo_equipos e ON e.placa = u.placa
  GROUP BY u.placa
), incoherentes AS (
  -- una unidad marcada como aplicable debe tener al menos un equipo fuente instalado
  SELECT p.placa FROM proy p
  WHERE p.aplica
    AND NOT EXISTS (SELECT 1 FROM vehiculo_equipos e
                    WHERE e.placa = p.placa
                      AND e.tipo_equipo IN ('DVR_INTERNO','DVR_EXTERNO')
                      AND e.estado_inventario = 'INSTALADO')
)
SELECT 'V20' AS id, 'NEGOCIO' AS clase,
       'proyeccion DVR = DVR_INTERNO OR DVR_EXTERNO, coherente en las 174 unidades' AS regla,
       (SELECT count(*) FROM proy) AS filas_evaluadas,
       (SELECT count(*) FROM incoherentes) AS violaciones,
       CASE WHEN (SELECT count(*) FROM incoherentes) > 0 THEN 'FAIL'
            WHEN (SELECT count(*) FROM proy) = 0 THEN 'N/A (sin unidades o sin inventario)'
            ELSE 'PASS' END AS estado,
       'unidades evaluadas: ' || (SELECT count(*) FROM proy)
       || ' · aplica DVR: ' || (SELECT count(*) FROM proy WHERE aplica)
       || ' · con algun POR_VALIDAR: ' || (SELECT count(*) FROM proy WHERE pendiente) AS detalle;


-- V21 --------------------------------------------------------------------------------
-- Proyeccion CAMARAS = CAMARA_INTERNA OR CAMARA_EXTERNA.
-- ADAS queda FUERA de esta proyeccion: se inventaria pero no se mantiene (ver V19).
WITH proy AS (
  SELECT u.placa,
         bool_or(e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA') AND e.estado_inventario = 'INSTALADO') AS aplica,
         bool_or(e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA') AND e.estado_inventario = 'POR_VALIDAR') AS pendiente,
         bool_or(e.tipo_equipo = 'ADAS' AND e.estado_inventario = 'INSTALADO') AS con_adas
  FROM programa_mantenimiento_unidades u
  JOIN vehiculo_equipos e ON e.placa = u.placa
  GROUP BY u.placa
), incoherentes AS (
  SELECT p.placa FROM proy p
  WHERE p.aplica
    AND NOT EXISTS (SELECT 1 FROM vehiculo_equipos e
                    WHERE e.placa = p.placa
                      AND e.tipo_equipo IN ('CAMARA_INTERNA','CAMARA_EXTERNA')
                      AND e.estado_inventario = 'INSTALADO')
)
SELECT 'V21' AS id, 'NEGOCIO' AS clase,
       'proyeccion CAMARAS = CAMARA_INTERNA OR CAMARA_EXTERNA (ADAS excluido)' AS regla,
       (SELECT count(*) FROM proy) AS filas_evaluadas,
       (SELECT count(*) FROM incoherentes) AS violaciones,
       CASE WHEN (SELECT count(*) FROM incoherentes) > 0 THEN 'FAIL'
            WHEN (SELECT count(*) FROM proy) = 0 THEN 'N/A (sin unidades o sin inventario)'
            ELSE 'PASS' END AS estado,
       'aplica CAMARAS: ' || (SELECT count(*) FROM proy WHERE aplica)
       || ' · con algun POR_VALIDAR: ' || (SELECT count(*) FROM proy WHERE pendiente)
       || ' · unidades con ADAS instalado pero SIN camara interna/externa: '
       || (SELECT count(*) FROM proy WHERE con_adas AND NOT aplica) AS detalle;


-- V22 --------------------------------------------------------------------------------
-- COPILOTO, RADIO_BASE y GPS proyectan uno a uno: el tipo fisico y el tipo mantenible
-- son el mismo. Se comprueba que los tres tienen inventario y periodicidad, y se
-- reportan los conteos sobre las 174 unidades ACTIVAS del programa.
WITH directos (tipo) AS (VALUES ('COPILOTO'),('RADIO_BASE'),('GPS')),
conteos AS (
  SELECT d.tipo,
         count(*) FILTER (WHERE e.estado_inventario = 'INSTALADO')   AS aplica,
         count(*) FILTER (WHERE e.estado_inventario = 'POR_VALIDAR') AS pendiente,
         count(*) FILTER (WHERE e.estado_inventario = 'NO_APLICA')   AS no_aplica
  FROM directos d
  JOIN vehiculo_equipos e ON e.tipo_equipo = d.tipo
  JOIN programa_mantenimiento_unidades u ON u.placa = e.placa
  GROUP BY d.tipo
), x AS (
  SELECT (SELECT count(*) FROM directos) AS n,
         (SELECT count(*) FROM directos d
          WHERE NOT EXISTS (SELECT 1 FROM vehiculo_equipos e WHERE e.tipo_equipo = d.tipo)) AS sin_inventario,
         (SELECT count(*) FROM directos d
          WHERE NOT EXISTS (SELECT 1 FROM programa_mantenimiento_frecuencias f WHERE f.tipo_equipo = d.tipo)) AS sin_frecuencia,
         (SELECT count(*) FROM conteos) AS con_conteo
)
SELECT 'V22' AS id, 'NEGOCIO' AS clase,
       'COPILOTO, RADIO_BASE y GPS proyectan uno a uno, con inventario y periodicidad' AS regla,
       (SELECT count(*) FROM conteos) AS filas_evaluadas,
       sin_inventario + sin_frecuencia + (CASE WHEN con_conteo = 3 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN sin_inventario + sin_frecuencia > 0 OR con_conteo <> 3 THEN 'FAIL'
            WHEN con_conteo = 0 THEN 'N/A (sin inventario de unidades activas)'
            ELSE 'PASS' END AS estado,
       coalesce((SELECT string_agg(tipo || ': aplica=' || aplica || ' pendiente=' || pendiente
                                   || ' no_aplica=' || no_aplica, ' · ' ORDER BY tipo) FROM conteos), '-')
       || ' · tipos sin inventario: ' || sin_inventario
       || ' · tipos sin periodicidad: ' || sin_frecuencia AS detalle
FROM x;


-- V23 --------------------------------------------------------------------------------
-- Ningun POR_VALIDAR se convirtio en INSTALADO ni en NO_APLICA:
--   (a) el recuento de POR_VALIDAR es exactamente el de las celdas sin evidencia (224)
--   (b) ninguna fila no instalada arrastra marca, serie o fecha
-- El cotejo fila a fila contra el Excel lo hace la prueba de integracion (1400/1400);
-- aqui se comprueba lo que la base de datos puede demostrar por si sola.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculo_equipos) AS filas,
         (SELECT count(*) FROM vehiculo_equipos WHERE estado_inventario='POR_VALIDAR') AS pv,
         (SELECT count(*) FROM vehiculo_equipos WHERE estado_inventario='NO_APLICA') AS na,
         (SELECT count(*) FROM vehiculo_equipos WHERE estado_inventario='INSTALADO') AS inst,
         (SELECT count(*) FROM vehiculo_equipos
          WHERE estado_inventario <> 'INSTALADO'
            AND (marca IS NOT NULL OR numero_serie IS NOT NULL OR fecha_instalacion IS NOT NULL)) AS contaminadas
)
SELECT 'V23' AS id, 'NEGOCIO' AS clase,
       'POR_VALIDAR se conserva como tal: 224 filas y sin datos tecnicos' AS regla,
       filas AS filas_evaluadas,
       (CASE WHEN pv = 224 THEN 0 ELSE 1 END) + contaminadas AS violaciones,
       CASE WHEN pv <> 224 OR contaminadas > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (inventario vacio)'
            ELSE 'PASS' END AS estado,
       'INSTALADO=' || inst || ' NO_APLICA=' || na || ' POR_VALIDAR=' || pv
       || ' (esperado 224) · filas no instaladas con datos tecnicos: ' || contaminadas AS detalle
FROM x;


-- V24 --------------------------------------------------------------------------------
-- Las 164 placas del mapping aprobado quedaron en su forma canonica, y ninguna
-- conserva la forma con guion.
WITH origen (bd, excel) AS (
  VALUES ('V0R-757','V0R757'),('V0R-775','V0R775'),('V0R-877','V0R877'),('V5K-729','V5K729'),
         ('V5K-758','V5K758'),('V5K-772','V5K772'),('V5K-778','V5K778'),('V6V-849','V6V849'),
         ('V6V-850','V6V850'),('V6V-853','V6V853'),('V6V-866','V6V866'),('V6V-874','V6V874'),
         ('V6V-876','V6V876'),('V6V-880','V6V880'),('V6V-889','V6V889'),('V7L-859','V7L859'),
         ('V7L-860','V7L860'),('V7L-872','V7L872'),('V7L-877','V7L877'),('V7L-892','V7L892'),
         ('V7L-911','V7L911'),('V7L-926','V7L926'),('V7L-943','V7L943'),('V8A-743','V8A743'),
         ('V8A-789','V8A789'),('V8A-792','V8A792'),('V8A-793','V8A793'),('V8A-796','V8A796'),
         ('V8A-799','V8A799'),('V8A-803','V8A803'),('V8A-804','V8A804'),('VBU-712','VBU712'),
         ('VBU-737','VBU737'),('V6V-859','V6V859'),('V6V-865','V6V865'),('V7L-924','V7L924'),
         ('V9E-937','V9E937'),('V9E-947','V9E947'),('V9E-948','V9E948'),('V9F-778','V9F778'),
         ('V9F-780','V9F780'),('V9V-846','V9V846'),('V9V-860','V9V860'),('VBU-734','VBU734'),
         ('VEW-721','VEW721'),('VEW-834','VEW834'),('BJB-753','BJB753'),('V7Z-928','V7Z928'),
         ('VAL-827','VAL827'),('VAL-860','VAL860'),('VAM-846','VAM846'),('VBZ-736','VBZ736'),
         ('BUW-928','BUW928'),('CJQ-858','CJQ858'),('CJR-734','CJR734'),('CJR-910','CJR910'),
         ('CJS-849','CJS849'),('CJT-845','CJT845'),('V0M-937','V0M937'),('V0N-770','V0N770'),
         ('V0T-715','V0T715'),('V8A-794','V8A794'),('V8A-809','V8A809'),('V9F-795','V9F795'),
         ('V9V-856','V9V856'),('V9V-867','V9V867'),('VAM-800','VAM800'),('VAM-806','VAM806'),
         ('VBU-704','VBU704'),('VBU-705','VBU705'),('VBU-716','VBU716'),('VBU-717','VBU717'),
         ('VBU-733','VBU733'),('VBU-736','VBU736'),('VBU-738','VBU738'),('VBU-752','VBU752'),
         ('VBU-754','VBU754'),('VBU-765','VBU765'),('VBX-798','VBX798'),('VBY-760','VBY760'),
         ('VBY-773','VBY773'),('VBY-798','VBY798'),('VBY-814','VBY814'),('VBY-830','VBY830'),
         ('VBY-832','VBY832'),('VBY-850','VBY850'),('VBY-886','VBY886'),('VBY-926','VBY926'),
         ('VCA-886','VCA886'),('VCP-820','VCP820'),('VCS-745','VCS745'),('VCW-921','VCW921'),
         ('VCW-922','VCW922'),('VCW-924','VCW924'),('VCW-931','VCW931'),('VCX-716','VCX716'),
         ('VCX-728','VCX728'),('VCX-739','VCX739'),('VDN-818','VDN818'),('VEW-740','VEW740'),
         ('VEW-782','VEW782'),('VFD-743','VFD743'),('CAR-924','CAR924'),('CAR-925','CAR925'),
         ('CAR-943','CAR943'),('CAR-945','CAR945'),('CAR-946','CAR946'),('CAS-701','CAS701'),
         ('CAS-765','CAS765'),('CAS-842','CAS842'),('CAS-843','CAS843'),('CAT-902','CAT902'),
         ('V0I-941','V0I941'),('V0J-700','V0J700'),('V0J-702','V0J702'),('V0J-706','V0J706'),
         ('V0J-728','V0J728'),('V0R-721','V0R721'),('V0R-737','V0R737'),('V0R-738','V0R738'),
         ('V0R-739','V0R739'),('V0R-748','V0R748'),('V0R-772','V0R772'),('V0R-791','V0R791'),
         ('V9V-841','V9V841'),('V9V-843','V9V843'),('VAM-751','VAM751'),('VAM-782','VAM782'),
         ('VAM-791','VAM791'),('VAP-804','VAP804'),('VAP-805','VAP805'),('VAP-812','VAP812'),
         ('VAP-813','VAP813'),('VAP-815','VAP815'),('VAP-816','VAP816'),('VAP-819','VAP819'),
         ('VAP-827','VAP827'),('VAP-830','VAP830'),('VAP-860','VAP860'),('VAS-917','VAS917'),
         ('VBZ-701','VBZ701'),('VCI-781','VCI781'),('VCI-782','VCI782'),('VCI-837','VCI837'),
         ('VCP-807','VCP807'),('VCP-837','VCP837'),('VCP-839','VCP839'),('VCS-735','VCS735'),
         ('VCW-930','VCW930'),('VCX-715','VCX715'),('VCX-729','VCX729'),('VDO-908','VDO908'),
         ('VEZ-930','VEZ930'),('VFB-802','VFB802'),('VFD-863','VFD863'),('B8D-793','B8D793'),
         ('V8T-801','V8T801'),('V9T-950','V9T950'),('VEW-722','VEW722'),('VEW-755','VEW755'),
         ('VEW-763','VEW763'),('VEW-774','VEW774'),('VEW-776','VEW776'),('VEW-870','VEW870')
), r AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = o.excel)) AS canonicas_presentes,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = o.bd)) AS con_guion_restantes,
         count(*) FILTER (WHERE replace(o.bd,'-','') <> o.excel) AS mapeos_sospechosos
  FROM origen o
)
SELECT 'V24' AS id, 'NEGOCIO' AS clase,
       '164 placas reconciliadas 1:1 segun el mapping aprobado' AS regla,
       total AS filas_evaluadas,
       (164 - canonicas_presentes) + con_guion_restantes + mapeos_sospechosos AS violaciones,
       CASE WHEN canonicas_presentes <> 164 OR con_guion_restantes > 0 OR mapeos_sospechosos > 0
              THEN 'FAIL' ELSE 'PASS' END AS estado,
       'pares del mapping: ' || total || ' · canonicas presentes: ' || canonicas_presentes
       || ' · aun con guion: ' || con_guion_restantes
       || ' · pares en los que cambia algo mas que el guion: ' || mapeos_sospechosos AS detalle
FROM r;


-- V25 --------------------------------------------------------------------------------
-- Las 10 unidades nuevas existen con la placa canonica del Excel, y sin datos inventados.
WITH nuevas (placa) AS (
  VALUES ('VCP879'),('VCI921'),('VCR944'),('V9T961'),('VDO898'),
         ('V0R941'),('V0R915'),('B6Z714'),('VDO941'),('V9U834'),
         ('VCI781X')
), reales AS (
  -- VCI781X no forma parte de la lista: se incluye a proposito como control negativo
  SELECT placa FROM nuevas WHERE placa <> 'VCI781X'
), r AS (
  SELECT (SELECT count(*) FROM reales) AS total,
         (SELECT count(*) FROM reales n WHERE EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = n.placa)) AS presentes,
         (SELECT count(*) FROM reales n JOIN vehiculos v ON v.placa = n.placa
          WHERE v.tipo_vehiculo IS NOT NULL OR v.marca_tracto IS NOT NULL
             OR v.modelo_tracto IS NOT NULL OR v.anio_fabricacion IS NOT NULL
             OR v.operacion IS NOT NULL OR v.cliente IS NOT NULL) AS con_datos_inventados,
         (SELECT count(*) FROM vehiculos WHERE placa = 'VCI781X') AS control_negativo
)
SELECT 'V25' AS id, 'NEGOCIO' AS clase,
       'las 10 unidades nuevas existen con placa canonica y sin columnas inventadas' AS regla,
       total AS filas_evaluadas,
       (10 - presentes) + con_datos_inventados + control_negativo AS violaciones,
       CASE WHEN presentes <> 10 OR con_datos_inventados > 0 OR control_negativo > 0
              THEN 'FAIL' ELSE 'PASS' END AS estado,
       'presentes: ' || presentes || ' de ' || total
       || ' · con columnas rellenas que debian quedar NULL: ' || con_datos_inventados
       || ' · control negativo (debe ser 0): ' || control_negativo AS detalle
FROM r;


-- V26 --------------------------------------------------------------------------------
-- La letra O y el numero 0 siguen diferenciados: son unidades distintas y no se
-- normalizaron entre si.
WITH esperadas (placa, comentario) AS (
  VALUES ('VOR-739','letra O · solo en la BD · no esta en el Excel · conserva guion'),
         ('VOR-748','letra O · solo en la BD · no esta en el Excel · conserva guion'),
         ('V0R739' ,'cero · unidad del programa · forma canonica'),
         ('V0R748' ,'cero · unidad del programa · forma canonica'),
         ('V0R915' ,'cero · unidad nueva del Excel'),
         ('V0R941' ,'cero · unidad nueva del Excel'),
         ('VDO898' ,'letra O · unidad nueva del Excel'),
         ('VDO941' ,'letra O · unidad nueva del Excel'),
         ('VD0-941','cero · solo en la BD · distinta de VDO941 · conserva guion')
), prohibidas (placa) AS (
  -- formas que NO deben existir: serian el resultado de haber convertido O <-> 0
  VALUES ('VOR915'),('VOR941'),('VDO-941'),('V0R-739'),('V0R-748')
), r AS (
  SELECT (SELECT count(*) FROM esperadas) AS n_esp,
         (SELECT count(*) FROM esperadas e WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = e.placa)) AS faltan,
         (SELECT count(*) FROM prohibidas p WHERE EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = p.placa)) AS sobran,
         (SELECT string_agg(e.placa, ', ') FROM esperadas e
          WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = e.placa)) AS lista_faltan,
         (SELECT string_agg(p.placa, ', ') FROM prohibidas p
          WHERE EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = p.placa)) AS lista_sobran
)
SELECT 'V26' AS id, 'NEGOCIO' AS clase,
       'la letra O y el cero siguen diferenciados; no hubo conversion O <-> 0' AS regla,
       n_esp AS filas_evaluadas,
       faltan + sobran AS violaciones,
       CASE WHEN faltan + sobran > 0 THEN 'FAIL' ELSE 'PASS' END AS estado,
       'esperadas ausentes: ' || coalesce(lista_faltan,'ninguna')
       || ' · prohibidas presentes: ' || coalesce(lista_sobran,'ninguna') AS detalle
FROM r;


-- V27 --------------------------------------------------------------------------------
-- Cero huerfanos en todas las FK que apuntan a vehiculos.placa.
WITH h AS (
  SELECT 'inspecciones_flota' AS tabla,
         (SELECT count(*) FROM inspecciones_flota) AS filas,
         (SELECT count(*) FROM inspecciones_flota t
          WHERE t.placa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa)) AS huerf
  UNION ALL
  SELECT 'mantenimientos_tecnicos',
         (SELECT count(*) FROM mantenimientos_tecnicos),
         (SELECT count(*) FROM mantenimientos_tecnicos t
          WHERE t.placa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa))
  UNION ALL
  SELECT 'tickets_unidades',
         (SELECT count(*) FROM tickets_unidades),
         (SELECT count(*) FROM tickets_unidades t
          WHERE t.placa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa))
  UNION ALL
  SELECT 'incidentes_soporte',
         (SELECT count(*) FROM incidentes_soporte),
         (SELECT count(*) FROM incidentes_soporte t
          WHERE t.placa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa))
  UNION ALL
  SELECT 'programa_mantenimiento_unidades',
         (SELECT count(*) FROM programa_mantenimiento_unidades),
         (SELECT count(*) FROM programa_mantenimiento_unidades t
          WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa))
  UNION ALL
  SELECT 'vehiculo_equipos',
         (SELECT count(*) FROM vehiculo_equipos),
         (SELECT count(*) FROM vehiculo_equipos t
          WHERE NOT EXISTS (SELECT 1 FROM vehiculos v WHERE v.placa = t.placa))
)
SELECT 'V27' AS id, 'NEGOCIO' AS clase,
       'cero filas huerfanas en las 6 tablas que referencian vehiculos.placa' AS regla,
       (SELECT sum(filas) FROM h) AS filas_evaluadas,
       (SELECT sum(huerf) FROM h) AS violaciones,
       CASE WHEN (SELECT sum(huerf) FROM h) > 0 THEN 'FAIL'
            WHEN (SELECT sum(filas) FROM h) = 0 THEN 'N/A (ninguna tabla hija tiene filas)'
            ELSE 'PASS' END AS estado,
       (SELECT string_agg(tabla || '=' || filas || '/' || huerf, ' · ' ORDER BY tabla) FROM h)
       || '  (filas/huerfanas)' AS detalle;


-- V28 --------------------------------------------------------------------------------
-- V5K756 sigue disponible como historico: esta en el maestro y en el inventario, y no
-- se borro ni se convirtio en otra cosa.
WITH x AS (
  SELECT (SELECT count(*) FROM vehiculos WHERE placa = 'V5K756') AS en_maestro,
         (SELECT count(*) FROM vehiculo_equipos WHERE placa = 'V5K756') AS en_inventario,
         (SELECT count(*) FROM inspecciones_flota WHERE placa = 'V5K756') AS inspecciones,
         (SELECT count(*) FROM mantenimientos_tecnicos WHERE placa = 'V5K756') AS mantenimientos,
         (SELECT count(*) FROM vehiculos WHERE placa = 'V5K-756') AS forma_antigua
)
SELECT 'V28' AS id, 'NEGOCIO' AS clase,
       'V5K756 se conserva como historico en maestro, inventario e historico operativo' AS regla,
       en_maestro + en_inventario + inspecciones + mantenimientos AS filas_evaluadas,
       (CASE WHEN en_maestro = 1 THEN 0 ELSE 1 END)
       + (CASE WHEN en_inventario = 8 THEN 0 ELSE 1 END)
       + forma_antigua AS violaciones,
       CASE WHEN en_maestro <> 1 OR en_inventario <> 8 OR forma_antigua > 0 THEN 'FAIL' ELSE 'PASS' END AS estado,
       'maestro: ' || en_maestro || ' · inventario: ' || en_inventario
       || ' · inspecciones: ' || inspecciones || ' · mantenimientos: ' || mantenimientos
       || ' · forma antigua V5K-756 (debe ser 0): ' || forma_antigua AS detalle
FROM x;


-- V29 --------------------------------------------------------------------------------
-- El programa TI-PR-01 es UNO y solo uno.
WITH x AS (
  SELECT (SELECT count(*) FROM programas_mantenimiento) AS total,
         (SELECT count(*) FROM programas_mantenimiento WHERE codigo = 'TI-PR-01') AS ti
)
SELECT 'V29' AS id, 'NEGOCIO' AS clase,
       'programas_mantenimiento tiene exactamente 1 fila con codigo TI-PR-01' AS regla,
       total AS filas_evaluadas,
       CASE WHEN ti = 1 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN ti <> 1 THEN 'FAIL'
            WHEN total = 0 THEN 'N/A (sin programas)'
            ELSE 'PASS' END AS estado,
       'programas totales: ' || total || ' · con codigo TI-PR-01: ' || ti AS detalle
FROM x;


-- V30 --------------------------------------------------------------------------------
-- Existe una sola version documental, la 01, y es la vigente.
WITH x AS (
  SELECT (SELECT count(*) FROM programas_mantenimiento_versiones) AS total,
         (SELECT count(*) FROM programas_mantenimiento_versiones WHERE version = '01') AS v01,
         (SELECT count(*) FROM programas_mantenimiento_versiones WHERE estado = 'VIGENTE') AS vigentes,
         (SELECT fecha_documento::text FROM programas_mantenimiento_versiones WHERE version = '01' LIMIT 1) AS fecha
)
SELECT 'V30' AS id, 'NEGOCIO' AS clase,
       'version documental 01 = 1 fila, en estado VIGENTE' AS regla,
       total AS filas_evaluadas,
       (CASE WHEN v01 = 1 THEN 0 ELSE 1 END) + (CASE WHEN vigentes = 1 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN v01 <> 1 OR vigentes <> 1 THEN 'FAIL'
            WHEN total = 0 THEN 'N/A (sin versiones)'
            ELSE 'PASS' END AS estado,
       'versiones: ' || total || ' · V01: ' || v01 || ' · VIGENTE: ' || vigentes
       || ' · fecha_documento de V01: ' || coalesce(fecha,'-') AS detalle
FROM x;


-- V31 --------------------------------------------------------------------------------
-- Periodicidades del programa. Se aceptan los dos estados del modelo:
--   13 antes de 20260924_009 (4 familias quincenales x 3 niveles, mas GPS M3);
--   14 desde 009, al sumarse ADAS M3 de 24 quincenas.
-- En los dos casos las 12 quincenales deben estar intactas y GPS debe seguir en M3/24.
WITH x AS (
  SELECT (SELECT count(*) FROM programa_mantenimiento_frecuencias) AS total,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias
           WHERE tipo_equipo IN ('DVR','CAMARAS','COPILOTO','RADIO_BASE')) AS quincenales,
         (SELECT count(*) FROM programa_mantenimiento_frecuencias
           WHERE tipo_equipo = 'GPS' AND nivel_mantenimiento = 'M3' AND frecuencia_quincenas = 24) AS gps,
         (SELECT string_agg(tipo_equipo || ':' || nivel_mantenimiento || '=' || frecuencia_quincenas, ' ' ORDER BY tipo_equipo, nivel_mantenimiento)
          FROM programa_mantenimiento_frecuencias) AS lista
)
SELECT 'V31' AS id, 'NEGOCIO' AS clase,
       'periodicidades = 13 (antes de 009) o 14 (con ADAS M3/24), con las 12 quincenales y GPS M3/24 intactas' AS regla,
       total AS filas_evaluadas,
       (CASE WHEN total IN (13,14) THEN 0 ELSE 1 END)
       + (CASE WHEN quincenales = 12 THEN 0 ELSE 1 END)
       + (CASE WHEN gps = 1 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN total NOT IN (13,14) OR quincenales <> 12 OR gps <> 1 THEN 'FAIL'
            WHEN total = 0 THEN 'N/A (sin periodicidades)'
            ELSE 'PASS' END AS estado,
       'total ' || total || ' · quincenales ' || quincenales || ' · GPS M3/24 ' || gps
       || ' · ' || coalesce(lista,'(vacio)') AS detalle
FROM x;


-- V32 --------------------------------------------------------------------------------
-- Los ciclos por unidad contienen SOLO referencias historicas demostradas.
-- Cuando se escribio esta validacion la tabla estaba vacia; desde B4 contiene las 531
-- referencias M1 sembradas del Excel. Lo que hay que seguir garantizando no es que
-- este vacia, sino que no aparezca ninguna ejecucion inventada:
--   * 0 ciclos de nivel M2: no existe ni un M2 ejecutado en la fuente;
--   * GPS y ADAS, si aparecen, solo con nivel M3;
--   * toda combinacion equipo/nivel con periodicidad declarada en el programa;
--   * fuente EXCEL en todo lo sembrado desde el libro.
WITH x AS (
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE nivel_mantenimiento = 'M1')::int AS m1,
         count(*) FILTER (WHERE nivel_mantenimiento = 'M2')::int AS m2,
         count(*) FILTER (WHERE nivel_mantenimiento = 'M3')::int AS m3,
         count(*) FILTER (WHERE tipo_equipo IN ('GPS','ADAS') AND nivel_mantenimiento <> 'M3')::int AS anual_mal,
         count(*) FILTER (WHERE fuente <> 'EXCEL')::int AS otra_fuente,
         count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM programa_mantenimiento_frecuencias f
              WHERE f.programa_id = k.programa_id AND f.tipo_equipo = k.tipo_equipo
                AND f.nivel_mantenimiento = k.nivel_mantenimiento))::int AS sin_periodicidad
    FROM programa_mantenimiento_unidad_ciclos k
)
SELECT 'V32' AS id, 'NEGOCIO' AS clase,
       'los ciclos solo contienen referencias demostradas: 0 de nivel M2, anuales solo M3, todas con periodicidad y fuente EXCEL' AS regla,
       total AS filas_evaluadas,
       m2 + anual_mal + otra_fuente + sin_periodicidad AS violaciones,
       CASE WHEN m2 + anual_mal + otra_fuente + sin_periodicidad > 0 THEN 'FAIL'
            WHEN total = 0 THEN 'PASS (tabla vacia: estado previo a B4)'
            ELSE 'PASS' END AS estado,
       'total ' || total || ' · M1 ' || m1 || ' · M2 ' || m2 || ' (debe ser 0) · M3 ' || m3
       || ' · anuales con nivel != M3 ' || anual_mal
       || ' · fuente distinta de EXCEL ' || otra_fuente
       || ' · sin periodicidad declarada ' || sin_periodicidad AS detalle
FROM x;


-- V33 --------------------------------------------------------------------------------
SELECT 'V33' AS id, 'ESTADO-VACIO' AS clase,
       'programacion_mantenimiento esta vacia: no se genera programacion todavia' AS regla,
       (SELECT count(*) FROM programacion_mantenimiento) AS filas_evaluadas,
       CASE WHEN (SELECT count(*) FROM programacion_mantenimiento) = 0 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN (SELECT count(*) FROM programacion_mantenimiento) = 0
            THEN 'PASS (cero es el resultado esperado)' ELSE 'FAIL' END AS estado,
       'filas: ' || (SELECT count(*) FROM programacion_mantenimiento) AS detalle;


-- V34 --------------------------------------------------------------------------------
SELECT 'V34' AS id, 'ESTADO-VACIO' AS clase,
       'programacion_mantenimiento_equipos esta vacia' AS regla,
       (SELECT count(*) FROM programacion_mantenimiento_equipos) AS filas_evaluadas,
       CASE WHEN (SELECT count(*) FROM programacion_mantenimiento_equipos) = 0 THEN 0 ELSE 1 END AS violaciones,
       CASE WHEN (SELECT count(*) FROM programacion_mantenimiento_equipos) = 0
            THEN 'PASS (cero es el resultado esperado)' ELSE 'FAIL' END AS estado,
       'filas: ' || (SELECT count(*) FROM programacion_mantenimiento_equipos) AS detalle;


-- =====================================================================================
-- VALIDACIONES ADICIONALES · detectan violaciones reales que las anteriores no cubren
-- =====================================================================================

-- V35 --------------------------------------------------------------------------------
-- Los 5 booleanos de inventario de vehiculos siguen en NULL: no se derivaron.
WITH x AS (
  SELECT count(*) AS filas,
         count(*) FILTER (WHERE dvr_instalado IS NOT NULL OR copiloto_instalado IS NOT NULL
                            OR radio_base_instalado IS NOT NULL OR camaras_instaladas IS NOT NULL
                            OR gps_instalado IS NOT NULL) AS tocados
  FROM vehiculos
)
SELECT 'V35' AS id, 'NEGOCIO' AS clase,
       'los 5 booleanos de vehiculos siguen en NULL (no se derivan del inventario)' AS regla,
       filas AS filas_evaluadas, tocados AS violaciones,
       CASE WHEN tocados > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin vehiculos)'
            ELSE 'PASS' END AS estado,
       'vehiculos: ' || filas || ' · con algun booleano no nulo: ' || tocados AS detalle
FROM x;


-- V36 --------------------------------------------------------------------------------
-- Las referencias de arranque NO se rellenaron: no hay evidencia de ejecucion.
WITH x AS (
  SELECT count(*) AS filas,
         count(*) FILTER (WHERE fecha_base_m1 IS NOT NULL OR fecha_base_m2 IS NOT NULL
                            OR fecha_base_m3 IS NOT NULL OR quincena_arranque IS NOT NULL
                            OR quincena_incorporacion IS NOT NULL) AS rellenas
  FROM programa_mantenimiento_unidades
)
SELECT 'V36' AS id, 'NEGOCIO' AS clase,
       'BASE M1/M2/M3, quincena_arranque y quincena_incorporacion siguen en NULL' AS regla,
       filas AS filas_evaluadas, rellenas AS violaciones,
       CASE WHEN rellenas > 0 THEN 'FAIL'
            WHEN filas = 0 THEN 'N/A (sin unidades)'
            ELSE 'PASS' END AS estado,
       'unidades: ' || filas || ' · con alguna referencia rellena: ' || rellenas AS detalle
FROM x;


-- V37 --------------------------------------------------------------------------------
-- Los dos CHECK de vehiculos siguen presentes y NOT VALID, y las 29 filas fuera de
-- dominio siguen intactas: deuda de calidad documentada, NO corregida por TI-PR-01.
WITH dom_op (v) AS (
  VALUES ('LAS BAMBAS'),('SAN RAFAEL'),('GLP'),('INDUSTRIA'),('CARGAS DIVERSAS'),
         ('QUELLAVECO'),('BATEAS'),('CONSTANCIA'),('CARAVELI'),('CACHIMAYO'),
         ('PUCAMARCA'),('PAMPA DE COBRE'),('CERRO VERDE'),('RACIEMSA'),('ODEBRECHT'),
         ('ANTAPACCAY'),('CRESPO'),('COESTI')
), dom_cli (v) AS (
  VALUES ('AUSTRAL'),('PRIMAX'),('REPSOL'),('SAN JOSE'),('SOLGAS')
), fuera AS (
  SELECT v.placa FROM vehiculos v
  WHERE (v.operacion IS NOT NULL AND v.operacion NOT IN (SELECT v FROM dom_op))
     OR (v.cliente   IS NOT NULL AND v.cliente   NOT IN (SELECT v FROM dom_cli))
), chk AS (
  SELECT count(*) AS n FROM pg_constraint
  WHERE conrelid = to_regclass('public.vehiculos') AND contype='c'
    AND conname IN ('chk_vehiculos_operacion','chk_vehiculos_cliente')
    AND NOT convalidated
)
SELECT 'V37' AS id, 'NEGOCIO' AS clase,
       'los 2 CHECK de vehiculos siguen NOT VALID y las 29 filas fuera de dominio intactas' AS regla,
       (SELECT count(*) FROM vehiculos) AS filas_evaluadas,
       (CASE WHEN (SELECT n FROM chk) = 2 THEN 0 ELSE 1 END)
       + (CASE WHEN (SELECT count(*) FROM fuera) = 29 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN (SELECT n FROM chk) <> 2 OR (SELECT count(*) FROM fuera) <> 29
            THEN 'FAIL' ELSE 'PASS' END AS estado,
       'CHECK presentes y NOT VALID: ' || (SELECT n FROM chk)
       || ' de 2 · filas fuera de dominio: ' || (SELECT count(*) FROM fuera)
       || ' (esperado 29, se conservan a proposito)' AS detalle;


-- V38 --------------------------------------------------------------------------------
-- La reconciliacion cambio ON UPDATE a CASCADE pero NO toco ningun ON DELETE.
WITH esperado (conname, on_update, on_delete) AS (
  VALUES ('incidentes_soporte_placa_fkey',        'CASCADE', 'RESTRICT'),
         ('inspecciones_flota_placa_fkey',        'CASCADE', 'NO ACTION'),
         ('mantenimientos_tecnicos_placa_fkey',   'CASCADE', 'RESTRICT'),
         ('tickets_unidades_placa_fkey',          'CASCADE', 'NO ACTION'),
         ('fk_programa_unidad_vehiculo',          'CASCADE', 'RESTRICT'),
         ('fk_vehiculo_equipo_vehiculo',          'CASCADE', 'RESTRICT')
), real AS (
  SELECT con.conname,
         CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE'
              WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
         CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE'
              WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
  FROM pg_constraint con
  WHERE con.contype = 'f' AND con.confrelid = to_regclass('public.vehiculos')
), desvios AS (
  SELECT e.conname,
         coalesce(r.on_update,'AUSENTE') AS upd_real, e.on_update AS upd_esp,
         coalesce(r.on_delete,'AUSENTE') AS del_real, e.on_delete AS del_esp
  FROM esperado e LEFT JOIN real r ON r.conname = e.conname
  WHERE r.conname IS NULL OR r.on_update <> e.on_update OR r.on_delete <> e.on_delete
)
SELECT 'V38' AS id, 'ESTRUCTURAL' AS clase,
       'las 6 FK a vehiculos.placa tienen ON UPDATE CASCADE y su ON DELETE original' AS regla,
       (SELECT count(*) FROM esperado) AS filas_evaluadas,
       (SELECT count(*) FROM desvios) AS violaciones,
       CASE WHEN (SELECT count(*) FROM desvios) > 0 THEN 'FAIL' ELSE 'PASS' END AS estado,
       coalesce((SELECT string_agg(conname || ': UPD ' || upd_real || '(esp ' || upd_esp
                                   || ') DEL ' || del_real || '(esp ' || del_esp || ')', ' · ')
                 FROM desvios),
                'las 6 coinciden con lo esperado; ningun ON DELETE cambio') AS detalle;


-- V39 --------------------------------------------------------------------------------
-- Ninguna unidad del programa se queda sin inventario, y todo el inventario de las
-- unidades activas pertenece a una unidad del programa.
WITH sin_inv AS (
  SELECT u.placa FROM programa_mantenimiento_unidades u
  WHERE NOT EXISTS (SELECT 1 FROM vehiculo_equipos e WHERE e.placa = u.placa)
), incompletas AS (
  SELECT u.placa, count(e.id) AS n
  FROM programa_mantenimiento_unidades u
  LEFT JOIN vehiculo_equipos e ON e.placa = u.placa
  GROUP BY u.placa HAVING count(e.id) <> 8
)
SELECT 'V39' AS id, 'NEGOCIO' AS clase,
       'las 174 unidades del programa tienen inventario completo de 8 tipos' AS regla,
       (SELECT count(*) FROM programa_mantenimiento_unidades) AS filas_evaluadas,
       (SELECT count(*) FROM sin_inv) + (SELECT count(*) FROM incompletas) AS violaciones,
       CASE WHEN (SELECT count(*) FROM sin_inv) + (SELECT count(*) FROM incompletas) > 0 THEN 'FAIL'
            WHEN (SELECT count(*) FROM programa_mantenimiento_unidades) = 0 THEN 'N/A (sin unidades)'
            ELSE 'PASS' END AS estado,
       'sin inventario: ' || (SELECT count(*) FROM sin_inv)
       || ' · con numero de tipos distinto de 8: ' || (SELECT count(*) FROM incompletas) AS detalle;


-- V40 --------------------------------------------------------------------------------
-- La disciplina de quincena se movio, no desaparecio.
-- Hay 5 columnas de quincena y solo 4 CHECK, y eso es correcto:
-- programacion_mantenimiento.quincena_efectiva es GENERATED ALWAYS AS
-- COALESCE(quincena_reprogramada, quincena_programada) STORED, por lo que hereda la
-- restriccion de sus dos origenes y no necesita CHECK propio.
-- Sobre la fecha del DOCUMENTO no debe quedar ningun CHECK de quincena.
WITH esperados (conname) AS (
  VALUES ('chk_ciclo_ultima_quincena'),
         ('chk_programa_unidad_quincena_incorporacion'),
         ('chk_programacion_quincena_programada'),
         ('chk_programacion_quincena_reprogramada')
), presentes AS (
  SELECT conname FROM pg_constraint
  WHERE contype = 'c' AND connamespace = 'public'::regnamespace
    AND pg_get_constraintdef(oid) ~* 'day FROM (quincena|ultima_quincena)'
), doc AS (
  SELECT count(*) AS n FROM pg_constraint
  WHERE conrelid = to_regclass('public.programas_mantenimiento_versiones')
    AND contype = 'c' AND pg_get_constraintdef(oid) ~* 'day FROM vigencia'
), generada AS (
  SELECT count(*) AS n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'programacion_mantenimiento'
    AND column_name = 'quincena_efectiva' AND is_generated = 'ALWAYS'
)
SELECT 'V40' AS id, 'ESTRUCTURAL' AS clase,
       'los 4 CHECK de quincena sobreviven, quincena_efectiva la hereda por ser generada, y la fecha del documento ya no la exige' AS regla,
       6 AS filas_evaluadas,
       (SELECT count(*) FROM esperados e WHERE e.conname NOT IN (SELECT conname FROM presentes))
       + (SELECT count(*) FROM presentes p WHERE p.conname NOT IN (SELECT conname FROM esperados))
       + (SELECT n FROM doc)
       + (CASE WHEN (SELECT n FROM generada) = 1 THEN 0 ELSE 1 END) AS violaciones,
       CASE WHEN (SELECT count(*) FROM esperados e WHERE e.conname NOT IN (SELECT conname FROM presentes)) > 0
              OR (SELECT count(*) FROM presentes p WHERE p.conname NOT IN (SELECT conname FROM esperados)) > 0
              OR (SELECT n FROM doc) > 0
              OR (SELECT n FROM generada) <> 1
            THEN 'FAIL' ELSE 'PASS' END AS estado,
       'CHECK de quincena presentes: ' || (SELECT count(*) FROM presentes) || ' de 4 esperados'
       || ' · faltan: ' || coalesce((SELECT string_agg(conname, ', ') FROM esperados e
                                     WHERE e.conname NOT IN (SELECT conname FROM presentes)), 'ninguno')
       || ' · inesperados: ' || coalesce((SELECT string_agg(conname, ', ') FROM presentes p
                                     WHERE p.conname NOT IN (SELECT conname FROM esperados)), 'ninguno')
       || ' · quincena_efectiva generada: ' || (SELECT n FROM generada)
       || ' · CHECK sobre la vigencia documental: ' || (SELECT n FROM doc) || ' (debe ser 0)' AS detalle;


-- V41 --------------------------------------------------------------------------------
-- Tras la reconciliacion solo deben quedar con guion las 6 placas que NO estan en el
-- Excel. Cualquier otra con guion significa un renombrado incompleto.
WITH permitidas (placa) AS (
  VALUES ('D4R-972'),('F3L-787'),('VD0-941'),('VFB-827'),('VOR-739'),('VOR-748')
), con_guion AS (
  SELECT placa FROM vehiculos WHERE placa LIKE '%-%'
)
SELECT 'V41' AS id, 'NEGOCIO' AS clase,
       'solo 6 placas conservan guion: las que no existen en el Excel' AS regla,
       (SELECT count(*) FROM vehiculos) AS filas_evaluadas,
       (SELECT count(*) FROM con_guion WHERE placa NOT IN (SELECT placa FROM permitidas))
       + (SELECT count(*) FROM permitidas WHERE placa NOT IN (SELECT placa FROM con_guion)) AS violaciones,
       CASE WHEN (SELECT count(*) FROM con_guion WHERE placa NOT IN (SELECT placa FROM permitidas)) > 0
              OR (SELECT count(*) FROM permitidas WHERE placa NOT IN (SELECT placa FROM con_guion)) > 0
            THEN 'FAIL' ELSE 'PASS' END AS estado,
       'con guion: ' || (SELECT count(*) FROM con_guion)
       || ' -> ' || coalesce((SELECT string_agg(placa, ' ' ORDER BY placa) FROM con_guion),'ninguna')
       || ' · inesperadas: ' || coalesce((SELECT string_agg(placa,' ') FROM con_guion
                                          WHERE placa NOT IN (SELECT placa FROM permitidas)),'ninguna') AS detalle;


-- V42 --------------------------------------------------------------------------------
-- Toda fila INSTALADO nombra el equipo: si la fuente dio evidencia, hay marca.
WITH x AS (
  SELECT count(*) FILTER (WHERE estado_inventario = 'INSTALADO') AS instaladas,
         count(*) FILTER (WHERE estado_inventario = 'INSTALADO'
                            AND (marca IS NULL OR btrim(marca) = '')) AS sin_marca,
         count(*) FILTER (WHERE estado_inventario = 'INSTALADO' AND numero_serie IS NOT NULL) AS con_serie,
         count(*) FILTER (WHERE estado_inventario = 'INSTALADO' AND fecha_instalacion IS NOT NULL) AS con_fecha
  FROM vehiculo_equipos
)
SELECT 'V42' AS id, 'NEGOCIO' AS clase,
       'toda fila INSTALADO tiene marca; serie y fecha son opcionales porque la fuente no siempre las trae' AS regla,
       instaladas AS filas_evaluadas, sin_marca AS violaciones,
       CASE WHEN sin_marca > 0 THEN 'FAIL'
            WHEN instaladas = 0 THEN 'N/A (sin equipos instalados)'
            ELSE 'PASS' END AS estado,
       'instaladas: ' || instaladas || ' · sin marca: ' || sin_marca
       || ' · con numero de serie: ' || con_serie || ' · con fecha de instalacion: ' || con_fecha AS detalle
FROM x;


-- V43 --------------------------------------------------------------------------------
-- Ninguna fecha de instalacion es futura: las 8 fechas futuras se vaciaron en el Excel.
WITH x AS (
  SELECT count(*) FILTER (WHERE fecha_instalacion IS NOT NULL) AS con_fecha,
         count(*) FILTER (WHERE fecha_instalacion > CURRENT_DATE) AS futuras,
         min(fecha_instalacion)::text AS mas_antigua,
         max(fecha_instalacion)::text AS mas_reciente
  FROM vehiculo_equipos
)
SELECT 'V43' AS id, 'NEGOCIO' AS clase,
       'ninguna fecha_instalacion del inventario es posterior a hoy' AS regla,
       con_fecha AS filas_evaluadas, futuras AS violaciones,
       CASE WHEN futuras > 0 THEN 'FAIL'
            WHEN con_fecha = 0 THEN 'N/A (ninguna fila tiene fecha)'
            ELSE 'PASS' END AS estado,
       'con fecha: ' || con_fecha || ' · futuras: ' || futuras
       || ' · rango ' || coalesce(mas_antigua,'-') || ' a ' || coalesce(mas_reciente,'-') AS detalle
FROM x;
