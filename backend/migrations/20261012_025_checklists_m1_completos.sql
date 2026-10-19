BEGIN;

LOCK TABLE catalogo_actividades_mantenimiento
IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE nuevos_checklists_m1 (
  tipo_equipo varchar(30) NOT NULL,
  orden integer NOT NULL,
  descripcion text NOT NULL,
  PRIMARY KEY (tipo_equipo, orden)
) ON COMMIT DROP;

INSERT INTO nuevos_checklists_m1 (
  tipo_equipo,
  orden,
  descripcion
)
VALUES
  -- CÁMARAS
  (
    'CAMARAS', 1,
    'Encendido y verificación de LED de estado y de grabación'
  ),
  (
    'CAMARAS', 2,
    'Confirmación de grabación continua de las últimas 24 horas'
  ),
  (
    'CAMARAS', 3,
    'Verificación de cierre y seguridad del gabinete del DVR'
  ),
  (
    'CAMARAS', 4,
    'Verificación de imagen en vivo de cada cámara instalada'
  ),
  (
    'CAMARAS', 5,
    'Limpieza de lente y domo de cada cámara'
  ),
  (
    'CAMARAS', 6,
    'Verificación de encuadre según el estándar de la operación'
  ),
  (
    'CAMARAS', 7,
    'Inspección de fijación, golpes y humedad en el lente'
  ),

  -- COPILOTO
  (
    'COPILOTO', 1,
    'Encendido, nivel de carga y respuesta táctil de la pantalla'
  ),
  (
    'COPILOTO', 2,
    'Verificación de señal GPS y de datos en el aplicativo'
  ),
  (
    'COPILOTO', 3,
    'Verificación de soporte, cargador y toma de energía'
  ),
  (
    'COPILOTO', 4,
    'Limpieza de pantalla y bloqueador solar'
  ),

  -- RADIO BASE
  (
    'RADIO_BASE', 1,
    'Encendido del equipo y verificación de display y LED de estado'
  ),
  (
    'RADIO_BASE', 2,
    'Prueba de comunicación(alcance) con la central en el canal de la operación'
  ),
  (
    'RADIO_BASE', 3,
    'Verificación de canal programado, volumen y squelch'
  ),
  (
    'RADIO_BASE', 4,
    'Inspección visual de micrófono, espiral, soporte y perilla'
  ),
  (
    'RADIO_BASE', 5,
    'Limpieza externa del equipo y del micrófono'
  );

-- Desactivar las actividades M1 anteriores.
-- No elimina registros ni modifica checklist de órdenes existentes.
UPDATE catalogo_actividades_mantenimiento
SET
  activo = FALSE,
  updated_at = CURRENT_TIMESTAMP
WHERE nivel_origen = 'M1'
  AND tipo_equipo IN (
    'CAMARAS',
    'COPILOTO',
    'RADIO_BASE'
  );

-- Crear únicamente las actividades que todavía no existen.
INSERT INTO catalogo_actividades_mantenimiento (
  tipo_equipo,
  nivel_origen,
  descripcion,
  orden,
  activo
)
SELECT
  nueva.tipo_equipo,
  'M1',
  nueva.descripcion,
  nueva.orden,
  FALSE
FROM nuevos_checklists_m1 nueva
WHERE NOT EXISTS (
  SELECT 1
  FROM catalogo_actividades_mantenimiento existente
  WHERE existente.tipo_equipo = nueva.tipo_equipo
    AND existente.nivel_origen = 'M1'
    AND existente.descripcion = nueva.descripcion
);

-- Activar una sola entrada por actividad y ordenar el checklist.
UPDATE catalogo_actividades_mantenimiento catalogo
SET
  activo = TRUE,
  orden = nueva.orden,
  updated_at = CURRENT_TIMESTAMP
FROM nuevos_checklists_m1 nueva
WHERE catalogo.id = (
  SELECT MIN(existente.id)
  FROM catalogo_actividades_mantenimiento existente
  WHERE existente.tipo_equipo = nueva.tipo_equipo
    AND existente.nivel_origen = 'M1'
    AND existente.descripcion = nueva.descripcion
);

-- Verificar los totales antes de confirmar.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM catalogo_actividades_mantenimiento
    WHERE tipo_equipo = 'CAMARAS'
      AND nivel_origen = 'M1'
      AND activo = TRUE
  ) <> 7 THEN
    RAISE EXCEPTION 'Cámaras M1 debe tener 7 actividades activas';
  END IF;

  IF (
    SELECT count(*)
    FROM catalogo_actividades_mantenimiento
    WHERE tipo_equipo = 'COPILOTO'
      AND nivel_origen = 'M1'
      AND activo = TRUE
  ) <> 4 THEN
    RAISE EXCEPTION 'Copiloto M1 debe tener 4 actividades activas';
  END IF;

  IF (
    SELECT count(*)
    FROM catalogo_actividades_mantenimiento
    WHERE tipo_equipo = 'RADIO_BASE'
      AND nivel_origen = 'M1'
      AND activo = TRUE
  ) <> 5 THEN
    RAISE EXCEPTION 'Radio Base M1 debe tener 5 actividades activas';
  END IF;
END $$;

COMMIT;

-- Mostrar las 16 actividades cargadas.
SELECT
  tipo_equipo,
  nivel_origen,
  orden,
  descripcion
FROM catalogo_actividades_mantenimiento
WHERE nivel_origen = 'M1'
  AND tipo_equipo IN (
    'CAMARAS',
    'COPILOTO',
    'RADIO_BASE'
  )
  AND activo = TRUE
ORDER BY tipo_equipo, orden;