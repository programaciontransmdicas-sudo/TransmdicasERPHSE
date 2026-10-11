-- ============================================================
-- TI-PR-01  VALIDACION de la normalizacion por equipos y quincenas
-- Acompana a 20260918_002_..._expand.sql. NO EJECUTADO todavia.
--
-- TODAS las consultas de este archivo son SOLO LECTURA (SELECT).
-- No modifica datos ni estructura. Puede ejecutarse cuantas veces haga falta.
--
-- USO:
--   BLOQUE 1 (V1-V4)   tras la FASE A: comprobar que la expansion quedo bien.
--   BLOQUE 2 (V5-V13)  tras la FASE B: comprobar datos y coherencia.
--   BLOQUE 3 (V14)     antes de la FASE D: control de perdida de informacion.
--
-- La FASE D no debe ejecutarse mientras V7, V9, V10, V12, V13 y V14
-- no devuelvan cero filas.
-- ============================================================


-- ============================================================
-- BLOQUE 1 - DESPUES DE LA FASE A (estructura)
-- ============================================================

-- V1. Las tres tablas nuevas existen y son tablas normales
SELECT c.relname AS tabla, c.relkind
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('programa_mantenimiento_frecuencias',
                    'programa_mantenimiento_unidad_ciclos',
                    'programacion_mantenimiento_equipos')
ORDER BY 1;
-- Esperado: 3 filas, relkind = 'r'


-- V2. Columnas nuevas, tipos, nulabilidad y columna generada
SELECT c.table_name, c.column_name,
       format_type(a.atttypid, a.atttypmod) AS tipo,
       c.is_nullable, a.attgenerated AS generada, a.attidentity AS identidad
FROM information_schema.columns c
JOIN pg_attribute a
  ON a.attrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
 AND a.attname = c.column_name
WHERE c.table_schema = 'public'
  AND (
        c.table_name IN ('programa_mantenimiento_frecuencias',
                         'programa_mantenimiento_unidad_ciclos',
                         'programacion_mantenimiento_equipos')
     OR (c.table_name = 'vehiculos'
         AND c.column_name IN ('dvr_instalado','copiloto_instalado',
                               'radio_base_instalado','camaras_instaladas','gps_instalado'))
     OR (c.table_name = 'programa_mantenimiento_unidades'
         AND c.column_name = 'quincena_incorporacion')
     OR (c.table_name = 'programacion_mantenimiento'
         AND c.column_name IN ('programa_id','quincena_programada',
                               'quincena_reprogramada','quincena_efectiva'))
      )
ORDER BY c.table_name, c.ordinal_position;
-- Esperado: los 5 boolean de vehiculos nullable y sin default;
--           quincena_efectiva con attgenerated = 's';
--           los id de las tablas nuevas con attidentity = 'd'.


-- V3. Restricciones creadas y su estado de validacion
SELECT conrelid::regclass::text AS tabla,
       CASE contype WHEN 'p' THEN 'PK' WHEN 'f' THEN 'FK'
                    WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK'
                    WHEN 'n' THEN 'NOT NULL' ELSE contype::text END AS tipo,
       conname, convalidated, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN ('programa_mantenimiento_frecuencias'::regclass,
                   'programa_mantenimiento_unidad_ciclos'::regclass,
                   'programacion_mantenimiento_equipos'::regclass,
                   'programacion_mantenimiento'::regclass,
                   'programa_mantenimiento_unidades'::regclass)
ORDER BY 1, 2, 3;
-- Esperado tras FASE A: 4 restricciones con convalidated = false
--   fk_programacion_unidad_programa
--   chk_programa_unidad_quincena_incorporacion
--   chk_programacion_quincena_programada
--   chk_programacion_quincena_reprogramada
-- Esperado tras FASE D: todas en true.
-- Las tablas hijas NO deben tener CHECK propios de tipo_equipo ni nivel_mantenimiento.


-- V4. Indices de las tablas afectadas (incluido el unico parcial)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('programa_mantenimiento_frecuencias',
                    'programa_mantenimiento_unidad_ciclos',
                    'programacion_mantenimiento_equipos',
                    'programacion_mantenimiento',
                    'programa_mantenimiento_unidades')
ORDER BY 1, 2;
-- Esperado: uq_programacion_unidad_quincena_efectiva con WHERE estado <> 'CANCELADO'


-- ============================================================
-- BLOQUE 2 - DESPUES DE LA FASE B (datos y coherencia)
-- ============================================================

-- V5. Referencias de ciclo PENDIENTES DE CARGA
--     Solo se exigen para equipos confirmados como instalados (= TRUE).
SELECT u.placa, f.tipo_equipo, f.nivel_mantenimiento
FROM programa_mantenimiento_unidades u
JOIN vehiculos v ON v.placa = u.placa
JOIN programa_mantenimiento_frecuencias f ON f.programa_id = u.programa_id
LEFT JOIN programa_mantenimiento_unidad_ciclos c
       ON c.programa_unidad_id = u.id
      AND c.tipo_equipo = f.tipo_equipo
      AND c.nivel_mantenimiento = f.nivel_mantenimiento
WHERE c.id IS NULL
  AND CASE f.tipo_equipo
        WHEN 'DVR'        THEN v.dvr_instalado
        WHEN 'COPILOTO'   THEN v.copiloto_instalado
        WHEN 'RADIO_BASE' THEN v.radio_base_instalado
        WHEN 'CAMARAS'    THEN v.camaras_instaladas
        WHEN 'GPS'        THEN v.gps_instalado
      END IS TRUE
ORDER BY 1, 2, 3;
-- No es un error: es la lista exacta de lo que falta cargar.
-- NO se rellena con fechas inventadas.


-- V6. Inventario de equipos: cobertura y pendientes
SELECT count(*)::int AS vehiculos,
       count(*) FILTER (WHERE dvr_instalado        IS NULL)::int AS dvr_pendiente,
       count(*) FILTER (WHERE copiloto_instalado   IS NULL)::int AS copiloto_pendiente,
       count(*) FILTER (WHERE radio_base_instalado IS NULL)::int AS radio_base_pendiente,
       count(*) FILTER (WHERE camaras_instaladas   IS NULL)::int AS camaras_pendiente,
       count(*) FILTER (WHERE gps_instalado        IS NULL)::int AS gps_pendiente
FROM vehiculos;
-- NULL significa inventario pendiente, nunca "no tiene".


-- V7. Frecuencias cargadas por programa
SELECT programa_id, tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
FROM programa_mantenimiento_frecuencias
ORDER BY programa_id, tipo_equipo, nivel_mantenimiento;
-- Esperado para TI-PR-01: 13 filas
--   DVR/COPILOTO/RADIO_BASE/CAMARAS -> M1=1, M2=6, M3=12
--   GPS -> M3=24

-- V7b. Programas con frecuencias incompletas (debe dar 0 filas)
SELECT p.id, p.codigo, p.version, count(f.id)::int AS filas_frecuencia
FROM programas_mantenimiento p
LEFT JOIN programa_mantenimiento_frecuencias f ON f.programa_id = p.id
WHERE p.estado = 'ACTIVO'
GROUP BY 1, 2, 3
HAVING count(f.id) <> 13;


-- V8. GPS solo M3 (debe dar 0 filas; la BD ya lo impide)
SELECT 'frecuencias' AS origen, programa_id, tipo_equipo, nivel_mantenimiento
FROM programa_mantenimiento_frecuencias
WHERE tipo_equipo = 'GPS' AND nivel_mantenimiento <> 'M3'
UNION ALL
SELECT 'ciclos', programa_id, tipo_equipo, nivel_mantenimiento
FROM programa_mantenimiento_unidad_ciclos
WHERE tipo_equipo = 'GPS' AND nivel_mantenimiento <> 'M3'
UNION ALL
SELECT 'programacion', programa_id, tipo_equipo, nivel_mantenimiento
FROM programacion_mantenimiento_equipos
WHERE tipo_equipo = 'GPS' AND nivel_mantenimiento <> 'M3';


-- V9. Quincenas mal ancladas (debe dar 0 filas)
SELECT 'programacion.quincena_programada' AS campo, id::text AS referencia
FROM programacion_mantenimiento
WHERE quincena_programada IS NOT NULL
  AND EXTRACT(DAY FROM quincena_programada) NOT IN (1, 16)
UNION ALL
SELECT 'programacion.quincena_reprogramada', id::text
FROM programacion_mantenimiento
WHERE quincena_reprogramada IS NOT NULL
  AND EXTRACT(DAY FROM quincena_reprogramada) NOT IN (1, 16)
UNION ALL
SELECT 'unidades.quincena_incorporacion', id::text
FROM programa_mantenimiento_unidades
WHERE quincena_incorporacion IS NOT NULL
  AND EXTRACT(DAY FROM quincena_incorporacion) NOT IN (1, 16)
UNION ALL
SELECT 'ciclos.ultima_quincena', id::text
FROM programa_mantenimiento_unidad_ciclos
WHERE EXTRACT(DAY FROM ultima_quincena) NOT IN (1, 16);


-- V10. Visitas duplicadas por quincena efectiva, ignorando las canceladas
--      (debe dar 0 filas; el indice unico parcial ya lo impide)
SELECT programa_unidad_id, quincena_efectiva, count(*)::int AS visitas
FROM programacion_mantenimiento
WHERE estado <> 'CANCELADO'
  AND quincena_efectiva IS NOT NULL
GROUP BY 1, 2
HAVING count(*) > 1;


-- V11. Equipos programados que la unidad no tiene o cuyo inventario esta pendiente
SELECT u.placa, p.quincena_efectiva, e.tipo_equipo, e.nivel_mantenimiento,
       CASE e.tipo_equipo
         WHEN 'DVR'        THEN v.dvr_instalado
         WHEN 'COPILOTO'   THEN v.copiloto_instalado
         WHEN 'RADIO_BASE' THEN v.radio_base_instalado
         WHEN 'CAMARAS'    THEN v.camaras_instaladas
         WHEN 'GPS'        THEN v.gps_instalado
       END AS instalado
FROM programacion_mantenimiento_equipos e
JOIN programacion_mantenimiento p      ON p.id = e.programacion_id
JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
JOIN vehiculos v                       ON v.placa = u.placa
WHERE CASE e.tipo_equipo
        WHEN 'DVR'        THEN v.dvr_instalado
        WHEN 'COPILOTO'   THEN v.copiloto_instalado
        WHEN 'RADIO_BASE' THEN v.radio_base_instalado
        WHEN 'CAMARAS'    THEN v.camaras_instaladas
        WHEN 'GPS'        THEN v.gps_instalado
      END IS DISTINCT FROM true
ORDER BY 1, 2, 3;
-- Distingue NULL (pendiente) de FALSE (confirmado que no lo tiene): ambos se listan.


-- V12. Coherencia de referencias acumulativas
--      M2 satisface M1 y M3 satisface M2 y M1, por lo que debe cumplirse
--      ref(M1) >= ref(M2) >= ref(M3) para el mismo equipo. (debe dar 0 filas)
WITH ref AS (
  SELECT programa_unidad_id, tipo_equipo,
         max(ultima_quincena) FILTER (WHERE nivel_mantenimiento = 'M1') AS m1,
         max(ultima_quincena) FILTER (WHERE nivel_mantenimiento = 'M2') AS m2,
         max(ultima_quincena) FILTER (WHERE nivel_mantenimiento = 'M3') AS m3
  FROM programa_mantenimiento_unidad_ciclos
  GROUP BY 1, 2
)
SELECT *
FROM ref
WHERE (m1 IS NOT NULL AND m2 IS NOT NULL AND m1 < m2)
   OR (m2 IS NOT NULL AND m3 IS NOT NULL AND m2 < m3);


-- V13. El detalle guardado no corresponde al nivel mayor que vencia
--      Solo es concluyente mientras la visita siga PROGRAMADO: despues de
--      ejecutarla, las referencias de ciclo ya avanzaron. (debe dar 0 filas)
WITH visita AS (
  SELECT p.id, p.programa_unidad_id, p.programa_id,
         (EXTRACT(YEAR  FROM p.quincena_efectiva) * 24
        + (EXTRACT(MONTH FROM p.quincena_efectiva) - 1) * 2
        + CASE WHEN EXTRACT(DAY FROM p.quincena_efectiva) >= 16 THEN 1 ELSE 0 END)::int AS idx
  FROM programacion_mantenimiento p
  WHERE p.estado = 'PROGRAMADO'
    AND p.quincena_efectiva IS NOT NULL
),
vencidos AS (
  SELECT v.id AS programacion_id, c.tipo_equipo, c.nivel_mantenimiento
  FROM visita v
  JOIN programa_mantenimiento_unidad_ciclos c
    ON c.programa_unidad_id = v.programa_unidad_id
  JOIN programa_mantenimiento_frecuencias f
    ON f.programa_id = v.programa_id
   AND f.tipo_equipo = c.tipo_equipo
   AND f.nivel_mantenimiento = c.nivel_mantenimiento
  WHERE (EXTRACT(YEAR  FROM c.ultima_quincena) * 24
       + (EXTRACT(MONTH FROM c.ultima_quincena) - 1) * 2
       + CASE WHEN EXTRACT(DAY FROM c.ultima_quincena) >= 16 THEN 1 ELSE 0 END)::int
        + f.frecuencia_quincenas <= v.idx
),
maximo AS (
  SELECT programacion_id, tipo_equipo,
         max(CASE nivel_mantenimiento WHEN 'M3' THEN 3 WHEN 'M2' THEN 2 ELSE 1 END) AS nivel_max
  FROM vencidos
  GROUP BY 1, 2
)
SELECT e.programacion_id, e.tipo_equipo,
       e.nivel_mantenimiento AS nivel_guardado,
       CASE m.nivel_max WHEN 3 THEN 'M3' WHEN 2 THEN 'M2' ELSE 'M1' END AS nivel_esperado
FROM programacion_mantenimiento_equipos e
JOIN maximo m
  ON m.programacion_id = e.programacion_id
 AND m.tipo_equipo = e.tipo_equipo
WHERE CASE e.nivel_mantenimiento WHEN 'M3' THEN 3 WHEN 'M2' THEN 2 ELSE 1 END <> m.nivel_max;


-- ============================================================
-- BLOQUE 3 - ANTES DE LA FASE D (control de perdida de informacion)
-- ============================================================

-- V14. Nada puede quedar sin migrar antes de eliminar columnas.
--      Las cinco lineas deben dar 0.
SELECT 'frecuencias en cabecera sin migrar' AS control, count(*)::int AS filas
FROM programas_mantenimiento p
WHERE (p.frecuencia_m1_dias IS NOT NULL
    OR p.frecuencia_m2_dias IS NOT NULL
    OR p.frecuencia_m3_dias IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM programa_mantenimiento_frecuencias f
                  WHERE f.programa_id = p.id)

UNION ALL
SELECT 'fechas base sin ciclo equivalente', count(*)::int
FROM programa_mantenimiento_unidades u
WHERE (u.fecha_base_m1 IS NOT NULL
    OR u.fecha_base_m2 IS NOT NULL
    OR u.fecha_base_m3 IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM programa_mantenimiento_unidad_ciclos c
                  WHERE c.programa_unidad_id = u.id)

UNION ALL
SELECT 'quincena_arranque sin quincena_incorporacion', count(*)::int
FROM programa_mantenimiento_unidades
WHERE quincena_arranque IS NOT NULL
  AND quincena_incorporacion IS NULL

UNION ALL
SELECT 'visitas con nivel sin detalle por equipo', count(*)::int
FROM programacion_mantenimiento p
WHERE p.nivel_mantenimiento IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM programacion_mantenimiento_equipos e
                  WHERE e.programacion_id = p.id)

UNION ALL
SELECT 'visitas sin programa_id o sin quincena_programada', count(*)::int
FROM programacion_mantenimiento
WHERE programa_id IS NULL
   OR quincena_programada IS NULL;


-- V15. Comprobacion de que la FASE A no altero lo existente
SELECT (SELECT count(*)::int FROM vehiculos)               AS vehiculos,
       (SELECT count(*)::int FROM inspecciones_flota)      AS inspecciones_flota,
       (SELECT count(*)::int FROM mantenimientos_tecnicos) AS mantenimientos_tecnicos,
       (SELECT count(*)::int FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'inspecciones_flota')      AS columnas_inspecciones,
       (SELECT count(*)::int FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'mantenimientos_tecnicos') AS columnas_mantenimientos;
-- Esperado: 172 / 346 / 148 / 11 / 15  (valores medidos antes de la FASE A)
