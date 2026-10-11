-- ============================================================
-- TI-PR-01  VALIDACION DEL VERSIONADO DEL PROGRAMA
-- Acompana a 20260922_003_ti_pr_01_versionado_programa_expand.sql
--
-- TODAS las consultas de este archivo son SOLO LECTURA.
-- No contiene INSERT, UPDATE, DELETE, ALTER, CREATE, DROP ni
-- TRUNCATE. Puede ejecutarse cuantas veces haga falta, en
-- cualquier momento, sin efectos.
--
-- CONVENCION DE LECTURA
--   Salvo que el bloque diga otra cosa, el resultado correcto es
--   CERO FILAS. Cada fila devuelta es una incidencia concreta que
--   hay que resolver antes de continuar.
--   Los bloques estructurales (V1, V2, V8, V18) son la excepcion:
--   devuelven una fila descriptiva y se leen por su contenido.
--
-- CUANDO EJECUTAR
--   V1-V12, V16-V18, V20   despues de la FASE V-A (003).
--   V13-V15, V19, V21, V22 despues de la FASE V-B, cuando existan
--                          datos. Antes devolveran cero filas por
--                          tablas vacias, lo cual NO prueba nada.
--
-- AVISO SOBRE V9
--   V9 usa programa_mantenimiento_frecuencias.programa_id, columna
--   que la FASE V-G elimina. A partir de esa fase V9 dejara de
--   poder ejecutarse, y dejara de hacer falta: su garantia pasa a
--   ser estructural.
-- ============================================================


-- ============================================================
-- BLOQUE 1 - ESTRUCTURA (despues de la FASE V-A)
-- ============================================================

-- ------------------------------------------------------------
-- V1. La tabla de versiones existe y es una tabla normal.
--     Esperado: 1 fila con relkind = 'r'.
--     Lectura:  0 filas => la FASE V-A no se aplico.
-- ------------------------------------------------------------
SELECT c.relname AS tabla,
       c.relkind,
       (SELECT count(*) FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columnas
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname = 'programas_mantenimiento_versiones';


-- ------------------------------------------------------------
-- V2. programas_mantenimiento tiene UNIQUE (codigo).
--     Esperado: 1 fila, definicion UNIQUE (codigo).
--     Lectura:  0 filas => un mismo programa podria duplicarse.
--               Es la garantia que sustituye a la clave antigua
--               (codigo, periodo_inicio, version) que retira la
--               FASE V-G: comprobarla ANTES de ejecutar el cleanup.
-- ------------------------------------------------------------
SELECT conname,
       pg_get_constraintdef(oid) AS definicion,
       convalidated
FROM pg_constraint
WHERE conrelid = 'public.programas_mantenimiento'::regclass
  AND contype = 'u'
  AND conname = 'uq_programas_mantenimiento_codigo';


-- ------------------------------------------------------------
-- V8. programa_mantenimiento_frecuencias.version_id es NOT NULL.
--     Esperado: 1 fila con is_nullable = 'NO'.
--     Lectura:  'YES' => reaparecen los dos huecos que el 003
--               cierra: varias filas con version_id NULL para el
--               mismo equipo/nivel, y la FK compuesta omitida por
--               MATCH SIMPLE.
-- ------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'programa_mantenimiento_frecuencias'
  AND column_name = 'version_id';


-- ------------------------------------------------------------
-- V18. El modelo admite el estado PROYECTADO.
--      Esperado: 1 fila con admite_proyectado = true.
--      Lectura:  false => el generador no podra distinguir una
--                proyeccion recalculable de un compromiso
--                confirmado, y la regla de recalculo por cambio de
--                version deja de ser expresable.
-- ------------------------------------------------------------
SELECT conname,
       pg_get_constraintdef(oid) LIKE '%PROYECTADO%' AS admite_proyectado,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname = 'chk_programacion_mantenimiento_estado';


-- ============================================================
-- BLOQUE 2 - COHERENCIA DE PROGRAMAS Y VERSIONES
-- ============================================================

-- ------------------------------------------------------------
-- V3. No existen dos programas con el mismo codigo.
--     Esperado: 0 filas.
--     Lectura:  cada fila es un codigo duplicado. Con el modelo
--               corregido TI-PR-01 debe ser una sola fila en la
--               tabla; dos significa que se volvio a crear un
--               programa por version.
-- ------------------------------------------------------------
SELECT codigo, count(*) AS veces, array_agg(id ORDER BY id) AS ids
FROM programas_mantenimiento
GROUP BY codigo
HAVING count(*) > 1;


-- ------------------------------------------------------------
-- V4. No existen versiones duplicadas por (programa_id, version).
--     Esperado: 0 filas.
--     Lectura:  dos filas 'V01' del mismo programa. Lo impide
--               uq_version_programa_version; una fila aqui
--               significaria que esa clave no existe.
-- ------------------------------------------------------------
SELECT programa_id, version, count(*) AS veces, array_agg(id ORDER BY id) AS ids
FROM programas_mantenimiento_versiones
GROUP BY programa_id, version
HAVING count(*) > 1;


-- ------------------------------------------------------------
-- V5. No hay solapamiento entre versiones OPERATIVAS del mismo
--     programa. Operativa = estado VIGENTE o SUPERSEDIDA.
--     Esperado: 0 filas.
--     Lectura:  cada fila es un par de versiones que se pisan. El
--               intervalo es semiabierto [desde, hasta), de modo
--               que el contacto exacto (hasta de una = desde de la
--               siguiente) NO es solapamiento y no debe aparecer.
--               Lo impide exc_version_vigencia_sin_solape.
-- ------------------------------------------------------------
SELECT a.programa_id,
       a.id AS version_a_id, a.version AS version_a, a.estado AS estado_a,
       a.vigencia_desde AS desde_a, a.vigencia_hasta AS hasta_a,
       b.id AS version_b_id, b.version AS version_b, b.estado AS estado_b,
       b.vigencia_desde AS desde_b, b.vigencia_hasta AS hasta_b
FROM programas_mantenimiento_versiones a
JOIN programas_mantenimiento_versiones b
  ON b.programa_id = a.programa_id
 AND b.id > a.id
WHERE a.estado IN ('VIGENTE','SUPERSEDIDA')
  AND b.estado IN ('VIGENTE','SUPERSEDIDA')
  AND daterange(a.vigencia_desde, a.vigencia_hasta, '[)')
   && daterange(b.vigencia_desde, b.vigencia_hasta, '[)')
ORDER BY a.programa_id, a.vigencia_desde;


-- ------------------------------------------------------------
-- V6. Toda vigencia esta anclada a quincena: dia 1 o dia 16.
--     Esperado: 0 filas.
--     Lectura:  una version que empieza o termina a mitad de
--               quincena parte esa quincena en dos y deja sin
--               respuesta unica la pregunta "que version rige la
--               quincena X". Lo impide chk_version_vigencia_quincena.
-- ------------------------------------------------------------
SELECT id, programa_id, version, estado,
       vigencia_desde, EXTRACT(day FROM vigencia_desde) AS dia_desde,
       vigencia_hasta, EXTRACT(day FROM vigencia_hasta) AS dia_hasta
FROM programas_mantenimiento_versiones
WHERE EXTRACT(day FROM vigencia_desde) NOT IN (1, 16)
   OR (vigencia_hasta IS NOT NULL
       AND EXTRACT(day FROM vigencia_hasta) NOT IN (1, 16))
ORDER BY programa_id, vigencia_desde;


-- ------------------------------------------------------------
-- V7. Ninguna version tiene vigencia_hasta <= vigencia_desde.
--     Esperado: 0 filas.
--     Lectura:  con intervalo semiabierto, hasta = desde produce un
--               rango VACIO: una version que no rige ningun dia.
--               Lo impide chk_version_vigencia.
-- ------------------------------------------------------------
SELECT id, programa_id, version, estado, vigencia_desde, vigencia_hasta,
       (vigencia_hasta - vigencia_desde) AS dias
FROM programas_mantenimiento_versiones
WHERE vigencia_hasta IS NOT NULL
  AND vigencia_hasta <= vigencia_desde
ORDER BY programa_id, vigencia_desde;


-- ------------------------------------------------------------
-- V20. La consulta canonica devuelve como mucho UNA version.
--      Se prueba en las fechas donde podria fallar: los propios
--      limites de vigencia de cada version, que es donde un
--      intervalo mal cerrado produciria dos respuestas.
--      Esperado: 0 filas.
--      Lectura:  cada fila es una fecha con mas de una version
--                aplicable. Con el EXCLUDE activo no deberia
--                ocurrir nunca.
-- ------------------------------------------------------------
WITH fechas_criticas AS (
    SELECT programa_id, vigencia_desde AS fecha
    FROM programas_mantenimiento_versiones
    UNION
    SELECT programa_id, vigencia_hasta
    FROM programas_mantenimiento_versiones
    WHERE vigencia_hasta IS NOT NULL
    UNION
    SELECT programa_id, vigencia_desde - 1
    FROM programas_mantenimiento_versiones
)
SELECT f.programa_id,
       f.fecha,
       count(v.id) AS versiones_aplicables,
       array_agg(v.version ORDER BY v.version) AS versiones
FROM fechas_criticas f
JOIN programas_mantenimiento_versiones v
  ON v.programa_id = f.programa_id
 AND v.estado IN ('VIGENTE','SUPERSEDIDA')
 AND v.vigencia_desde <= f.fecha
 AND (v.vigencia_hasta IS NULL OR v.vigencia_hasta > f.fecha)
GROUP BY f.programa_id, f.fecha
HAVING count(v.id) > 1
ORDER BY f.programa_id, f.fecha;


-- ============================================================
-- BLOQUE 3 - FRECUENCIAS POR VERSION
-- ============================================================

-- ------------------------------------------------------------
-- V9. La frecuencia y su version pertenecen al mismo programa.
--     *** SOLO EJECUTABLE ANTES DE LA FASE V-G ***
--     Despues del cleanup la columna programa_id ya no existe y
--     esta consulta fallara con 42703. No es un error: la garantia
--     pasa a ser estructural al desaparecer la columna.
--     Esperado: 0 filas.
--     Lectura:  una frecuencia que dice ser del programa A citando
--               una version del programa B. Lo impide
--               fk_frecuencia_version_programa.
-- ------------------------------------------------------------
SELECT f.id AS frecuencia_id,
       f.programa_id AS programa_de_la_frecuencia,
       v.programa_id AS programa_de_la_version,
       v.id AS version_id, v.version,
       f.tipo_equipo, f.nivel_mantenimiento
FROM programa_mantenimiento_frecuencias f
JOIN programas_mantenimiento_versiones v ON v.id = f.version_id
WHERE f.programa_id <> v.programa_id
ORDER BY f.id;


-- ------------------------------------------------------------
-- V10. No hay duplicados de (version_id, tipo_equipo, nivel).
--      Esperado: 0 filas.
--      Lectura:  dos periodicidades distintas para el mismo equipo
--                y nivel dentro de una misma version: el generador
--                no sabria cual aplicar. Lo impide
--                uq_frecuencia_version_equipo_nivel.
-- ------------------------------------------------------------
SELECT version_id, tipo_equipo, nivel_mantenimiento,
       count(*) AS veces,
       array_agg(frecuencia_quincenas ORDER BY id) AS frecuencias
FROM programa_mantenimiento_frecuencias
GROUP BY version_id, tipo_equipo, nivel_mantenimiento
HAVING count(*) > 1;


-- ------------------------------------------------------------
-- V11. El GPS solo admite nivel M3.
--      Esperado: 0 filas.
--      Lectura:  regla del documento TI-PR-01: "El GPS solo tiene
--                mantenimiento preventivo anual". Lo impide
--                chk_frecuencia_gps_solo_m3.
-- ------------------------------------------------------------
SELECT id, version_id, tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
FROM programa_mantenimiento_frecuencias
WHERE tipo_equipo = 'GPS'
  AND nivel_mantenimiento <> 'M3'
ORDER BY id;


-- ------------------------------------------------------------
-- V12. Toda periodicidad es estrictamente positiva.
--      Esperado: 0 filas.
--      Lectura:  una frecuencia de 0 quincenas haria que el
--                proximo mantenimiento cayera en la misma quincena
--                que el anterior, en bucle. Lo impide
--                chk_frecuencia_quincenas.
-- ------------------------------------------------------------
SELECT id, version_id, tipo_equipo, nivel_mantenimiento, frecuencia_quincenas
FROM programa_mantenimiento_frecuencias
WHERE frecuencia_quincenas IS NULL
   OR frecuencia_quincenas <= 0
ORDER BY id;


-- ============================================================
-- BLOQUE 4 - PROGRAMACION Y SU VERSION  (tras la FASE V-B)
-- ============================================================

-- ------------------------------------------------------------
-- V13. La version de una programacion pertenece al mismo programa
--      que su unidad y que la propia programacion.
--      Esperado: 0 filas.
--      Lectura:  se comprueban las tres identidades a la vez.
--                Lo impiden fk_programacion_version y
--                fk_programacion_unidad_programa.
-- ------------------------------------------------------------
SELECT p.id AS programacion_id,
       p.programa_id AS programa_de_la_visita,
       u.programa_id AS programa_de_la_unidad,
       v.programa_id AS programa_de_la_version,
       v.version,
       p.quincena_efectiva
FROM programacion_mantenimiento p
JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
JOIN programas_mantenimiento_versiones v ON v.id = p.version_programa_id
WHERE p.version_programa_id IS NOT NULL
  AND (v.programa_id <> u.programa_id
       OR p.programa_id IS DISTINCT FROM u.programa_id)
ORDER BY p.id;


-- ------------------------------------------------------------
-- V14. El detalle por equipo usa la MISMA version que su visita.
--      Esperado: 0 filas.
--      Lectura:  un detalle calculado con una version distinta a la
--                de su propia visita rompe la trazabilidad SIG del
--                registro. Lo impide
--                fk_programacion_equipo_visita_version.
-- ------------------------------------------------------------
SELECT e.id AS detalle_id,
       e.programacion_id,
       e.version_programa_id AS version_del_detalle,
       p.version_programa_id AS version_de_la_visita,
       e.tipo_equipo, e.nivel_mantenimiento
FROM programacion_mantenimiento_equipos e
JOIN programacion_mantenimiento p ON p.id = e.programacion_id
WHERE e.version_programa_id IS DISTINCT FROM p.version_programa_id
ORDER BY e.id;


-- ------------------------------------------------------------
-- V15. La combinacion (version, equipo, nivel) del detalle esta
--      declarada como frecuencia de esa version.
--      Esperado: 0 filas.
--      Lectura:  un detalle que programa un equipo/nivel que esa
--                version no contempla. Lo impide
--                fk_programacion_equipo_frecuencia_version.
-- ------------------------------------------------------------
SELECT e.id AS detalle_id,
       e.programacion_id,
       e.version_programa_id,
       e.tipo_equipo,
       e.nivel_mantenimiento
FROM programacion_mantenimiento_equipos e
WHERE e.version_programa_id IS NOT NULL
  AND NOT EXISTS (
        SELECT 1
        FROM programa_mantenimiento_frecuencias f
        WHERE f.version_id = e.version_programa_id
          AND f.tipo_equipo = e.tipo_equipo
          AND f.nivel_mantenimiento = e.nivel_mantenimiento)
ORDER BY e.id;


-- ------------------------------------------------------------
-- V19. Una unidad no tiene dos visitas activas en la misma
--      quincena efectiva. Activa = cualquier estado salvo
--      CANCELADO, incluido PROYECTADO.
--      Esperado: 0 filas.
--      Lectura:  lo impide el indice parcial
--                uq_programacion_unidad_quincena_efectiva.
--                Una proyeccion y una visita confirmada compiten
--                por la misma quincena: promover una proyeccion es
--                un UPDATE de estado, nunca un INSERT nuevo.
-- ------------------------------------------------------------
SELECT p.programa_unidad_id,
       u.placa,
       p.quincena_efectiva,
       count(*) AS visitas,
       array_agg(p.id ORDER BY p.id) AS ids,
       array_agg(p.estado ORDER BY p.id) AS estados
FROM programacion_mantenimiento p
JOIN programa_mantenimiento_unidades u ON u.id = p.programa_unidad_id
WHERE p.estado <> 'CANCELADO'
GROUP BY p.programa_unidad_id, u.placa, p.quincena_efectiva
HAVING count(*) > 1
ORDER BY u.placa, p.quincena_efectiva;


-- ------------------------------------------------------------
-- V21. Ninguna programacion activa se apoya en una version
--      BORRADOR o ANULADA.
--      Esperado: 0 filas.
--      Lectura:  una version en borrador todavia no es aplicable y
--                una anulada dejo de serlo; en ambos casos la
--                programacion quedo apoyada en reglas que no rigen.
--                NO es un constraint: la FK solo exige que la
--                version exista, no que sea operativa. Por eso hay
--                que vigilarlo aqui.
--                Regla de negocio asociada: una version que ya tuvo
--                ejecuciones no se ANULA, se marca SUPERSEDIDA.
-- ------------------------------------------------------------
SELECT p.id AS programacion_id,
       p.estado AS estado_programacion,
       p.quincena_efectiva,
       v.id AS version_id,
       v.version,
       v.estado AS estado_version
FROM programacion_mantenimiento p
JOIN programas_mantenimiento_versiones v ON v.id = p.version_programa_id
WHERE v.estado IN ('BORRADOR','ANULADA')
  AND p.estado <> 'CANCELADO'
ORDER BY v.estado, p.id;


-- ------------------------------------------------------------
-- V22. Coherencia de la version registrada en lo YA EJECUTADO.
--
--      LIMITE DE LO QUE EL ESQUEMA PUEDE PROBAR, dicho claramente:
--      no existe historial de cambios de version_programa_id, asi
--      que es IMPOSIBLE demostrar que ese valor "fue alterado".
--      Lo que si es comprobable es que su valor ACTUAL sea
--      incoherente con la vigencia de la version que nombra, que es
--      la huella que dejaria una alteracion posterior, un cambio
--      retroactivo de fechas de vigencia, o un fallo del generador.
--
--      V22.a  ejecutadas cuya version NO cubre su quincena efectiva
--      Esperado: 0 filas.
--      Lectura:  la regla es que la version aplicada es la vigente
--                para la quincena efectiva. Una ejecutada que la
--                incumple indica que alguien movio la vigencia
--                despues de ejecutar, o que el generador asigno mal.
--                La excepcion de reduccion retroactiva NO aparece
--                aqui: esa visita conserva la fecha calculada con la
--                version anterior, que SI cubre esa quincena.
-- ------------------------------------------------------------
SELECT p.id AS programacion_id,
       p.estado,
       p.quincena_efectiva,
       v.version,
       v.estado AS estado_version,
       v.vigencia_desde,
       v.vigencia_hasta
FROM programacion_mantenimiento p
JOIN programas_mantenimiento_versiones v ON v.id = p.version_programa_id
WHERE p.estado = 'EJECUTADO'
  AND NOT (v.vigencia_desde <= p.quincena_efectiva
           AND (v.vigencia_hasta IS NULL
                OR v.vigencia_hasta > p.quincena_efectiva))
ORDER BY p.id;


-- ------------------------------------------------------------
-- V22.b  ejecutadas SIN version registrada.
--        Esperado: 0 filas.
--        Lectura:  una visita ejecutada sin version pierde para
--                  siempre la trazabilidad de con que reglas se
--                  calculo. Mientras version_programa_id sea
--                  nullable, la base no lo impide; tras la FASE V-G
--                  pasa a ser imposible por NOT NULL.
-- ------------------------------------------------------------
SELECT p.id AS programacion_id,
       p.estado,
       p.quincena_efectiva,
       p.programa_unidad_id
FROM programacion_mantenimiento p
WHERE p.estado IN ('EJECUTADO','NO_EJECUTADO')
  AND p.version_programa_id IS NULL
ORDER BY p.id;


-- ============================================================
-- BLOQUE 5 - CICLOS: CONTINUIDAD AJENA A LA VERSION
-- ============================================================

-- ------------------------------------------------------------
-- V16. No existe ningun ciclo de GPS en nivel M1 ni M2.
--      Esperado: 0 filas.
--      Lectura:  cuando la FASE V-A retiro fk_ciclo_frecuencia,
--                esta garantia paso a chk_ciclo_gps_solo_m3.
--                Una fila aqui significa que ese CHECK no existe.
-- ------------------------------------------------------------
SELECT c.id, u.placa, c.tipo_equipo, c.nivel_mantenimiento,
       c.ultima_quincena, c.fuente
FROM programa_mantenimiento_unidad_ciclos c
JOIN programa_mantenimiento_unidades u ON u.id = c.programa_unidad_id
WHERE c.tipo_equipo = 'GPS'
  AND c.nivel_mantenimiento <> 'M3'
ORDER BY u.placa;


-- ------------------------------------------------------------
-- V17. Los ciclos respetan el dominio de equipo y de nivel.
--      Esperado: 0 filas.
--      Lectura:  sustituyen a fk_ciclo_frecuencia los CHECK
--                chk_ciclo_tipo_equipo y chk_ciclo_nivel.
--                NOTA deliberada: NO se exige que la combinacion
--                este declarada en alguna version. Un ciclo debe
--                sobrevivir a una version que deje de programar su
--                nivel; por eso esa comprobacion no esta aqui.
-- ------------------------------------------------------------
SELECT c.id, u.placa, c.tipo_equipo, c.nivel_mantenimiento,
       c.ultima_quincena, c.fuente
FROM programa_mantenimiento_unidad_ciclos c
JOIN programa_mantenimiento_unidades u ON u.id = c.programa_unidad_id
WHERE c.tipo_equipo NOT IN ('DVR','COPILOTO','RADIO_BASE','CAMARAS','GPS')
   OR c.nivel_mantenimiento NOT IN ('M1','M2','M3')
ORDER BY u.placa;


-- ============================================================
-- CRITERIO DE SALIDA
--   La FASE V-G (cleanup de versionado) no debe ejecutarse
--   mientras V3, V4, V5, V6, V7, V9, V10, V11, V12, V13, V14,
--   V15, V16, V17, V19, V21 y V22 no devuelvan CERO filas, y
--   V2, V8 y V18 no confirmen su condicion.
-- ============================================================
