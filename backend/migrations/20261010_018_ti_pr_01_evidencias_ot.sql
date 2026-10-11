-- =====================================================================================
-- TI-PR-01 · 018 · EVIDENCIA FOTOGRAFICA DE LAS ORDENES DE TRABAJO
-- =====================================================================================
-- CLASIFICACION: ADITIVA.
--   1 CREATE TABLE · 1 ADD CONSTRAINT UNIQUE · 2 CREATE INDEX
--   1 CREATE FUNCTION · 2 CREATE TRIGGER · 9 COMMENT.
--   0 DROP · 0 DML · 0 ALTER de columna · 0 cambio de tipo · 0 cambio de default.
--   NO se escribe ni se lee una sola fila de datos existentes.
--
-- Decision de negocio aprobada el 2026-10-09/10: la evidencia fotografica es parte formal
-- del sustento del mantenimiento -acreditacion de ejecucion, respaldo ante auditorias y
-- revision posterior del estado de un equipo-, no un adjunto opcional.
--
-- -------------------------------------------------------------------------------------
-- POR QUE UNA TABLA Y NO EL JSONB QUE YA EXISTE
-- -------------------------------------------------------------------------------------
-- ordenes_trabajo.evidencias y ordenes_trabajo_detalle.evidencias son jsonb NOT NULL
-- DEFAULT '[]' con CHECK de array, y hoy el backend las guarda y devuelve SIN interpretar.
-- Medido en db-refactor antes de escribir esto:
--
--   ordenes_trabajo          0 filas · 0 con evidencias
--   ordenes_trabajo_detalle  0 filas · 0 con evidencias
--   tablas de evidencias/adjuntos/archivos/fotos preexistentes:  NINGUNA
--
-- Es decir: no hay un solo dato que migrar ni que poner en riesgo. Y el jsonb no puede
-- sostener lo que el negocio pide, porque un array opaco no tiene donde guardar:
--
--   · quien subio cada imagen y cuando
--   · un maximo de 4 ACTIVAS por apartado, comprobable de forma segura
--   · eliminacion LOGICA con quien retiro, cuando y por que
--   · consulta relacional limpia para Power BI, sin desarmar blobs
--
-- Las dos columnas jsonb NO se retiran aqui: su DROP es trabajo de un cleanup propio y
-- mezclarlo con esto seria ensanchar la migracion. Lo que si ocurre a partir de 018 es que
-- dejan de ser fuente operativa y los endpoints de OT dejan de admitirlas como editables.
-- LA UNICA FUENTE DE VERDAD DE LA EVIDENCIA FOTOGRAFICA ES ESTA TABLA.
--
-- -------------------------------------------------------------------------------------
-- DONDE CUELGA LA EVIDENCIA, Y POR QUE NO LLEVA EL NOMBRE DE LA FAMILIA
-- -------------------------------------------------------------------------------------
-- La evidencia pertenece al APARTADO concreto, no a una bolsa general de la OT. El apartado
-- ya existe normalizado y es ordenes_trabajo_detalle: una fila por equipo previsto de la
-- visita, con uq_otd_orden_programado UNIQUE (orden_trabajo_id, programacion_equipo_id).
--
-- La FAMILIA no se almacena en el detalle: sale por JOIN de
-- programacion_mantenimiento_equipos.tipo_equipo, a traves de programacion_equipo_id. Y
-- como programacion_mantenimiento_equipos tiene UNIQUE (programacion_id, tipo_equipo), la
-- correspondencia apartado <-> familia es 1:1 dentro de una visita.
--
-- Por eso esta tabla NO tiene ninguna columna 'familia' ni 'tipo_equipo': duplicar
-- 'CAMARAS' como texto crearia una segunda verdad que podria contradecir al JOIN.
--
-- -------------------------------------------------------------------------------------
-- QUE NO TOCA ESTA MIGRACION
-- -------------------------------------------------------------------------------------
--   · ordenes_trabajo y ordenes_trabajo_detalle          -> ni una fila, ni una columna
--   · las dos columnas jsonb evidencias                  -> siguen existiendo, intactas
--   · cerrar_orden_trabajo() y los triggers de 013/015/016 -> sin un solo cambio
--   · programacion_mantenimiento y sus equipos           -> intactos
--   · ciclos, anclas, el generador y el programa         -> intactos
--   · usuarios, personal y los permisos                  -> intactos
--
-- La validacion de evidencia AL CERRAR no vive en la base: vive en el backend, dentro de la
-- misma transaccion del cierre y ANTES de invocar cerrar_orden_trabajo(). Esta migracion
-- solo crea el almacen y sus invariantes.
--
-- -------------------------------------------------------------------------------------
-- INVARIANTE DE CONCURRENCIA QUE EL BACKEND DE F5.2 TIENE QUE RESPETAR
-- -------------------------------------------------------------------------------------
-- Este es el escenario que hay que hacer imposible:
--
--   T1  valida que la OT esta ABIERTA
--   T2  cierra la OT
--   T1  inserta la evidencia                 <- una foto entra en una OT ya cerrada
--
-- Y el simetrico, igual de malo:
--
--   T1  sube la 4a evidencia de CAMARAS
--   T2  sube la 4a evidencia de CAMARAS      <- quedan 5 activas
--
-- EL ORDEN DE CERROJOS ES OBLIGATORIO Y NO ES NEGOCIABLE: primero la CABECERA de la orden,
-- despues el detalle. Es el MISMO orden que ya usan editandoLaOrden() y
-- cerrar_orden_trabajo() -"el cerrojo se toma SIEMPRE primero y SIEMPRE sobre la cabecera"-,
-- y respetarlo es lo que serializa la carga contra el cierre en vez de provocar un abrazo
-- mortal entre las dos:
--
--   BEGIN
--   1. SELECT ... FROM ordenes_trabajo        WHERE id = :ot       FOR UPDATE
--      -> aqui se serializa con el cierre. Al obtener el cerrojo, el estado leido ya es
--         el definitivo: si T2 cerro, T1 lee CERRADA y aborta antes de subir nada.
--   2. SELECT ... FROM ordenes_trabajo_detalle WHERE id = :detalle FOR UPDATE
--      -> aqui se serializa con otra carga del MISMO apartado.
--   3. contar las ACTIVAS de ese detalle · rechazar la quinta
--   4. INSERT
--   COMMIT
--
-- El trigger trg_validar_evidencia_ot_abierta del PASO 6 cierra la ventana que quedara si
-- alguien se salta el paso 1: se evalua en el momento del INSERT, asi que con READ
-- COMMITTED ya ve el cierre confirmado por T2 y levanta P0001. Es una red, no un sustituto
-- del cerrojo: sin el paso 1 el error llega tarde, cuando el asset ya se subio a Cloudinary
-- y hay que compensarlo.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- PASO 1 · PRECONDICIONES
-- -------------------------------------------------------------------------------------
-- Se comprueba el estado del que esta migracion depende. Si la base no es la esperada, se
-- aborta ANTES de crear nada: una tabla a medias es peor que ninguna tabla.
DO $$
DECLARE
    v_jsonb_ot   integer;
    v_jsonb_otd  integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo'
    ) THEN
        RAISE EXCEPTION '018 · falta ordenes_trabajo: 20260925_013 no esta aplicada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_detalle'
    ) THEN
        RAISE EXCEPTION '018 · falta ordenes_trabajo_detalle: 20260925_013 no esta aplicada.';
    END IF;

    -- La tabla no debe existir ya: 018 crea, no reemplaza.
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_evidencias'
    ) THEN
        RAISE EXCEPTION '018 · ordenes_trabajo_evidencias ya existe. Esta migracion no se '
            'reaplica: revisa si ya se ejecuto.';
    END IF;

    -- El objetivo de la FK compuesta no puede existir todavia con otro nombre.
    IF EXISTS (
        SELECT 1 FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_detalle'
           AND con.conname = 'uq_otd_id_orden'
    ) THEN
        RAISE EXCEPTION '018 · uq_otd_id_orden ya existe en ordenes_trabajo_detalle.';
    END IF;

    -- El dominio de estado del detalle es lo que gobierna si un apartado exige foto. Si
    -- alguien lo cambiara, las reglas del backend dejarian de corresponder.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_detalle'
           AND con.conname = 'chk_otd_estado'
           AND pg_get_constraintdef(con.oid) LIKE '%COMPLETADO%'
           AND pg_get_constraintdef(con.oid) LIKE '%PARCIAL%'
           AND pg_get_constraintdef(con.oid) LIKE '%PENDIENTE%'
           AND pg_get_constraintdef(con.oid) LIKE '%NO_APLICA%'
    ) THEN
        RAISE EXCEPTION '018 · chk_otd_estado no declara los cuatro estados esperados '
            '(COMPLETADO, PARCIAL, PENDIENTE, NO_APLICA). Las reglas de evidencia del '
            'backend se apoyan en ese dominio exacto.';
    END IF;

    -- La familia sale por JOIN de esta columna. Sin ella no hay forma de saber que apartado
    -- exige fotografia y cual no.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'programacion_mantenimiento_equipos'
           AND column_name = 'tipo_equipo'
    ) THEN
        RAISE EXCEPTION '018 · falta programacion_mantenimiento_equipos.tipo_equipo, que es '
            'de donde se lee la familia del apartado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    ) THEN
        RAISE EXCEPTION '018 · no existe public.set_updated_at(). La crea 20260918_001.';
    END IF;

    -- Se deja constancia de que el jsonb legacy esta vacio en el momento de migrar: es la
    -- razon por la que esta migracion no necesita trasvasar nada.
    SELECT count(*) FILTER (WHERE jsonb_array_length(evidencias) > 0)
      INTO v_jsonb_ot FROM ordenes_trabajo;

    SELECT count(*) FILTER (WHERE jsonb_array_length(evidencias) > 0)
      INTO v_jsonb_otd FROM ordenes_trabajo_detalle;

    RAISE NOTICE '018 · estado inicial: ordenes_trabajo con evidencias jsonb % · '
        'detalles con evidencias jsonb %', v_jsonb_ot, v_jsonb_otd;

    IF v_jsonb_ot > 0 OR v_jsonb_otd > 0 THEN
        RAISE NOTICE '018 · AVISO: hay evidencias en el jsonb legacy. 018 NO las trasvasa. '
            'Revisar antes de dar la tabla nueva por unica fuente de verdad.';
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- PASO 2 · LA CLAVE QUE NECESITA LA FK COMPUESTA
-- -------------------------------------------------------------------------------------
-- ordenes_trabajo_detalle tiene PK(id) y uq_otd_id UNIQUE (id), pero NO UNIQUE
-- (id, orden_trabajo_id). Sin esa clave, una FK de una sola columna permitiria que una
-- evidencia declarara un orden_trabajo_id que NO es el de su detalle, y el requisito de
-- seguridad es exactamente impedir que llegue un detalle_id de otra OT.
--
-- Es redundante para la unicidad -id ya es unico por si solo- y no lo es para la
-- integridad referencial: PostgreSQL exige que el objetivo de una FK compuesta sea una
-- clave declarada. Mismo patron que uq_programacion_equipo_id_programacion, que
-- 20260925_013 anadio por esta misma razon.
ALTER TABLE ordenes_trabajo_detalle
    ADD CONSTRAINT uq_otd_id_orden UNIQUE (id, orden_trabajo_id);

COMMENT ON CONSTRAINT uq_otd_id_orden ON ordenes_trabajo_detalle IS
    'Objetivo de la FK compuesta de ordenes_trabajo_evidencias. Redundante para la '
    'unicidad, necesaria para que la base garantice que una evidencia no puede apuntar a '
    'un detalle de otra orden de trabajo.';

-- -------------------------------------------------------------------------------------
-- PASO 3 · LA TABLA
-- -------------------------------------------------------------------------------------
CREATE TABLE ordenes_trabajo_evidencias (
    id                   integer     GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,

    -- El par que ancla la evidencia. Los dos van juntos a la FK compuesta: declarar
    -- orden_trabajo_id no es informacion duplicada, es lo que permite a la base comprobar
    -- la pertenencia sin consultar nada mas.
    orden_trabajo_id     integer     NOT NULL,
    detalle_id           integer     NOT NULL,

    -- EL ASSET. Se guarda el public_id y NO la URL, y esto se decidio despues de medirlo
    -- contra la cuenta real: con type='authenticated', la secure_url que devuelve Cloudinary
    -- YA viene firmada y entrega la imagen con 200 indefinidamente. Guardarla seria
    -- almacenar un enlace valido para siempre. Con el public_id, la URL se firma en cada
    -- lectura y nunca sale del backend.
    cloudinary_public_id text        NOT NULL,

    -- Metadatos que devuelve el propio upload de Cloudinary. Medido: para una imagen
    -- devuelve format, bytes, width y height siempre.
    formato              varchar(10) NOT NULL,
    bytes                integer     NOT NULL,
    ancho                integer     NOT NULL,
    alto                 integer     NOT NULL,

    -- QUIEN Y CUANDO. created_at ES la fecha de carga: la fila nace en el momento de subir,
    -- asi que una columna 'subida_en' aparte seria la misma fecha escrita dos veces.
    subida_por_id        integer     NOT NULL,

    -- CICLO DE VIDA. Nunca hay DELETE fisico: una evidencia retirada tiene que seguir
    -- demostrando que existio, quien la retiro, cuando y por que.
    estado               varchar(10) NOT NULL DEFAULT 'ACTIVA',
    retirada_por_id      integer     NULL,
    retirada_en          timestamptz NULL,
    motivo_retiro        text        NULL,

    created_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ------------------------------------------------------------------ pertenencia
    -- La evidencia pertenece a un detalle, y ese detalle tiene que ser de ESTA orden.
    -- ON DELETE RESTRICT: la evidencia protege a su detalle de desaparecer. Coherente con
    -- la regla R1 de 20260928_016 -ninguna OT se borra- y con el trigger que ya impide
    -- borrar un detalle de una OT cerrada.
    CONSTRAINT fk_ote_detalle
        FOREIGN KEY (detalle_id, orden_trabajo_id)
        REFERENCES ordenes_trabajo_detalle(id, orden_trabajo_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    -- No se declara una FK suelta a ordenes_trabajo(id): la compuesta de arriba ya fija el
    -- orden_trabajo_id, y el propio detalle tiene fk_otd_orden hacia
    -- ordenes_trabajo(id, programacion_id). Anadirla seria una tercera comprobacion del
    -- mismo hecho. Mismo criterio que sigue ordenes_trabajo_detalle, que tiene dos FK
    -- compuestas y ninguna de una sola columna.

    -- ------------------------------------------------------------------ autoria
    CONSTRAINT fk_ote_subida_por
        FOREIGN KEY (subida_por_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_ote_retirada_por
        FOREIGN KEY (retirada_por_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    -- ------------------------------------------------------------------ el asset
    -- Un public_id identifica UN asset en Cloudinary. Dos filas con el mismo public_id
    -- significarian que dos evidencias comparten imagen, y entonces retirar una dejaria a
    -- la otra apuntando a algo cuya vida no controla.
    CONSTRAINT uq_ote_public_id UNIQUE (cloudinary_public_id),

    CONSTRAINT chk_ote_public_id
        CHECK (btrim(cloudinary_public_id) <> ''),

    -- Los formatos que F5.2 acepta, en los valores que devuelve Cloudinary en `format`.
    -- Medido: para un PNG devuelve 'png'. 'jpg' y 'jpeg' se admiten LOS DOS a proposito:
    -- solo se verifico 'png' contra la cuenta real, y rechazar 'jpeg' por una suposicion no
    -- medida convertiria una subida legitima en un 500. HEIC/HEIF quedan FUERA de F5.2.
    CONSTRAINT chk_ote_formato
        CHECK (formato IN ('jpg', 'jpeg', 'png', 'webp')),

    CONSTRAINT chk_ote_bytes
        CHECK (bytes > 0),

    -- Una imagen sin dimensiones no es una imagen. Cloudinary las devuelve siempre para
    -- resource_type image, asi que exigirlas tambien detecta que se subio otra cosa.
    CONSTRAINT chk_ote_dimensiones
        CHECK (ancho > 0 AND alto > 0),

    -- ------------------------------------------------------------------ ciclo de vida
    CONSTRAINT chk_ote_estado
        CHECK (estado IN ('ACTIVA', 'RETIRADA')),

    -- SIMETRIA DEL RETIRO. El estado y sus tres columnas de respaldo no pueden
    -- desalinearse en ninguna direccion: ni una ACTIVA con motivo de retiro, ni una
    -- RETIRADA sin saber quien, cuando y por que. Mismo criterio que chk_ot_cierre y
    -- chk_ot_anulacion de 20260925_013.
    --
    -- "TEXTO REALMENTE NO VACIO" CON LA MISMA SEMANTICA QUE F5.1, no una segunda.
    -- En F5.1 se midio sobre 23 caracteres contra PostgreSQL 18.6 que la clase que iguala
    -- a trim() de JavaScript es [[:space:]] MAS el BOM U+FEFF: [[:space:]] por si sola
    -- deja pasar el BOM, y btrim() a secas solo quita el espacio simple. Se reutiliza esa
    -- misma clase aqui para que el proyecto tenga UNA definicion de "blanco" y no dos:
    --
    --   F5.1  lower(regexp_replace(col, E'^[[:space:]﻿]+|[[:space:]﻿]+$', '', 'g'))
    --   018   col !~ E'^[[:space:]﻿]*$'            <- "no es SOLO blanco"
    --
    -- Son la misma clase de caracteres expresada de las dos formas que cada sitio necesita:
    -- alli habia que recortar para comparar, aqui basta con rechazar lo que solo es blanco.
    CONSTRAINT chk_ote_retiro
        CHECK (
            (estado = 'ACTIVA'
                AND retirada_por_id IS NULL
                AND retirada_en     IS NULL
                AND motivo_retiro   IS NULL)
            OR
            (estado = 'RETIRADA'
                AND retirada_por_id IS NOT NULL
                AND retirada_en     IS NOT NULL
                AND motivo_retiro   IS NOT NULL
                AND motivo_retiro !~ E'^[[:space:]\\uFEFF]*$')
        )
);

COMMENT ON TABLE ordenes_trabajo_evidencias IS
    'Evidencia fotografica de una orden de trabajo TI-PR-01, asociada al APARTADO concreto '
    '-ordenes_trabajo_detalle- y no a la orden en bloque. Unica fuente de verdad de la '
    'evidencia: las columnas jsonb evidencias de ordenes_trabajo y ordenes_trabajo_detalle '
    'quedan sin uso operativo desde 018. La imagen vive en Cloudinary con '
    'type=authenticated y se sirve SIEMPRE a traves del backend del ERP, que firma la URL '
    'internamente; aqui solo se guarda su public_id. Nunca hay DELETE fisico: retirar es '
    'estado=RETIRADA con autor, fecha y motivo.';

COMMENT ON COLUMN ordenes_trabajo_evidencias.detalle_id IS
    'El APARTADO al que pertenece la foto. La familia -CAMARAS, COPILOTO, RADIO_BASE, GPS, '
    'ADAS- NO se guarda aqui: se lee por JOIN a programacion_mantenimiento_equipos.'
    'tipo_equipo a traves del detalle. Solo CAMARAS, COPILOTO y RADIO_BASE admiten '
    'evidencia fotografica.';

COMMENT ON COLUMN ordenes_trabajo_evidencias.cloudinary_public_id IS
    'Identificador persistente del asset en Cloudinary. Se guarda el public_id y NO la URL: '
    'con type=authenticated la URL que devuelve el upload ya viene firmada y seria valida '
    'indefinidamente. La URL se firma en cada lectura, dentro del backend, y no se entrega '
    'al navegador.';

COMMENT ON COLUMN ordenes_trabajo_evidencias.created_at IS
    'Fecha de carga de la evidencia: la fila nace al subir la imagen.';

COMMENT ON COLUMN ordenes_trabajo_evidencias.estado IS
    'ACTIVA cuenta para el minimo y el maximo de evidencias del apartado y aparece en la '
    'galeria. RETIRADA no cuenta ni aparece, pero conserva la traza de que existio.';

COMMENT ON COLUMN ordenes_trabajo_evidencias.motivo_retiro IS
    'Obligatorio y no vacio cuando estado=RETIRADA, por chk_ote_retiro. Prohibido cuando '
    'estado=ACTIVA.';

-- -------------------------------------------------------------------------------------
-- PASO 4 · INDICES
-- -------------------------------------------------------------------------------------
-- EL PARCIAL DE ACTIVAS. Es el camino caliente: contar las activas de un apartado para la
-- galeria y para decidir si se admite una carga mas.
--
-- NO IMPLEMENTA EL MAXIMO DE 4, y conviene que quede escrito: "como maximo 4 filas" no es
-- una condicion de unicidad y ningun indice la expresa. El tope lo resuelve el backend
-- dentro de la transaccion: SELECT ... FOR UPDATE sobre la fila del DETALLE, contar las
-- activas, insertar, y rechazar la quinta. El cerrojo sobre el detalle es lo que serializa
-- dos cargas simultaneas del mismo apartado.
CREATE INDEX idx_ote_activas_detalle
    ON ordenes_trabajo_evidencias (detalle_id)
    WHERE estado = 'ACTIVA';

COMMENT ON INDEX idx_ote_activas_detalle IS
    'Camino de consulta de las evidencias vigentes de un apartado. NO impone el maximo de '
    '4 activas: eso no es unicidad y lo resuelve el backend con FOR UPDATE sobre el detalle.';

-- La galeria de una OT y las consultas analiticas parten de la orden. Tambien da indice a
-- la primera columna de la FK compuesta por el lado hijo.
CREATE INDEX idx_ote_orden
    ON ordenes_trabajo_evidencias (orden_trabajo_id);

-- -------------------------------------------------------------------------------------
-- PASO 5 · updated_at
-- -------------------------------------------------------------------------------------
-- Convencion del esquema: todas las tablas del dominio llevan su set_updated_at.
CREATE TRIGGER trg_set_updated_at_ordenes_trabajo_evidencias
    BEFORE UPDATE ON ordenes_trabajo_evidencias
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------------------------------
-- PASO 6 · ULTIMA LINEA DE DEFENSA · UNA FOTO SOLO ENTRA EN UNA OT ABIERTA
-- -------------------------------------------------------------------------------------
-- Integridad historica: una OT CERRADA o ANULADA no debe poder recibir fotografias nuevas
-- por un bug, por un endpoint futuro ni por una escritura accidental. El permiso lo decide
-- el backend; esto es el ultimo filtro, en la base, por si el backend se equivoca.
--
-- SOLO INSERT, Y ESO ES LO ESENCIAL. El retiro administrativo es una operacion DISTINTA y
-- tiene que seguir funcionando despues del cierre:
--
--   INSERT                    -> unicamente con la OT ABIERTA. Lo impone este trigger.
--   UPDATE ACTIVA->RETIRADA   -> TI en ABIERTA · ADMIN en CERRADA · ADMIN en ANULADA.
--                                NO se toca: no hay ninguna prohibicion generica de UPDATE
--                                sobre esta tabla, y no debe haberla.
--
-- Por eso el trigger es BEFORE INSERT y nada mas. Un BEFORE INSERT OR UPDATE romperia el
-- retiro, que es justamente lo que el negocio necesita conservar.
--
-- Mismo patron que validar_apertura_ot de 20260925_013: una funcion que lee el estado de la
-- fila padre y levanta P0001 con un mensaje propio. Se mantiene su search_path explicito.
CREATE FUNCTION validar_evidencia_ot_abierta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_estado varchar(10);
BEGIN
    SELECT estado INTO v_estado
      FROM ordenes_trabajo
     WHERE id = NEW.orden_trabajo_id;

    -- Inalcanzable con fk_ote_detalle en pie -el detalle no existiria-, pero un mensaje
    -- propio es mas util que el de la clave foranea si algun dia cambia el orden.
    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'La orden de trabajo % no existe.', NEW.orden_trabajo_id;
    END IF;

    IF v_estado <> 'ABIERTA' THEN
        RAISE EXCEPTION 'La orden de trabajo % esta %: no admite evidencia nueva. '
            'Solo una OT ABIERTA recibe fotografias; retirar una existente si sigue '
            'permitido segun quien lo haga.', NEW.orden_trabajo_id, v_estado;
    END IF;

    -- Una evidencia NACE activa y sin datos de retiro. chk_ote_retiro ya lo exige, pero
    -- decirlo aqui da el motivo en vez de un 23514 ilegible.
    IF NEW.estado <> 'ACTIVA' THEN
        RAISE EXCEPTION 'Una evidencia nace ACTIVA; se recibio %.', NEW.estado;
    END IF;

    RETURN NEW;
END $$;

COMMENT ON FUNCTION validar_evidencia_ot_abierta() IS
    'Ultima linea de defensa de 018: una evidencia solo puede INSERTARSE con su orden de '
    'trabajo ABIERTA, y nace ACTIVA. NO interviene en el UPDATE, porque el retiro '
    'administrativo debe seguir siendo posible con la OT CERRADA o ANULADA.';

CREATE TRIGGER trg_validar_evidencia_ot_abierta
    BEFORE INSERT ON ordenes_trabajo_evidencias
    FOR EACH ROW EXECUTE FUNCTION validar_evidencia_ot_abierta();

-- -------------------------------------------------------------------------------------
-- PASO 6 · VERIFICACION DENTRO DE LA MISMA TRANSACCION
-- -------------------------------------------------------------------------------------
-- Si algo de lo anterior no quedo como se esperaba, se aborta y no se confirma nada.
DO $$
DECLARE
    v_cols     integer;
    v_fk       integer;
    v_chk      integer;
    v_idx      integer;
    v_trg      integer;
    v_filas    integer;
BEGIN
    SELECT count(*) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_evidencias';

    IF v_cols <> 15 THEN
        RAISE EXCEPTION '018 · la tabla deberia tener 15 columnas y tiene %.', v_cols;
    END IF;

    -- las tres FK: el detalle y los dos usuarios
    SELECT count(*) INTO v_fk
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     WHERE c.relname = 'ordenes_trabajo_evidencias' AND con.contype = 'f';

    IF v_fk <> 3 THEN
        RAISE EXCEPTION '018 · deberian existir 3 claves foraneas y hay %.', v_fk;
    END IF;

    -- la FK del detalle TIENE que ser compuesta: es lo que impide una evidencia de otra OT
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_evidencias'
           AND con.conname = 'fk_ote_detalle'
           AND pg_get_constraintdef(con.oid)
               LIKE 'FOREIGN KEY (detalle_id, orden_trabajo_id)%'
    ) THEN
        RAISE EXCEPTION '018 · fk_ote_detalle no es compuesta: una evidencia podria apuntar '
            'a un detalle de otra orden de trabajo.';
    END IF;

    -- los seis CHECK declarados
    SELECT count(*) INTO v_chk
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     WHERE c.relname = 'ordenes_trabajo_evidencias' AND con.contype = 'c'
       AND con.conname IN ('chk_ote_public_id', 'chk_ote_formato', 'chk_ote_bytes',
                           'chk_ote_dimensiones', 'chk_ote_estado', 'chk_ote_retiro');

    IF v_chk <> 6 THEN
        RAISE EXCEPTION '018 · deberian existir los 6 CHECK propios y hay %.', v_chk;
    END IF;

    -- La simetria del retiro tiene que cubrir los DOS sentidos y conservar el rechazo del
    -- motivo en blanco.
    --
    -- Se busca '[[:space:]' SIN el corchete de cierre a proposito: la clase lleva ademas el
    -- BOM, y PostgreSQL almacena ese caracter LITERAL dentro de los corchetes, de modo que
    -- la definicion guardada es '[[:space:]<BOM>]' y no '[[:space:]]'. Buscar el literal
    -- completo fallaba -lo detecto la pasada en seco-, y poner el BOM en el patron volveria
    -- esta comprobacion ilegible.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_evidencias'
           AND con.conname = 'chk_ote_retiro'
           AND pg_get_constraintdef(con.oid) LIKE '%ACTIVA%'
           AND pg_get_constraintdef(con.oid) LIKE '%RETIRADA%'
           AND pg_get_constraintdef(con.oid) LIKE '%[[:space:]%'
           AND pg_get_constraintdef(con.oid) LIKE '%!~%'
    ) THEN
        RAISE EXCEPTION '018 · chk_ote_retiro no cubre los dos sentidos o perdio el rechazo '
            'del motivo en blanco.';
    END IF;

    -- el unique del public_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_evidencias'
           AND con.conname = 'uq_ote_public_id' AND con.contype = 'u'
    ) THEN
        RAISE EXCEPTION '018 · falta uq_ote_public_id.';
    END IF;

    -- el indice parcial, con su predicado
    SELECT count(*) INTO v_idx
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'ordenes_trabajo_evidencias'
       AND indexname = 'idx_ote_activas_detalle'
       AND indexdef LIKE '%WHERE%ACTIVA%';

    IF v_idx <> 1 THEN
        RAISE EXCEPTION '018 · falta el indice parcial de activas o perdio su predicado.';
    END IF;

    -- la clave de apoyo en el detalle
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'ordenes_trabajo_detalle'
           AND con.conname = 'uq_otd_id_orden' AND con.contype = 'u'
    ) THEN
        RAISE EXCEPTION '018 · falta uq_otd_id_orden en ordenes_trabajo_detalle.';
    END IF;

    SELECT count(*) INTO v_trg
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'ordenes_trabajo_evidencias' AND NOT t.tgisinternal;

    IF v_trg <> 2 THEN
        RAISE EXCEPTION '018 · deberian haber 2 triggers -set_updated_at y la defensa de '
            'INSERT- y hay %.', v_trg;
    END IF;

    -- LA DEFENSA TIENE QUE SER SOLO DE INSERT. Si algun dia alguien la ampliara a UPDATE,
    -- romperia el retiro administrativo de una OT cerrada o anulada, que es exactamente lo
    -- que el negocio necesita conservar. Se comprueba en el propio DDL del trigger.
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'ordenes_trabajo_evidencias'
           AND t.tgname = 'trg_validar_evidencia_ot_abierta'
           AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT ON%'
           AND pg_get_triggerdef(t.oid) NOT LIKE '%UPDATE%'
    ) THEN
        RAISE EXCEPTION '018 · trg_validar_evidencia_ot_abierta no es BEFORE INSERT puro: '
            'si cubriera UPDATE bloquearia el retiro administrativo.';
    END IF;

    -- ADITIVA: la tabla nace vacia y no se toco ningun dato existente
    SELECT count(*) INTO v_filas FROM ordenes_trabajo_evidencias;

    IF v_filas <> 0 THEN
        RAISE EXCEPTION '018 · la tabla deberia nacer vacia y tiene % filas.', v_filas;
    END IF;

    -- las dos columnas jsonb legacy siguen existiendo: 018 no las retira
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo'
           AND column_name = 'evidencias'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ordenes_trabajo_detalle'
           AND column_name = 'evidencias'
    ) THEN
        RAISE EXCEPTION '018 · alguna columna jsonb evidencias desaparecio. 018 no debe '
            'retirarlas: su DROP es trabajo de un cleanup propio.';
    END IF;

    -- La funcion de la defensa tiene que existir con su search_path acotado, como las de
    -- 013 y 015.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'validar_evidencia_ot_abierta'
    ) THEN
        RAISE EXCEPTION '018 · falta la funcion validar_evidencia_ot_abierta().';
    END IF;

    RAISE NOTICE '018 · OK · ordenes_trabajo_evidencias creada vacia: % columnas, 3 FK '
        '-la del detalle compuesta-, 6 CHECK, 1 UNIQUE, indice parcial de activas, '
        'set_updated_at y la defensa de INSERT solo con la OT ABIERTA. uq_otd_id_orden '
        'anadida al detalle. Las dos columnas jsonb evidencias siguen intactas y sin uso '
        'operativo.', v_cols;
END $$;

COMMIT;
