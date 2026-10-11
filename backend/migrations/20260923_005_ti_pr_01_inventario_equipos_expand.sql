-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260923_005 · INVENTARIO FISICO DE EQUIPOS POR VEHICULO
-- =====================================================================================
-- CLASIFICACION: EXPANSION PURA. Solo crea objetos nuevos.
--                0 DROP, 0 ALTER sobre tablas existentes, 0 DML.
--
-- POR QUE EXISTE
-- --------------
-- Hoy el inventario vive en 5 booleanos de vehiculos (dvr_instalado,
-- copiloto_instalado, radio_base_instalado, camaras_instaladas, gps_instalado).
-- Las hojas STATUS CAMIONETAS / STATUS TRACTOS del Excel TI-PR-01 registran en
-- realidad 8 equipos FISICOS distintos, cada uno con marca, numero de serie,
-- fecha de instalacion y observaciones. Los 5 booleanos no pueden almacenar eso:
--   * agrupan DVR INTERNA + DVR EXTERNA en un solo "dvr_instalado"
--   * agrupan CAMARA INTERNA + CAMARA EXTERNA + ADAS en "camaras_instaladas"
--   * no tienen donde guardar marca, serie, fecha ni observacion
--
-- ESTA TABLA NO SUSTITUYE TODAVIA A LOS 5 BOOLEANOS. Convive con ellos.
-- Los booleanos quedan intactos y, por instruccion expresa, se dejan en NULL:
-- no se derivan ni se rellenan en esta migracion ni en la carga de Fase B.
--
-- LOS 8 TIPOS FISICOS Y SU ORIGEN EXACTO EN LAS HOJAS STATUS
-- ----------------------------------------------------------
--   tipo_equipo       bloque de la hoja STATUS   fecha / marca / serie / obs
--   ----------------  -------------------------  ---------------------------
--   DVR_INTERNO       CAMARA INTERNA             I  / J  / -  / L
--   CAMARA_INTERNA    CAMARA INTERNA             I  / K  / -  / L
--   DVR_EXTERNO       CAMARA EXTERNA             M  / N  / -  / P
--   CAMARA_EXTERNA    CAMARA EXTERNA             M  / O  / -  / P
--   ADAS              CAMARAS ADAS               Q  / R  / S  / T
--   COPILOTO          COPILOTO VIRTUAL           U  / V  / W  / X
--   RADIO_BASE        RADIO BASE                 Y  / Z  / AA / AB
--   GPS               GPS                        AC / AE / AD / AF   (+AG estado operativo)
--
-- ATENCION AL BLOQUE GPS: sus dos columnas estan permutadas respecto de su rotulo.
--   AD se titula "TIPO DE GPS" pero contiene NUMEROS DE SERIE: 105 valores distintos,
--      casi todos unicos (HA1DTYAZ, HPV39JM2, HGCHRZK2, ...), mas 4 marcadores que no
--      son series y por eso no se importan como tales: TDCTDC (x34), SIN COPILOTO (x6),
--      0 (x4) y SIN SERIE (x2).
--   AE se titula "MODELO DE GPS" y contiene la identidad real del equipo: solo 8
--      valores (Ruptela_Pro4_3G x72, Ruptela_HCV5 x57, Ruptela_Pro5_4G x15,
--      Ruptela_Pro5_3G x10, U1_Plus3G x8, RUPTELA--- x6, Ruptela_LCV x1, FM_Pro4 x1).
--   Por eso la evidencia de instalacion y la marca del GPS salen de AE, y la serie de AD.
--   La propia hoja derivada del libro, IMP_EQUIPOS_STATUS, hace exactamente lo mismo:
--   su columna "marca" toma los valores Ruptela_* de AE.
--   Leer AD como evidencia daba 148 GPS instalados en vez de 171: habria convertido en
--   POR_VALIDAR 23 unidades que si tienen GPS, modelo y fecha de instalacion.
--
-- COMPROBACION CRUZADA CONTRA EL PROPIO LIBRO
-- -------------------------------------------
-- La derivacion desde las hojas STATUS se comparo fila a fila con IMP_EQUIPOS_STATUS,
-- la hoja que el propio Excel ya trae calculada: 1400 filas, 1400 coincidencias,
-- 0 diferencias. (Esa hoja escribe NO donde STATUS dice NO APLICA; es el mismo estado.)
--
-- DOMINIO DE estado_inventario · 3 ESTADOS, DEMOSTRADOS SOBRE LA FUENTE
-- ---------------------------------------------------------------------
-- Auditoria de los valores reales de las dos hojas STATUS (26 valores distintos):
--   * "NO APLICA"  ...... 164 celdas  -> el equipo no corresponde a esa unidad
--   * celda VACIA  ...... 224 celdas  -> no hay evidencia; hay que verificar en campo
--   * resto ............. siempre una marca concreta (HIKVISION, Ruptela_HCV5, ...)
--                          1012 celdas -> el equipo esta instalado
--
-- UNIVERSO DEL INVENTARIO: 175 unidades, no 174
-- ---------------------------------------------
-- El programa tiene 174 unidades ACTIVAS. El inventario cubre las 175 unidades
-- presentes en las hojas STATUS: las 174 activas mas V5K756, que esta VENDIDA y figura
-- en BAJAS pero conserva su historial de equipos (STATUS TRACTOS fila 34).
--   inventario total ................ 1400 filas (175 x 8)
--   de unidades activas ............. 1392 filas (174 x 8)
--   historico de V5K756 ...............   8 filas
-- La condicion VENDIDA pertenece a la UNIDAD, no a sus equipos: los 8 registros de
-- V5K756 conservan lo que dice STATUS (7 POR_VALIDAR y 1 GPS Ruptela_Pro5_4G
-- INSTALADO). NO se convierten a NO_APLICA.
-- V5K756 NO entra en programa_mantenimiento_unidades y no genera programacion.
--
-- Reparto por tipo fisico (175 unidades, 1400 combinaciones):
--   tipo             INSTALADO  NO_APLICA  POR_VALIDAR
--   DVR_INTERNO           143        9          23
--   CAMARA_INTERNA        143        9          23
--   DVR_EXTERNO           143        9          23
--   CAMARA_EXTERNA        143        9          23
--   ADAS                   28       67          80
--   COPILOTO              122       28          25
--   RADIO_BASE            119       33          23
--   GPS                   171        0           4
-- NO existe en la fuente ningun valor que signifique "NO INSTALADO" como estado
-- distinto de "NO APLICA". Por eso el dominio tiene 3 valores y no 4: introducir
-- NO_INSTALADO seria inventar una distincion que el Excel no sostiene.
--
-- Nota sobre 5 observaciones que mencionan desinstalacion o retiro
-- (V9T961/GPS, V7Z928/COPILOTO, B6Z714/GPS, CAS842/ADAS, VCI782/COPILOTO):
-- el texto se conserva en observaciones. NO altera el estado derivado, porque la
-- columna de evidencia sigue diciendo lo que dice.
--
-- REGLA DE PROYECCION INVENTARIO (8 fisicos) -> MANTENIMIENTO (5 del programa)
-- ----------------------------------------------------------------------------
-- El programa TI-PR-01 mantiene 5 tipos: DVR, CAMARAS, COPILOTO, RADIO_BASE, GPS.
-- La proyeccion es la siguiente, y es la unica direccion valida
-- (inventario -> mantenimiento; nunca al contrario):
--   DVR         <- DVR_INTERNO  OR DVR_EXTERNO
--   CAMARAS     <- CAMARA_INTERNA OR CAMARA_EXTERNA
--   COPILOTO    <- COPILOTO
--   RADIO_BASE  <- RADIO_BASE
--   GPS         <- GPS
--   ADAS        <- SIN PROYECCION. Se inventaria pero NO se mantiene.
--
-- ADAS es el unico de los 8 tipos fisicos que no tiene periodicidad en el programa:
-- se registra su existencia, marca, serie y fecha, y no genera visitas. Por eso NO
-- forma parte de la proyeccion de CAMARAS.
-- Comprobado: NINGUNA unidad (0 de 174) tiene ADAS instalado sin tener tambien camara
-- interna o externa instalada. Excluir ADAS de la proyeccion no cambia el numero de
-- unidades mantenibles en CAMARAS (145 en ambos casos); la razon de excluirlo es
-- semantica, no numerica: ADAS no tiene periodicidad que aplicar.
-- Un tipo de mantenimiento aplica a una unidad si ALGUNO de sus equipos fisicos
-- esta INSTALADO. Si todos estan en NO_APLICA, no aplica. Si hay algun
-- POR_VALIDAR y ninguno INSTALADO, la unidad queda pendiente de verificacion y
-- NO se programa: POR_VALIDAR nunca se interpreta como NO.
-- Esta regla NO se implementa aqui (no se crea vista ni trigger); queda
-- documentada para la adaptacion posterior de backend/initDb.
--
-- Resultado de aplicarla a las 174 unidades ACTIVAS del programa (V5K756 excluida).
-- Cifras medidas contra la carga real, no estimadas:
--   tipo de mantenimiento   unidades a las que aplica   unidades con algun POR_VALIDAR
--   DVR                              145                          22
--   CAMARAS                          145                          22
--   COPILOTO                         122                          24
--   RADIO_BASE                       119                          22
--   GPS                              170                           4
-- Las 4 unidades con GPS por validar son V9U834, VFD743, VFB802 y VFD863: sus celdas
-- de GPS contenian un espacio en blanco, no un dato. Un espacio no es evidencia de
-- equipo instalado, y tampoco de lo contrario.
--
-- TRANSACCIONAL: ejecutar completa dentro de BEGIN/COMMIT.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1 · TABLA
-- -------------------------------------------------------------------------------------
CREATE TABLE vehiculo_equipos (
    id                  serial       PRIMARY KEY,
    placa               varchar(20)  NOT NULL,
    tipo_equipo         varchar(30)  NOT NULL,
    estado_inventario   varchar(20)  NOT NULL DEFAULT 'POR_VALIDAR',
    marca               varchar(120),
    numero_serie        varchar(120),
    fecha_instalacion   date,
    observaciones       text,
    fuente              varchar(30)  NOT NULL,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),

    -- La unidad tiene que existir en el maestro. ON UPDATE CASCADE porque placa es
    -- una clave natural corregible (ver migracion 006 de reconciliacion).
    CONSTRAINT fk_vehiculo_equipo_vehiculo
        FOREIGN KEY (placa) REFERENCES vehiculos (placa)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    -- Un solo registro de inventario por unidad y tipo fisico de equipo.
    CONSTRAINT uq_vehiculo_equipo UNIQUE (placa, tipo_equipo),

    -- Los 8 tipos fisicos de las hojas STATUS. Cerrado a proposito: cualquier
    -- equipo nuevo obliga a una migracion explicita, no a un valor libre.
    CONSTRAINT chk_vehiculo_equipo_tipo CHECK (tipo_equipo IN (
        'DVR_INTERNO', 'CAMARA_INTERNA',
        'DVR_EXTERNO', 'CAMARA_EXTERNA',
        'ADAS', 'COPILOTO', 'RADIO_BASE', 'GPS')),

    -- 3 estados demostrados sobre la fuente. Ver cabecera.
    CONSTRAINT chk_vehiculo_equipo_estado CHECK (estado_inventario IN (
        'INSTALADO', 'NO_APLICA', 'POR_VALIDAR')),

    -- Trazabilidad del dato: de que hoja o proceso salio.
    CONSTRAINT chk_vehiculo_equipo_fuente CHECK (fuente IN (
        'STATUS_CAMIONETAS', 'STATUS_TRACTOS', 'MANUAL', 'ERP')),

    -- Coherencia: marca, serie y fecha de instalacion solo tienen sentido si el
    -- equipo esta instalado. Si esta en NO_APLICA o POR_VALIDAR no puede arrastrar
    -- datos tecnicos. observaciones queda libre, para no perder el historico.
    -- Lo inverso NO se exige: hay unidades INSTALADO sin serie ni fecha porque la
    -- fuente no las trae (32 series ficticias y 8 fechas futuras fueron vaciadas).
    CONSTRAINT chk_vehiculo_equipo_datos_solo_instalado CHECK (
        estado_inventario = 'INSTALADO'
        OR (marca IS NULL AND numero_serie IS NULL AND fecha_instalacion IS NULL))
);

-- -------------------------------------------------------------------------------------
-- 2 · INDICE
--     (placa, tipo_equipo) ya esta cubierto por uq_vehiculo_equipo.
--     Este sirve al recuento por equipo y a la deteccion de pendientes:
--     "cuantas unidades tienen GPS POR_VALIDAR".
-- -------------------------------------------------------------------------------------
CREATE INDEX idx_vehiculo_equipos_tipo_estado
    ON vehiculo_equipos (tipo_equipo, estado_inventario);

-- -------------------------------------------------------------------------------------
-- 3 · TRIGGER updated_at  (misma funcion y convencion de nombre que el resto)
-- -------------------------------------------------------------------------------------
CREATE TRIGGER trg_set_updated_at_vehiculo_equipos
    BEFORE UPDATE ON vehiculo_equipos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------------------------------
-- 4 · DOCUMENTACION
-- -------------------------------------------------------------------------------------
COMMENT ON TABLE vehiculo_equipos IS
    'Inventario fisico de equipos tecnologicos por unidad, con marca, serie, fecha de instalacion y observaciones. Fuente: hojas STATUS CAMIONETAS y STATUS TRACTOS del Excel TI-PR-01. Convive con los 5 booleanos de vehiculos, que NO se derivan de aqui todavia.';

COMMENT ON COLUMN vehiculo_equipos.tipo_equipo IS
    '8 tipos fisicos. Se proyectan sobre los 5 tipos de mantenimiento del programa: DVR<-DVR_INTERNO|DVR_EXTERNO, CAMARAS<-CAMARA_INTERNA|CAMARA_EXTERNA|ADAS, y COPILOTO/RADIO_BASE/GPS uno a uno.';

COMMENT ON COLUMN vehiculo_equipos.estado_inventario IS
    'INSTALADO: la fuente indica una marca concreta. NO_APLICA: la fuente dice NO APLICA. POR_VALIDAR: la celda esta vacia, no hay evidencia. POR_VALIDAR nunca equivale a NO.';

COMMENT ON COLUMN vehiculo_equipos.observaciones IS
    'Texto literal de la columna de observaciones de la hoja STATUS. Puede documentar desinstalaciones o retiros; eso NO cambia estado_inventario.';
