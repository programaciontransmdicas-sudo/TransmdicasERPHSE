-- ============================================================
-- TI-PR-01  Consultas de validacion. NO EJECUTADAS todavia.
--
-- BLOQUE A: solo lectura. Se ejecuta DESPUES de aplicar el DDL para
--           comprobar que todo quedo como se espera.
-- BLOQUE B: pruebas de comportamiento. Escriben, pero dentro de una
--           transaccion que termina en ROLLBACK. Requiere autorizacion expresa.
-- ============================================================


-- ============================================================
-- BLOQUE A  (SOLO LECTURA)
-- ============================================================

-- A1. Las tres tablas existen y son tablas normales
SELECT c.relname AS tabla, c.relkind, pg_get_userbyid(c.relowner) AS propietario
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('programas_mantenimiento',
                    'programa_mantenimiento_unidades',
                    'programacion_mantenimiento')
ORDER BY 1;
-- Esperado: 3 filas, relkind = 'r'


-- A2. Columnas y tipos: identity en los id, timestamptz en las marcas de tiempo
SELECT c.table_name, c.ordinal_position, c.column_name,
       format_type(a.atttypid, a.atttypmod) AS tipo,
       c.is_nullable, a.attidentity AS identidad, c.column_default
FROM information_schema.columns c
JOIN pg_attribute a
  ON a.attrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
 AND a.attname = c.column_name
WHERE c.table_schema = 'public'
  AND c.table_name IN ('programas_mantenimiento',
                       'programa_mantenimiento_unidades',
                       'programacion_mantenimiento')
ORDER BY c.table_name, c.ordinal_position;
-- Esperado: id -> integer con attidentity = 'd'
--           created_at / updated_at -> timestamp with time zone, NOT NULL, default CURRENT_TIMESTAMP
--           fechas de negocio -> date


-- A3. Todas las restricciones creadas (PK, FK, UNIQUE, CHECK)
SELECT conrelid::regclass::text AS tabla,
       CASE contype WHEN 'p' THEN 'PK' WHEN 'f' THEN 'FK'
                    WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK'
                    ELSE contype::text END AS tipo,
       conname, pg_get_constraintdef(oid) AS definicion, convalidated AS validada
FROM pg_constraint
WHERE conrelid IN ('programas_mantenimiento'::regclass,
                   'programa_mantenimiento_unidades'::regclass,
                   'programacion_mantenimiento'::regclass)
ORDER BY 1, 2, 3;
-- Esperado: 3 PK, 3 FK, 3 UNIQUE y 7 CHECK propios (mas los NOT NULL que PG18 lista como 'n').
--           Todas con validada = true.


-- A4. Las tres FK apuntan a donde deben y con las acciones decididas
SELECT conname,
       conrelid::regclass::text  AS tabla_hija,
       confrelid::regclass::text AS tabla_padre,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid IN ('programa_mantenimiento_unidades'::regclass,
                   'programacion_mantenimiento'::regclass)
ORDER BY 1;
-- Esperado: fk_programa_unidad_programa    -> programas_mantenimiento(id)        ON UPDATE CASCADE ON DELETE RESTRICT
--           fk_programa_unidad_vehiculo    -> vehiculos(placa)                   ON UPDATE CASCADE ON DELETE RESTRICT
--           fk_programacion_mantenimiento_unidad -> programa_mantenimiento_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT


-- A5. Indices: los implicitos de PK/UNIQUE mas los tres explicitos
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('programas_mantenimiento',
                    'programa_mantenimiento_unidades',
                    'programacion_mantenimiento')
ORDER BY tablename, indexname;
-- Esperado: 9 indices en total
--   programas_mantenimiento:          _pkey, uq_..._codigo_periodo_version
--   programa_mantenimiento_unidades:  _pkey, uq_programa_mantenimiento_unidad, idx_..._placa
--   programacion_mantenimiento:       _pkey, uq_..._unidad_fecha, idx_..._fecha, idx_..._estado_fecha


-- A6. Ningun indice invalido
SELECT i.indexrelid::regclass::text AS indice, i.indisvalid
FROM pg_index i
WHERE i.indrelid IN ('programas_mantenimiento'::regclass,
                     'programa_mantenimiento_unidades'::regclass,
                     'programacion_mantenimiento'::regclass)
  AND NOT i.indisvalid;
-- Esperado: 0 filas


-- A7. Triggers y funcion de updated_at
SELECT t.tgname, t.tgrelid::regclass::text AS tabla,
       p.proname AS funcion, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND t.tgrelid IN ('programas_mantenimiento'::regclass,
                    'programa_mantenimiento_unidades'::regclass,
                    'programacion_mantenimiento'::regclass)
ORDER BY 1;
-- Esperado: 3 triggers BEFORE UPDATE FOR EACH ROW -> set_updated_at()

SELECT p.proname, pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'set_updated_at';
-- Esperado: 1 fila, con SET search_path


-- A8. Confirmar que NO se toco nada existente
SELECT column_name, format_type(a.atttypid, a.atttypmod) AS tipo
FROM information_schema.columns c
JOIN pg_attribute a ON a.attrelid = 'public.vehiculos'::regclass AND a.attname = c.column_name
WHERE c.table_schema = 'public' AND c.table_name = 'vehiculos'
ORDER BY c.ordinal_position;
-- Esperado: exactamente placa, tipo_vehiculo, marca_tracto, modelo_tracto,
--           anio_fabricacion, operacion, cliente  (7 columnas, sin cambios)

SELECT count(*)::int AS columnas_mantenimientos_tecnicos
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mantenimientos_tecnicos';
-- Esperado: 15, igual que antes


-- A9. Las tablas nuevas nacen vacias
SELECT 'programas_mantenimiento' AS tabla, count(*)::int AS filas FROM programas_mantenimiento
UNION ALL SELECT 'programa_mantenimiento_unidades', count(*)::int FROM programa_mantenimiento_unidades
UNION ALL SELECT 'programacion_mantenimiento',      count(*)::int FROM programacion_mantenimiento;
-- Esperado: 0, 0, 0


-- ============================================================
-- BLOQUE B  (PRUEBAS DE COMPORTAMIENTO, TERMINAN EN ROLLBACK)
-- Escriben datos temporales. Ejecutar solo con autorizacion expresa.
-- Sustituir <PLACA_REAL> por una placa existente en vehiculos.
-- ============================================================

BEGIN;

-- B1. Alta de un programa y una unidad
INSERT INTO programas_mantenimiento
    (codigo, nombre, periodo_inicio, periodo_fin, version, fecha_documento,
     frecuencia_m1_dias, frecuencia_m2_dias, frecuencia_m3_dias)
VALUES ('TI-PR-01', 'Programa de Mantenimiento de Equipos Tecnologicos',
        '2026-09-01', '2026-12-31', 'v1', '2026-09-01', 15, 90, 180)
RETURNING id, estado, created_at, updated_at;

INSERT INTO programa_mantenimiento_unidades (programa_id, placa, quincena_arranque)
SELECT id, '<PLACA_REAL>', '2026-09-01' FROM programas_mantenimiento WHERE codigo = 'TI-PR-01'
RETURNING id, programa_id, placa;

-- B2. El UNIQUE por unidad y fecha debe impedir dos niveles el mismo dia.
--     Este es el comportamiento buscado: con prioridad M3 > M2 > M1 solo se
--     inserta el de mayor jerarquia.
INSERT INTO programacion_mantenimiento (programa_unidad_id, fecha_programada, nivel_mantenimiento)
SELECT id, '2026-11-30', 'M2' FROM programa_mantenimiento_unidades WHERE placa = '<PLACA_REAL>';

-- Debe fallar con violacion de uq_programacion_mantenimiento_unidad_fecha:
INSERT INTO programacion_mantenimiento (programa_unidad_id, fecha_programada, nivel_mantenimiento)
SELECT id, '2026-11-30', 'M1' FROM programa_mantenimiento_unidades WHERE placa = '<PLACA_REAL>';

ROLLBACK;


-- B3. Trigger de updated_at (transaccion aparte, tambien con ROLLBACK)
BEGIN;
INSERT INTO programas_mantenimiento
    (codigo, nombre, periodo_inicio, periodo_fin, version, fecha_documento,
     frecuencia_m1_dias, frecuencia_m2_dias, frecuencia_m3_dias)
VALUES ('TI-PR-01-TEST', 'Prueba updated_at', '2026-09-01', '2026-12-31', 'v1', '2026-09-01', 15, 90, 180);

SELECT created_at, updated_at, updated_at = created_at AS iguales_al_crear
FROM programas_mantenimiento WHERE codigo = 'TI-PR-01-TEST';

UPDATE programas_mantenimiento SET nombre = 'Prueba updated_at (modificada)'
WHERE codigo = 'TI-PR-01-TEST';

SELECT created_at, updated_at, updated_at > created_at AS updated_at_avanzo
FROM programas_mantenimiento WHERE codigo = 'TI-PR-01-TEST';
-- Esperado: updated_at_avanzo = true

ROLLBACK;


-- B4. FK y sus acciones (transaccion aparte, con ROLLBACK)
BEGIN;
-- Debe fallar: placa inexistente
INSERT INTO programa_mantenimiento_unidades (programa_id, placa)
SELECT id, 'ZZZ-000' FROM programas_mantenimiento LIMIT 1;
ROLLBACK;

BEGIN;
-- Debe fallar por ON DELETE RESTRICT si la placa esta incluida en un programa
DELETE FROM vehiculos WHERE placa = '<PLACA_REAL>';
ROLLBACK;
