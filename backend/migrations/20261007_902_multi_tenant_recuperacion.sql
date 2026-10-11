-- =====================================================================================
-- HOTFIX MULTI-TENANT · MIGRACION 20261007_902 · RECUPERACION DEL MODELO AUSENTE
-- =====================================================================================
-- CLASIFICACION: RECUPERACION DE ESQUEMA + CARGA DE MAESTROS + BACKFILL.
--   5 CREATE TABLE. 3 ADD COLUMN en tablas existentes. 3 ADD COLUMN de drift.
--   2 FK nuevas sobre tablas existentes. 10 INDEX. 0 DROP. 0 TRIGGER. 0 FUNCTION.
--   DML: 6 clientes, 21 cliente_operaciones, 147 UPDATE de vehiculos.cliente_operacion_id.
--
-- POR QUE EXISTE ESTA MIGRACION
-- -------------------------------------------------------------------------------------
-- El commit b900949 (2026-09-27) metio en el backend el modelo multi-tenant -clientes,
-- cliente_operaciones, supervisor_asignaciones y las columnas que cuelgan de ellas- SIN
-- migracion. El DDL no esta en ningun punto del historial de git: se busco en todo el
-- historial y no aparece. Consecuencias medidas sobre la base actual:
--   · initDb() lanza "Faltan tablas o columnas" con 10 items y aborta server.js;
--   · verifyToken consulta supervisor_asignaciones, cliente_operaciones y clientes en
--     CADA peticion autenticada, asi que toda peticion con token devuelve 500.
--
-- El DDL de aqui NO esta inventado. Se recupero en solo lectura de la base de produccion
-- origen -endpoint distinto de esta base y de la aislada- con consultas de catalogo
-- dentro de BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY: information_schema.columns,
-- pg_constraint via pg_get_constraintdef, pg_indexes, pg_attribute/pg_sequence,
-- pg_proc via pg_get_functiondef y pg_trigger via pg_get_triggerdef.
--
-- REPARTO DE AUTORIDAD (decidido por el usuario, 2026-10-07)
-- -------------------------------------------------------------------------------------
-- La base ORIGEN define el MODELO. La base ACTUAL define los DATOS VEHICULARES y es la
-- fuente de verdad del inventario: esta migracion NO reemplaza ni una placa, ni un
-- cliente, ni una operacion. Solo RELLENA la columna nueva cliente_operacion_id.
--
-- ORDEN DE EJECUCION
-- -------------------------------------------------------------------------------------
-- 1. migrations/20260923_solicitudes_descarga_videos.sql  (existe en el repo, nunca se
--    aplico; crea las dos tablas de video en su forma antigua)
-- 2. ESTA migracion
-- 3. migrations/20261007_903_multi_tenant_triggers.sql    (las dos funciones y los dos
--    triggers; van al final a proposito, vease su cabecera)
--
-- LO QUE ESTA MIGRACION NO HACE, Y POR QUE
-- -------------------------------------------------------------------------------------
-- · NO pone vehiculos.cliente_operacion_id en NOT NULL, aunque en produccion lo es.
--   Quedan 35 vehiculos sin asignar. El NOT NULL es una segunda migracion, posterior a
--   resolverlos. Dejarlo NULLABLE es una desviacion DELIBERADA del DDL del origen.
-- · NO asigna los 29 vehiculos cuyo texto incumple los CHECK preexistentes
--   chk_vehiculos_cliente y chk_vehiculos_operacion -los 24 con cliente HUDBAY, el de
--   UM TITAN y los 4 con operacion "Primax" y cliente vacio-. Esos 29 ya son ineditables
--   HOY, antes de esta migracion: los CHECK son NOT VALID, asi que nadie comprobo las
--   filas existentes, pero revalidan cualquier fila que se actualice. Asignarlos exigiria
--   corregir su texto o relajar los CHECK, y ninguna de las dos cosas estaba autorizada.
--   El PASO 10 los deja escritos y los cuenta; no los esconde.
-- · NO recupera la version del origen de esos dos CHECK, que tambien sufrio el drift.
--   Vease la nota del final del fichero: es una decision aparte y no desbloquea a los 29.
-- · NO instala los triggers. El de vehiculos aborta cualquier alta o edicion cuyo par
--   de texto no resuelva contra el catalogo; instalarlo antes de cargar el catalogo
--   haria fallar esta propia migracion y, despues, toda alta de vehiculo.
-- · NO crea las 3 operaciones del origen que ningun vehiculo nuestro usa
--   -ids 1 AUSTRAL/GLP, 5 PRIMAX/ANTAPACCAY, 8 PRIMAX/CERRO VERDE-. Sin evidencia no se
--   crean, asi que la secuencia de ids queda con huecos en 1, 5 y 8. Es deliberado.
-- · NO toca los 3 pares de placas duplicadas por confusion O/0 que tiene el inventario
--   -VD0-941 con VDO941, VOR-739 con V0R739, VOR-748 con V0R748-. Se dejan como estan.
-- · NO copia ni una fila de datos de la base origen fuera del catalogo autorizado.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- PASO 0 · PRECONDICIONES. Si algo no cuadra, la migracion muere aqui y no a medias.
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  -- Las 5 tablas que esta migracion crea no pueden existir ya.
  IF to_regclass('public.clientes')                IS NOT NULL
     OR to_regclass('public.cliente_operaciones')  IS NOT NULL
     OR to_regclass('public.supervisor_asignaciones') IS NOT NULL
     OR to_regclass('public.pulseras')             IS NOT NULL
     OR to_regclass('public.notificaciones')       IS NOT NULL THEN
    RAISE EXCEPTION
      'Alguna de las 5 tablas del modelo multi-tenant ya existe. Esta migracion se ejecuta una sola vez.';
  END IF;

  -- Las tablas a las que se le cuelgan columnas y FK tienen que estar.
  IF to_regclass('public.vehiculos')        IS NULL
     OR to_regclass('public.usuarios')      IS NULL
     OR to_regclass('public.personal')      IS NULL
     OR to_regclass('public.entregas_ti')   IS NULL
     OR to_regclass('public.tickets_unidades') IS NULL THEN
    RAISE EXCEPTION 'Falta una tabla base: vehiculos, usuarios, personal, entregas_ti o tickets_unidades.';
  END IF;

  -- El PASO 7 completa el drift de las tablas de video, que las crea la 20260923.
  IF to_regclass('public.solicitudes_descarga_videos') IS NULL THEN
    RAISE EXCEPTION
      'Falta solicitudes_descarga_videos. Aplica primero migrations/20260923_solicitudes_descarga_videos.sql.';
  END IF;

  -- Las 3 columnas sueltas no pueden existir ya.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='vehiculos'
               AND column_name='cliente_operacion_id') THEN
    RAISE EXCEPTION 'vehiculos.cliente_operacion_id ya existe.';
  END IF;

  -- El inventario tiene que ser el que se analizo, o los recuentos del PASO 11 no valen.
  IF (SELECT count(*) FROM vehiculos) <> 182 THEN
    RAISE EXCEPTION
      'vehiculos tiene % filas, se esperaban 182. El reparto 116/60/6 se calculo sobre 182: revisalo antes de seguir.',
      (SELECT count(*) FROM vehiculos);
  END IF;
END $$;

-- Foto del inventario ANTES de tocar nada. El PASO 11 compara contra ella para demostrar
-- que esta migracion no ha movido ni una placa, ni un cliente, ni una operacion.
-- ON COMMIT DROP: se va con la transaccion, no deja rastro en el esquema.
CREATE TEMP TABLE _inventario_antes ON COMMIT DROP AS
  SELECT placa, cliente, operacion FROM vehiculos;


-- -------------------------------------------------------------------------------------
-- PASO 1 · clientes
--   id es IDENTITY BY DEFAULT, no SERIAL: asi es en el origen y asi admite id explicito
--   en el PASO 8. La unicidad del nombre es un INDICE DE EXPRESION sobre
--   UPPER(BTRIM(nombre)), no una constraint: "Primax" y "PRIMAX" colisionan.
-- -------------------------------------------------------------------------------------
CREATE TABLE clientes (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  es_interno BOOLEAN NOT NULL DEFAULT FALSE,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_clientes_nombre
    CHECK (NULLIF(BTRIM(nombre), '') IS NOT NULL)
);

CREATE UNIQUE INDEX uq_clientes_nombre_normalizado
  ON clientes (UPPER(BTRIM(nombre)));


-- -------------------------------------------------------------------------------------
-- PASO 2 · cliente_operaciones
--   El nombre de la operacion solo es unico DENTRO de un cliente. No es un detalle
--   menor: "GLP" existe a la vez en PRIMAX, SOLGAS, SAN JOSE y AUSTRAL, y por eso un
--   vehiculo con operacion "GLP" y cliente vacio es irresoluble por construccion.
-- -------------------------------------------------------------------------------------
CREATE TABLE cliente_operaciones (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_cliente_operaciones_nombre
    CHECK (NULLIF(BTRIM(nombre), '') IS NOT NULL),
  CONSTRAINT fk_cliente_operaciones_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_cliente_operacion_normalizada
  ON cliente_operaciones (cliente_id, UPPER(BTRIM(nombre)));


-- -------------------------------------------------------------------------------------
-- PASO 3 · supervisor_asignaciones
--   La tabla que tumba verifyToken. No tiene columna id: la PK es compuesta.
-- -------------------------------------------------------------------------------------
CREATE TABLE supervisor_asignaciones (
  usuario_id           INTEGER NOT NULL,
  cliente_operacion_id INTEGER NOT NULL,
  fecha_asignacion     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_supervisor_asignaciones
    PRIMARY KEY (usuario_id, cliente_operacion_id),
  CONSTRAINT fk_supervisor_asignaciones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_supervisor_asignaciones_operacion
    FOREIGN KEY (cliente_operacion_id) REFERENCES cliente_operaciones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX idx_supervisor_asignaciones_operacion
  ON supervisor_asignaciones (cliente_operacion_id);


-- -------------------------------------------------------------------------------------
-- PASO 4 · pulseras
--   Aqui id SI es SERIAL -default nextval-, no IDENTITY. Se reproduce tal cual.
-- -------------------------------------------------------------------------------------
CREATE TABLE pulseras (
  id                     SERIAL PRIMARY KEY,
  solicitante_persona_id INTEGER NOT NULL,
  receptor_persona_id    INTEGER NOT NULL,
  operacion              VARCHAR(100) NOT NULL,
  motivo_renovacion      TEXT NOT NULL,
  evidencia_url          TEXT NOT NULL,
  estado                 VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  creado_por             INTEGER NULL,
  fecha_creacion         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre           TIMESTAMP WITHOUT TIME ZONE NULL,
  cliente_operacion_id   INTEGER NULL,
  fecha_llegada_personal DATE NULL,
  hora_llegada_personal  TIME WITHOUT TIME ZONE NULL,

  CONSTRAINT chk_pulseras_estado
    CHECK (estado IN ('Pendiente', 'En Proceso', 'Resuelto')),
  CONSTRAINT chk_pulseras_operacion
    CHECK (BTRIM(operacion) <> ''),
  CONSTRAINT chk_pulseras_motivo
    CHECK (BTRIM(motivo_renovacion) <> ''),
  CONSTRAINT fk_pulseras_solicitante
    FOREIGN KEY (solicitante_persona_id) REFERENCES personal(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pulseras_receptor
    FOREIGN KEY (receptor_persona_id) REFERENCES personal(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pulseras_usuario
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pulseras_cliente_operacion
    FOREIGN KEY (cliente_operacion_id) REFERENCES cliente_operaciones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX idx_pulseras_cliente_operacion ON pulseras (cliente_operacion_id);
CREATE INDEX idx_pulseras_estado            ON pulseras (estado);
CREATE INDEX idx_pulseras_fecha             ON pulseras (fecha_creacion DESC);
CREATE INDEX idx_pulseras_receptor          ON pulseras (receptor_persona_id);


-- -------------------------------------------------------------------------------------
-- PASO 5 · notificaciones
--   Su FK es la UNICA del modelo sin ON UPDATE. Se reproduce la asimetria, no se
--   "arregla": corregirla seria inventar una decision que el origen no tomo.
-- -------------------------------------------------------------------------------------
CREATE TABLE notificaciones (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL,
  tipo           VARCHAR(40) NOT NULL,
  titulo         VARCHAR(160) NOT NULL,
  mensaje        TEXT NOT NULL,
  url            VARCHAR(300) NULL,
  leida          BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_lectura  TIMESTAMP WITHOUT TIME ZONE NULL,

  CONSTRAINT notificaciones_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_notificaciones_usuario_fecha
  ON notificaciones (usuario_id, fecha_creacion DESC);

-- Indice PARCIAL: solo las no leidas, que es lo unico que la campana consulta.
CREATE INDEX idx_notificaciones_usuario_no_leidas
  ON notificaciones (usuario_id, leida) WHERE (leida = FALSE);


-- -------------------------------------------------------------------------------------
-- PASO 6 · LAS TRES COLUMNAS SUELTAS, TODAS NULLABLE
--   En el origen vehiculos.cliente_operacion_id es NOT NULL. Aqui nace NULLABLE a
--   proposito: 6 vehiculos no tienen de donde sacar el valor. Vease la cabecera.
--   Produccion no tiene indice propio sobre esta columna en vehiculos; no se añade uno.
-- -------------------------------------------------------------------------------------
ALTER TABLE vehiculos
  ADD COLUMN cliente_operacion_id INTEGER NULL;

ALTER TABLE vehiculos
  ADD CONSTRAINT fk_vehiculos_cliente_operacion
    FOREIGN KEY (cliente_operacion_id) REFERENCES cliente_operaciones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE entregas_ti
  ADD COLUMN cliente_operacion_id INTEGER NULL;

ALTER TABLE entregas_ti
  ADD CONSTRAINT fk_entregas_ti_cliente_operacion
    FOREIGN KEY (cliente_operacion_id) REFERENCES cliente_operaciones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE tickets_unidades
  ADD COLUMN creado_por INTEGER NULL;

ALTER TABLE tickets_unidades
  ADD CONSTRAINT tickets_unidades_creado_por_fkey
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON DELETE SET NULL;


-- -------------------------------------------------------------------------------------
-- PASO 7 · DRIFT DE solicitudes_descarga_videos
--   La 20260923 del repo crea la tabla, pero en la forma anterior al commit b900949.
--   Frente al origen le faltan exactamente estas 3 columnas, esta FK y este indice.
--   El resto de la tabla -checks, FK de usuario, indices- ya coincide nombre por nombre,
--   y solicitud_descarga_video_placas coincide entera: no se toca.
-- -------------------------------------------------------------------------------------
ALTER TABLE solicitudes_descarga_videos
  ADD COLUMN cliente_operacion_id INTEGER NULL,
  ADD COLUMN fecha_llegada_unidad DATE NULL,
  ADD COLUMN hora_llegada_unidad  TIME WITHOUT TIME ZONE NULL;

ALTER TABLE solicitudes_descarga_videos
  ADD CONSTRAINT fk_solicitud_video_cliente_operacion
    FOREIGN KEY (cliente_operacion_id) REFERENCES cliente_operaciones(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_solicitud_video_cliente_operacion
  ON solicitudes_descarga_videos (cliente_operacion_id);


-- -------------------------------------------------------------------------------------
-- PASO 8 · CATALOGO AUTORIZADO
--   6 clientes y 21 operaciones. Son EXACTAMENTE las que usan los 176 vehiculos que se
--   rellenan abajo: ni una combinacion sin evidencia. Los ids son los del origen, para
--   que ambas bases sigan comparables fila a fila; eso deja huecos en 1, 5 y 8.
--   Se cargan las 21 aunque 29 vehiculos no lleguen a usarlas: su ratificacion es firme y
--   el catalogo tiene que estar completo para cuando se desbloqueen.
-- -------------------------------------------------------------------------------------
-- clientes: se conservan los ids del ORIGEN para que ambas bases sigan siendo
-- comparables fila a fila. La columna es GENERATED BY DEFAULT AS IDENTITY, asi
-- que admite id explicito; la secuencia se recoloca al final de este bloque.
INSERT INTO clientes (id, nombre, es_interno, activo) VALUES
  (1, 'AUSTRAL', false, true),
  (2, 'PRIMAX', false, true),
  (3, 'REPSOL', false, true),
  (4, 'SAN JOSE', false, true),
  (5, 'SOLGAS', false, true),
  (6, 'INTERNO', true, true);

INSERT INTO cliente_operaciones (id, cliente_id, nombre, activo) VALUES
  ( 2, 1, 'CARGAS DIVERSAS', true),
  ( 3, 2, 'COESTI', true),
  ( 4, 2, 'CRESPO', true),
  ( 6, 2, 'ODEBRECHT', true),
  ( 7, 2, 'RACIEMSA', true),
  ( 9, 2, 'PAMPA DE COBRE', true),
  (10, 2, 'PUCAMARCA', true),
  (11, 2, 'CACHIMAYO', true),
  (12, 2, 'CARAVELI', true),
  (13, 2, 'CONSTANCIA', true),
  (14, 2, 'BATEAS', true),
  (15, 2, 'GLP', true),
  (16, 2, 'SAN RAFAEL', true),
  (17, 3, 'QUELLAVECO', true),
  (18, 3, 'LAS BAMBAS', true),
  (19, 4, 'GLP', true),
  (20, 4, 'INDUSTRIA', true),
  (21, 5, 'GLP', true),
  (22, 6, 'LOGISTICA', true),
  (23, 6, 'MANTENIMIENTO', true),
  (24, 6, 'ADMINISTRACION', true);

-- Las identidades arrancaban en 1: hay que dejarlas por encima del mayor id cargado,
-- o el primer alta por la aplicacion chocaria con la PK.
ALTER TABLE clientes            ALTER COLUMN id RESTART WITH 7;
ALTER TABLE cliente_operaciones ALTER COLUMN id RESTART WITH 25;

-- -------------------------------------------------------------------------------------
-- PASO 9 · BACKFILL NIVEL 1 · 116 vehiculos
--   Fuente: NUESTROS PROPIOS textos cliente y operacion. No interviene la base origen.
--   La condicion de emparejamiento es la MISMA que usa el trigger recuperado del origen
--   -UPPER(BTRIM()) contra catalogo activo-, asi que esto es exactamente lo que el
--   trigger haria por si solo. No se inventa nada y no se escribe en cliente ni en
--   operacion: solo se rellena la columna nueva.
--   Si cliente u operacion son NULL, UPPER(BTRIM(NULL)) es NULL y la fila no empareja:
--   los vacios se quedan fuera sin filtrarlos a mano.
--   El par no puede emparejar con dos filas del catalogo: lo impiden
--   uq_clientes_nombre_normalizado y uq_cliente_operacion_normalizada.
-- -------------------------------------------------------------------------------------
UPDATE vehiculos v
   SET cliente_operacion_id = co.id
  FROM cliente_operaciones co
       INNER JOIN clientes c ON c.id = co.cliente_id
 WHERE UPPER(BTRIM(c.nombre))  = UPPER(BTRIM(v.cliente))
   AND UPPER(BTRIM(co.nombre)) = UPPER(BTRIM(v.operacion))
   AND c.activo  = TRUE
   AND co.activo = TRUE
   AND v.cliente_operacion_id IS NULL;

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM vehiculos WHERE cliente_operacion_id IS NOT NULL;
  IF n <> 116 THEN
    RAISE EXCEPTION 'NIVEL 1 asigno % vehiculos, se esperaban 116.', n;
  END IF;
END $$;


-- -------------------------------------------------------------------------------------
-- PASO 10 · BACKFILL NIVEL 2 · 60 ratificaciones, de las que la base acepta 31
--
--   Fuente: la misma placa en la base origen, RATIFICADA por el usuario el 2026-10-07.
--   Va como VALUES literal porque esta base no puede consultar al origen. Cada fila lleva
--   al lado su destino y el texto que el vehiculo tiene HOY, para que la ratificacion sea
--   auditable sin volver a conectarse a ninguna parte.
--
--   POR QUE ESTO ES UN BUCLE Y NO UN UPDATE ... FROM
--   -----------------------------------------------------------------------------------
--   vehiculos arrastra dos CHECK preexistentes, chk_vehiculos_cliente y
--   chk_vehiculos_operacion, declarados NOT VALID. NOT VALID significa que las filas que
--   ya estaban no se comprobaron nunca, pero CUALQUIER UPDATE de una fila la revalida.
--   29 vehiculos del inventario incumplen esos CHECK hoy -los 24 con cliente HUDBAY, el
--   de UM TITAN y los 4 con operacion "Primax" y cliente vacio-, asi que un UPDATE
--   masivo moriria entero con 23514 por culpa de ellos.
--
--   Eso NO es un problema que introduzca esta migracion: esos 29 vehiculos ya son
--   ineditables hoy. Reproducido sobre la base, sin migracion alguna:
--       UPDATE vehiculos SET marca_tracto = 'X' WHERE placa = 'CJQ858';
--       ERROR 23514 ... viola el check «chk_vehiculos_cliente»
--   Es decir, la via normal de la aplicacion -flota/repository.js- ya no puede tocarlos.
--
--   Asi que el bucle NO restata los CHECK: deja que la base decida fila a fila y captura
--   check_violation en una subtransaccion. Las que entran, entran; las que la base
--   rechaza se cuentan y se nombran. Cualquier OTRO error aborta la migracion entera, que
--   es lo que debe pasar. Las 60 ratificaciones se quedan escritas aqui aunque 29 no se
--   apliquen: cuando se decida que hacer con ese texto, la segunda migracion reutiliza
--   esta misma lista sin volver a pedir nada al origen.
--
--   Los 24 HUDBAY/Primax son el caso de campos cruzados: "Primax" es el cliente y
--   "HUDBAY" la mina. Su texto NO se corrige aqui.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  r          RECORD;
  n_aplicado INTEGER := 0;
  n_rechazado INTEGER := 0;
  rechazados TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('B6Z714'    , 15),  -- PRIMAX/GLP                 | actual: NULL/NULL
      ('B8D793'    ,  4),  -- PRIMAX/CRESPO              | actual: NULL/NULL
      ('BJB753'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('CJQ858'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('CJR734'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('CJR910'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('CJS849'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('CJT845'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('V0R915'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('V0R941'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('V5K756'    , 21),  -- SOLGAS/GLP                 | actual: NULL/GLP
      ('V7Z928'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('V8T801'    , 15),  -- PRIMAX/GLP                 | actual: NULL/NULL
      ('V9T950'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('V9T961'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('V9U834'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('VAL827'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('VAL860'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('VAM846'    , 22),  -- INTERNO/LOGISTICA          | actual: NULL/NULL
      ('VBU717'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBU733'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBU738'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBU754'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBX798'    , 12),  -- PRIMAX/CARAVELI            | actual: UM TITAN/Primax
      ('VBY760'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY773'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY798'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY814'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY830'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY832'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY850'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY886'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBY926'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VBZ701'    , 22),  -- INTERNO/LOGISTICA          | actual: NULL/NULL
      ('VBZ736'    , 23),  -- INTERNO/MANTENIMIENTO      | actual: NULL/NULL
      ('VCA886'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VCI781'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('VCI782'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('VCI837'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VCI921'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('VCP807'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VCP820'    ,  9),  -- PRIMAX/PAMPA DE COBRE      | actual: NULL/Primax
      ('VCP837'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VCP839'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VCP879'    , 24),  -- INTERNO/ADMINISTRACION     | actual: NULL/NULL
      ('VCR944'    , 17),  -- REPSOL/QUELLAVECO          | actual: NULL/NULL
      ('VCS735'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VCS745'    , 16),  -- PRIMAX/SAN RAFAEL          | actual: NULL/Primax
      ('VDN818'    , 13),  -- PRIMAX/CONSTANCIA          | actual: NULL/Primax
      ('VDO898'    , 17),  -- REPSOL/QUELLAVECO          | actual: NULL/NULL
      ('VDO941'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VEW721'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VEW722'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VEW755'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VEW834'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VEW870'    , 13),  -- PRIMAX/CONSTANCIA          | actual: HUDBAY/Primax
      ('VEZ930'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VFB802'    , 18),  -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
      ('VFD743'    , 13),  -- PRIMAX/CONSTANCIA          | actual: NULL/Primax
      ('VFD863'    , 18)   -- REPSOL/LAS BAMBAS          | actual: NULL/NULL
    ) AS t(placa, cliente_operacion_id)
  LOOP
    BEGIN
      UPDATE vehiculos
         SET cliente_operacion_id = r.cliente_operacion_id
       WHERE placa = r.placa
         AND cliente_operacion_id IS NULL;
      n_aplicado := n_aplicado + 1;
    EXCEPTION
      -- Solo se tolera la violacion de CHECK, y solo para contarla. Una FK rota, un tipo
      -- incompatible o cualquier otra cosa sigue tumbando la migracion.
      WHEN check_violation THEN
        n_rechazado := n_rechazado + 1;
        rechazados  := rechazados || r.placa;
    END;
  END LOOP;

  IF n_aplicado <> 31 OR n_rechazado <> 29 THEN
    RAISE EXCEPTION
      'NIVEL 2: se aplicaron % y se rechazaron %, se esperaban 31 y 29. Rechazados: %',
      n_aplicado, n_rechazado, array_to_string(rechazados, ', ');
  END IF;

  RAISE NOTICE 'NIVEL 2 · aplicados 31 · rechazados por CHECK preexistente 29: %',
    array_to_string(rechazados, ', ');
END $$;


-- -------------------------------------------------------------------------------------
-- PASO 11 · VERIFICACION. Todo dentro de la misma transaccion: si una sola de estas
--   aserciones falla, el COMMIT no llega y la base se queda como estaba.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  n_cli      INTEGER;
  n_ops      INTEGER;
  n_asig     INTEGER;
  n_null     INTEGER;
  n_incoh    INTEGER;
  n_cambios  INTEGER;
  n_bloq     INTEGER;
  pendientes TEXT;
BEGIN
  -- 11.1 catalogo
  SELECT count(*) INTO n_cli FROM clientes;
  SELECT count(*) INTO n_ops FROM cliente_operaciones;
  IF n_cli <> 6 OR n_ops <> 21 THEN
    RAISE EXCEPTION 'Catalogo incorrecto: % clientes y % operaciones, se esperaban 6 y 21.', n_cli, n_ops;
  END IF;

  -- 11.2 el reparto 147 / 35
  SELECT count(*) INTO n_asig FROM vehiculos WHERE cliente_operacion_id IS NOT NULL;
  SELECT count(*) INTO n_null FROM vehiculos WHERE cliente_operacion_id IS NULL;
  IF n_asig <> 147 OR n_null <> 35 THEN
    RAISE EXCEPTION 'Reparto incorrecto: % asignados y % sin asignar, se esperaban 147 y 35.', n_asig, n_null;
  END IF;

  -- 11.3 de los 35 pendientes, 29 son los bloqueados por el CHECK y 6 los sin fuente.
  --      Se comprueba que el motivo de cada grupo es el esperado, no solo el total.
  SELECT count(*) INTO n_bloq FROM vehiculos
   WHERE cliente_operacion_id IS NULL
     AND placa NOT IN ('D4R-972', 'DEMO', 'F3L-787', 'VD0-941', 'VOR-739', 'VOR-748');
  IF n_bloq <> 29 THEN
    RAISE EXCEPTION 'Se esperaban 29 pendientes por CHECK, hay %.', n_bloq;
  END IF;

  SELECT string_agg(placa, ', ' ORDER BY placa) INTO pendientes
    FROM vehiculos
   WHERE cliente_operacion_id IS NULL
     AND placa IN ('D4R-972', 'DEMO', 'F3L-787', 'VD0-941', 'VOR-739', 'VOR-748');
  IF pendientes <> 'D4R-972, DEMO, F3L-787, VD0-941, VOR-739, VOR-748' THEN
    RAISE EXCEPTION 'Los 6 vehiculos sin fuente no son los esperados. Son: %', pendientes;
  END IF;

  -- Y que los 29 son exactamente los que incumplen un CHECK: si alguno de ellos pasara
  -- los CHECK, significaria que se quedo sin asignar por otro motivo y habria que mirarlo.
  SELECT count(*) INTO n_bloq FROM vehiculos v
   WHERE v.cliente_operacion_id IS NULL
     AND v.placa NOT IN ('D4R-972', 'DEMO', 'F3L-787', 'VD0-941', 'VOR-739', 'VOR-748')
     AND v.operacion IS NOT NULL
     AND EXISTS (SELECT 1 FROM cliente_operaciones co WHERE UPPER(BTRIM(co.nombre)) = UPPER(BTRIM(v.operacion)));
  IF n_bloq <> 0 THEN
    RAISE EXCEPTION
      '% vehiculos quedaron sin asignar aunque su operacion si existe en el catalogo. Revisar.', n_bloq;
  END IF;

  -- 11.4 ningun vehiculo mal asignado: si su propio par de texto resuelve en el catalogo,
  --      el id asignado tiene que ser ESE y no otro. Esto descarta que el nivel 2 haya
  --      pisado a alguien del nivel 1.
  SELECT count(*) INTO n_incoh
    FROM vehiculos v
         INNER JOIN cliente_operaciones co
           ON UPPER(BTRIM(co.nombre)) = UPPER(BTRIM(v.operacion)) AND co.activo
         INNER JOIN clientes c
           ON c.id = co.cliente_id
          AND UPPER(BTRIM(c.nombre)) = UPPER(BTRIM(v.cliente)) AND c.activo
   WHERE v.cliente_operacion_id IS DISTINCT FROM co.id;
  IF n_incoh <> 0 THEN
    RAISE EXCEPTION '% vehiculos tienen un cliente_operacion_id que contradice su propio cliente/operacion.', n_incoh;
  END IF;

  -- 11.5 el inventario no se ha tocado. Se compara contra la foto del PASO 0, no contra
  --      un md5 escrito a mano: asi la asercion vale en cualquier base, no solo en esta.
  SELECT count(*) INTO n_cambios FROM (
    SELECT placa, cliente, operacion FROM vehiculos
    EXCEPT ALL
    SELECT placa, cliente, operacion FROM _inventario_antes
  ) d;
  IF n_cambios <> 0 THEN
    RAISE EXCEPTION
      '% filas de vehiculos cambiaron placa, cliente u operacion. Esta migracion solo debe rellenar cliente_operacion_id.',
      n_cambios;
  END IF;

  RAISE NOTICE 'OK · catalogo 6/21 · 116 nivel1 + 31 nivel2 = 147 asignados · 35 pendientes (29 CHECK + 6 sin fuente) · inventario intacto.';
END $$;

COMMIT;

-- =====================================================================================
-- DESPUES DE ESTA MIGRACION
-- -------------------------------------------------------------------------------------
-- · initDb() deja de fallar: las 7 tablas y las 3 columnas que echaba en falta existen.
-- · verifyToken puede resolver su subconsulta. Con supervisor_asignaciones vacia devuelve
--   ARRAY[]::integer[], que es el COALESCE que el propio middleware ya contempla.
-- · Falta aplicar 20261007_903_multi_tenant_triggers.sql.
--
-- QUEDA ABIERTO, Y NECESITA DECISION HUMANA ANTES DE OTRA MIGRACION
-- -------------------------------------------------------------------------------------
-- 1. Los 29 vehiculos con texto incompatible con chk_vehiculos_cliente/_operacion.
--    No se puede asignarles cliente_operacion_id sin tocar su texto o sin tocar los CHECK,
--    y ninguna de las dos cosas estaba autorizada. Su ratificacion ya esta escrita en el
--    PASO 10 y se reaprovecha cuando se decida.
-- 2. Los 6 sin fuente, incluidos los 3 duplicados O/0.
-- 3. Los dos CHECK de vehiculos tambien sufrieron el drift de b900949. En el origen son
--    insensibles a mayusculas y espacios -upper(btrim(...))-, admiten el cliente INTERNO
--    y las operaciones ADMINISTRACION, MANTENIMIENTO y LOGISTICA, y estan VALIDATED.
--    Aqui siguen siendo literales, sin INTERNO ni esas tres, y NOT VALID. Mientras no se
--    recuperen, los 16 vehiculos que esta migracion manda a operaciones de INTERNO no
--    podran llevar nunca su texto normalizado. Adoptar la version del origen NO desbloquea
--    a los 29: medido, siguen siendo 29 con una version y con la otra.
-- 4. Y solo cuando 1 y 2 esten resueltos:
--       ALTER TABLE vehiculos ALTER COLUMN cliente_operacion_id SET NOT NULL;
-- =====================================================================================
