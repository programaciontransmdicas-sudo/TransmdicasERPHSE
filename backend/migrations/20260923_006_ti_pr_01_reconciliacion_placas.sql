-- =====================================================================================
-- TI-PR-01 · MIGRACION 20260923_006 · RECONCILIACION DE PLACAS CONTRA EL EXCEL CANONICO
-- =====================================================================================
-- CLASIFICACION: NORMALIZACION DE CLAVE NATURAL (DDL de FK + DML de datos).
--                0 DROP COLUMN, 0 DROP TABLE, 0 DELETE de filas de negocio.
--
-- PROBLEMA
-- --------
-- vehiculos.placa esta escrita con guion ("V0R-757") y el Excel TI-PR-01, que es la
-- fuente canonica del programa, la escribe sin guion ("V0R757"). Por eso las 174
-- unidades activas del programa fallaban al insertarse en
-- programa_mantenimiento_unidades con 23503 (fk_programa_unidad_vehiculo).
--
-- El criterio es: la placa del Excel es la forma canonica y se usa EXACTA como clave.
--
-- LO QUE NO SE HACE, POR INSTRUCCION EXPRESA
-- ------------------------------------------
--   * NO se normaliza a ciegas. Cada par origen->destino esta escrito literalmente
--     mas abajo y se verifica uno a uno.
--   * NO se convierte O <-> 0 en ningun caso. Las placas con letra O y con cero son
--     unidades DISTINTAS y se dejan distintas:
--        - en la BD existe V0R-739 y VOR-739 (cero y letra O): ambas se conservan
--        - VDO898 / VDO941 llevan letra O en el Excel
--        - V0R915 / V0R941 llevan CERO en el Excel
--     La unica diferencia que esta migracion elimina es el GUION.
--   * NO se borra ninguna unidad del maestro por no estar en el programa. Las
--     7 placas que existen solo en la BD se conservan intactas, sin renombrar:
--        D4R-972 · DEMO · F3L-787 · VD0-941 · VFB-827 · VOR-739 · VOR-748
--     DEMO y los registros historicos tampoco se borran.
--   * V5K-756 SI se renombra (bloque 3-bis) porque esa unidad si esta en STATUS y
--     necesita placa canonica para su inventario historico. No se elimina.
--
-- ESTRATEGIA ELEGIDA Y POR QUE
-- ----------------------------
-- De las 5 FK que apuntan a vehiculos.placa, solo UNA tenia ON UPDATE CASCADE:
--   incidentes_soporte.incidentes_soporte_placa_fkey            UPD=RESTRICT    0 filas
--   inspecciones_flota.inspecciones_flota_placa_fkey            UPD=NO ACTION 346 filas
--   mantenimientos_tecnicos.mantenimientos_tecnicos_placa_fkey  UPD=RESTRICT  148 filas
--   tickets_unidades.tickets_unidades_placa_fkey                UPD=NO ACTION   1 fila
--   programa_mantenimiento_unidades.fk_programa_unidad_vehiculo UPD=CASCADE     0 filas
--
-- Con 4 FK sin CASCADE, un UPDATE de la placa falla (23503 / 23001). Las dos
-- estrategias posibles eran:
--   (A) normalizar las 4 FK a ON UPDATE CASCADE y hacer un UPDATE del maestro;
--   (B) insertar la placa nueva, repuntar los hijos, borrar la placa vieja.
-- Se elige (A). Razones:
--   * placa es una clave natural corregible; ON UPDATE CASCADE es exactamente la
--     semantica correcta para eso, y es la que ya tiene fk_programa_unidad_vehiculo.
--   * (B) exige DELETE sobre el maestro y repunteo manual de 495 filas hijas, con
--     riesgo de dejar historico huerfano. (A) no borra nada.
--   * ON DELETE NO SE TOCA en ninguna de las 4. No se introduce ningun camino de
--     borrado en cascada nuevo.
--
-- Al probar (A) aparecio un segundo obstaculo, no previsto: 29 filas violan desde
-- antes los CHECK NOT VALID de operacion/cliente, y un UPDATE las re-valida. Se
-- documenta y se rodea sin tocar datos en el bloque 2.
--
-- UNIVERSOS
-- ---------
--   175 unidades presentes en las hojas STATUS  -> universo del INVENTARIO
--   174 unidades activas en IMP_UNIDADES        -> universo del PROGRAMA
--     1 unidad historica: V5K756, VENDIDA, en BAJAS, en STATUS TRACTOS fila 34.
--       Entra al inventario como historico y NO al programa.
--   172 vehiculos en la BD
--   164 coinciden 1:1 salvo el guion  -> se renombran (bloque 3)
--     1 renombrado historico adicional -> V5K-756 a V5K756 (bloque 3-bis)
--    10 estan en el Excel y no en la BD -> se crean (bloque 5)
--     7 estan en la BD y no en el Excel -> se conservan sin cambios
--   0 coincidencias exactas previas · 0 claves ambiguas · 0 colisiones de PK
--
-- POR QUE HAY UN RENOMBRADO 165
-- -----------------------------
-- vehiculo_equipos.placa tiene FK contra vehiculos.placa. Para que V5K756 conserve sus
-- 8 registros de inventario con la placa canonica del Excel, esa placa tiene que existir
-- en el maestro. La BD la escribe V5K-756 y el Excel V5K756: es la misma unidad y la
-- unica diferencia es el guion, exactamente igual que en los 164 casos aprobados.
-- Se renombra en un bloque aparte para que el mapping aprobado de 164 siga siendo
-- verificable por separado. No se borra nada: su historico (1 inspeccion y 1
-- mantenimiento tecnico) viaja por ON UPDATE CASCADE.
-- La condicion VENDIDA pertenece a la unidad, no a sus equipos: sus 8 filas de
-- inventario conservan el estado que dice STATUS, sin convertirse a NO_APLICA.
--
-- TRANSACCIONAL: ejecutar completa dentro de BEGIN/COMMIT.
-- Los bloques 0 y 4 abortan la transaccion si algo no cuadra.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0 · GUARDA PREVIA. Si el maestro no esta como se audito, no se toca nada.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_origen   integer;
    v_colision integer;
BEGIN
    SELECT count(*) INTO v_origen
    FROM vehiculos v
    WHERE v.placa IN ('V0R-757', 'V0R-775', 'V0R-877', 'V5K-729', 'V5K-758', 'V5K-772', 'V5K-778', 'V6V-849', 'V6V-850', 'V6V-853', 'V6V-866', 'V6V-874', 'V6V-876', 'V6V-880', 'V6V-889', 'V7L-859', 'V7L-860', 'V7L-872', 'V7L-877', 'V7L-892', 'V7L-911', 'V7L-926', 'V7L-943', 'V8A-743', 'V8A-789', 'V8A-792', 'V8A-793', 'V8A-796', 'V8A-799', 'V8A-803', 'V8A-804', 'VBU-712', 'VBU-737', 'V6V-859', 'V6V-865', 'V7L-924', 'V9E-937', 'V9E-947', 'V9E-948', 'V9F-778', 'V9F-780', 'V9V-846', 'V9V-860', 'VBU-734', 'VEW-721', 'VEW-834', 'BJB-753', 'V7Z-928', 'VAL-827', 'VAL-860', 'VAM-846', 'VBZ-736', 'BUW-928', 'CJQ-858', 'CJR-734', 'CJR-910', 'CJS-849', 'CJT-845', 'V0M-937', 'V0N-770', 'V0T-715', 'V8A-794', 'V8A-809', 'V9F-795', 'V9V-856', 'V9V-867', 'VAM-800', 'VAM-806', 'VBU-704', 'VBU-705', 'VBU-716', 'VBU-717', 'VBU-733', 'VBU-736', 'VBU-738', 'VBU-752', 'VBU-754', 'VBU-765', 'VBX-798', 'VBY-760', 'VBY-773', 'VBY-798', 'VBY-814', 'VBY-830', 'VBY-832', 'VBY-850', 'VBY-886', 'VBY-926', 'VCA-886', 'VCP-820', 'VCS-745', 'VCW-921', 'VCW-922', 'VCW-924', 'VCW-931', 'VCX-716', 'VCX-728', 'VCX-739', 'VDN-818', 'VEW-740', 'VEW-782', 'VFD-743', 'CAR-924', 'CAR-925', 'CAR-943', 'CAR-945', 'CAR-946', 'CAS-701', 'CAS-765', 'CAS-842', 'CAS-843', 'CAT-902', 'V0I-941', 'V0J-700', 'V0J-702', 'V0J-706', 'V0J-728', 'V0R-721', 'V0R-737', 'V0R-738', 'V0R-739', 'V0R-748', 'V0R-772', 'V0R-791', 'V9V-841', 'V9V-843', 'VAM-751', 'VAM-782', 'VAM-791', 'VAP-804', 'VAP-805', 'VAP-812', 'VAP-813', 'VAP-815', 'VAP-816', 'VAP-819', 'VAP-827', 'VAP-830', 'VAP-860', 'VAS-917', 'VBZ-701', 'VCI-781', 'VCI-782', 'VCI-837', 'VCP-807', 'VCP-837', 'VCP-839', 'VCS-735', 'VCW-930', 'VCX-715', 'VCX-729', 'VDO-908', 'VEZ-930', 'VFB-802', 'VFD-863', 'B8D-793', 'V8T-801', 'V9T-950', 'VEW-722', 'VEW-755', 'VEW-763', 'VEW-774', 'VEW-776', 'VEW-870');

    IF v_origen <> 164 THEN
        RAISE EXCEPTION 'Esperaba 164 placas de origen en vehiculos, encontre %', v_origen;
    END IF;

    SELECT count(*) INTO v_colision
    FROM vehiculos v
    WHERE v.placa IN ('V0R757', 'V0R775', 'V0R877', 'V5K729', 'V5K758', 'V5K772', 'V5K778', 'V6V849', 'V6V850', 'V6V853', 'V6V866', 'V6V874', 'V6V876', 'V6V880', 'V6V889', 'V7L859', 'V7L860', 'V7L872', 'V7L877', 'V7L892', 'V7L911', 'V7L926', 'V7L943', 'V8A743', 'V8A789', 'V8A792', 'V8A793', 'V8A796', 'V8A799', 'V8A803', 'V8A804', 'VBU712', 'VBU737', 'V6V859', 'V6V865', 'V7L924', 'V9E937', 'V9E947', 'V9E948', 'V9F778', 'V9F780', 'V9V846', 'V9V860', 'VBU734', 'VEW721', 'VEW834', 'BJB753', 'V7Z928', 'VAL827', 'VAL860', 'VAM846', 'VBZ736', 'BUW928', 'CJQ858', 'CJR734', 'CJR910', 'CJS849', 'CJT845', 'V0M937', 'V0N770', 'V0T715', 'V8A794', 'V8A809', 'V9F795', 'V9V856', 'V9V867', 'VAM800', 'VAM806', 'VBU704', 'VBU705', 'VBU716', 'VBU717', 'VBU733', 'VBU736', 'VBU738', 'VBU752', 'VBU754', 'VBU765', 'VBX798', 'VBY760', 'VBY773', 'VBY798', 'VBY814', 'VBY830', 'VBY832', 'VBY850', 'VBY886', 'VBY926', 'VCA886', 'VCP820', 'VCS745', 'VCW921', 'VCW922', 'VCW924', 'VCW931', 'VCX716', 'VCX728', 'VCX739', 'VDN818', 'VEW740', 'VEW782', 'VFD743', 'CAR924', 'CAR925', 'CAR943', 'CAR945', 'CAR946', 'CAS701', 'CAS765', 'CAS842', 'CAS843', 'CAT902', 'V0I941', 'V0J700', 'V0J702', 'V0J706', 'V0J728', 'V0R721', 'V0R737', 'V0R738', 'V0R739', 'V0R748', 'V0R772', 'V0R791', 'V9V841', 'V9V843', 'VAM751', 'VAM782', 'VAM791', 'VAP804', 'VAP805', 'VAP812', 'VAP813', 'VAP815', 'VAP816', 'VAP819', 'VAP827', 'VAP830', 'VAP860', 'VAS917', 'VBZ701', 'VCI781', 'VCI782', 'VCI837', 'VCP807', 'VCP837', 'VCP839', 'VCS735', 'VCW930', 'VCX715', 'VCX729', 'VDO908', 'VEZ930', 'VFB802', 'VFD863', 'B8D793', 'V8T801', 'V9T950', 'VEW722', 'VEW755', 'VEW763', 'VEW774', 'VEW776', 'VEW870');

    IF v_colision <> 0 THEN
        RAISE EXCEPTION 'Alguna placa destino ya existe en vehiculos (% colisiones)', v_colision;
    END IF;

    -- La unidad historica tiene que estar con guion y su forma canonica no puede existir.
    IF NOT EXISTS (SELECT 1 FROM vehiculos WHERE placa = 'V5K-756') THEN
        RAISE EXCEPTION 'Esperaba encontrar la unidad historica V5K-756 en vehiculos';
    END IF;
    IF EXISTS (SELECT 1 FROM vehiculos WHERE placa = 'V5K756') THEN
        RAISE EXCEPTION 'V5K756 ya existe: seria una unidad duplicada';
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1 · NORMALIZAR A ON UPDATE CASCADE LAS 4 FK QUE NO LO TENIAN.
--     ON DELETE se preserva tal cual estaba en cada una.
-- -------------------------------------------------------------------------------------
ALTER TABLE incidentes_soporte
    DROP CONSTRAINT incidentes_soporte_placa_fkey;
ALTER TABLE incidentes_soporte
    ADD CONSTRAINT incidentes_soporte_placa_fkey
    FOREIGN KEY (placa) REFERENCES vehiculos (placa)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE inspecciones_flota
    DROP CONSTRAINT inspecciones_flota_placa_fkey;
ALTER TABLE inspecciones_flota
    ADD CONSTRAINT inspecciones_flota_placa_fkey
    FOREIGN KEY (placa) REFERENCES vehiculos (placa)
    ON UPDATE CASCADE ON DELETE NO ACTION;

ALTER TABLE mantenimientos_tecnicos
    DROP CONSTRAINT mantenimientos_tecnicos_placa_fkey;
ALTER TABLE mantenimientos_tecnicos
    ADD CONSTRAINT mantenimientos_tecnicos_placa_fkey
    FOREIGN KEY (placa) REFERENCES vehiculos (placa)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE tickets_unidades
    DROP CONSTRAINT tickets_unidades_placa_fkey;
ALTER TABLE tickets_unidades
    ADD CONSTRAINT tickets_unidades_placa_fkey
    FOREIGN KEY (placa) REFERENCES vehiculos (placa)
    ON UPDATE CASCADE ON DELETE NO ACTION;

-- -------------------------------------------------------------------------------------
-- 2 · OBSTACULO REAL ENCONTRADO AL PROBAR, Y COMO SE RODEA SIN TOCAR DATOS
--
--     chk_vehiculos_operacion y chk_vehiculos_cliente estan declaradas NOT VALID:
--     las filas que ya existian nunca se validaron. Pero un UPDATE de una fila SI
--     re-evalua el CHECK sobre esa fila. Resultado: 29 de las 164 placas a renombrar
--     abortan con 23514, porque arrastran valores fuera de dominio desde antes:
--         operacion = 'Primax'    x29   (es un cliente, escrito en la columna de
--                                        operacion y en minusculas)
--         cliente   = 'HUDBAY'    x24
--         cliente   = 'UM TITAN'  x1
--     Las 29 son: CJQ-858 CJR-734 CJR-910 CJS-849 CJT-845 VBU-717 VBU-733 VBU-738
--     VBU-754 VBX-798 VBY-760 VBY-773 VBY-798 VBY-814 VBY-830 VBY-832 VBY-850
--     VBY-886 VBY-926 VCA-886 VCP-820 VCS-745 VDN-818 VEW-721 VEW-722 VEW-755
--     VEW-834 VEW-870 VFD-743
--
--     ESTO ES UN DEFECTO DE DATOS PREEXISTENTE, AJENO A TI-PR-01. NO SE CORRIGE AQUI:
--     decidir si 'Primax' debe ser 'GLP', o si HUDBAY y UM TITAN deben entrar al
--     dominio de cliente, es una decision humana sobre el maestro de flota.
--
--     Lo que se hace es lo unico neutral: retirar los dos CHECK durante el renombrado
--     y restituirlos IDENTICOS y NOT VALID. Consecuencias exactas:
--       * no se modifica ni un solo valor de operacion o cliente
--       * el nivel de garantia al terminar es el mismo que hoy (NOT VALID)
--       * las 29 filas siguen fuera de dominio y siguen siendo visibles
--       * el bloque 4 verifica que el numero de filas infractoras no cambio,
--         para demostrar que nada se "arreglo" por lo bajo
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_mal integer;
BEGIN
    SELECT count(*) INTO v_mal FROM vehiculos
    WHERE (operacion IS NOT NULL AND operacion NOT IN ('LAS BAMBAS', 'SAN RAFAEL', 'GLP', 'INDUSTRIA', 'CARGAS DIVERSAS', 'QUELLAVECO', 'BATEAS', 'CONSTANCIA', 'CARAVELI', 'CACHIMAYO', 'PUCAMARCA', 'PAMPA DE COBRE', 'CERRO VERDE', 'RACIEMSA', 'ODEBRECHT', 'ANTAPACCAY', 'CRESPO', 'COESTI'))
       OR (cliente   IS NOT NULL AND cliente   NOT IN ('AUSTRAL', 'PRIMAX', 'REPSOL', 'SAN JOSE', 'SOLGAS'));
    IF v_mal <> 29 THEN
        RAISE EXCEPTION 'Esperaba 29 filas fuera de dominio antes del renombrado, hay %', v_mal;
    END IF;
    RAISE NOTICE 'Filas fuera de dominio antes del renombrado: % (no se corrigen)', v_mal;
END $$;

ALTER TABLE vehiculos DROP CONSTRAINT chk_vehiculos_operacion;
ALTER TABLE vehiculos DROP CONSTRAINT chk_vehiculos_cliente;

-- -------------------------------------------------------------------------------------
-- 3 · RENOMBRAR LAS 164 PLACAS. Cada par esta escrito literalmente.
--     La unica diferencia entre origen y destino es el guion; ninguna letra cambia.
--     Los hijos (346 inspecciones + 148 mantenimientos + 1 ticket) viajan por CASCADE.
-- -------------------------------------------------------------------------------------
WITH mapa (bd, excel) AS (
  VALUES
    ('V0R-757', 'V0R757'),
    ('V0R-775', 'V0R775'),
    ('V0R-877', 'V0R877'),
    ('V5K-729', 'V5K729'),
    ('V5K-758', 'V5K758'),
    ('V5K-772', 'V5K772'),
    ('V5K-778', 'V5K778'),
    ('V6V-849', 'V6V849'),
    ('V6V-850', 'V6V850'),
    ('V6V-853', 'V6V853'),
    ('V6V-866', 'V6V866'),
    ('V6V-874', 'V6V874'),
    ('V6V-876', 'V6V876'),
    ('V6V-880', 'V6V880'),
    ('V6V-889', 'V6V889'),
    ('V7L-859', 'V7L859'),
    ('V7L-860', 'V7L860'),
    ('V7L-872', 'V7L872'),
    ('V7L-877', 'V7L877'),
    ('V7L-892', 'V7L892'),
    ('V7L-911', 'V7L911'),
    ('V7L-926', 'V7L926'),
    ('V7L-943', 'V7L943'),
    ('V8A-743', 'V8A743'),
    ('V8A-789', 'V8A789'),
    ('V8A-792', 'V8A792'),
    ('V8A-793', 'V8A793'),
    ('V8A-796', 'V8A796'),
    ('V8A-799', 'V8A799'),
    ('V8A-803', 'V8A803'),
    ('V8A-804', 'V8A804'),
    ('VBU-712', 'VBU712'),
    ('VBU-737', 'VBU737'),
    ('V6V-859', 'V6V859'),
    ('V6V-865', 'V6V865'),
    ('V7L-924', 'V7L924'),
    ('V9E-937', 'V9E937'),
    ('V9E-947', 'V9E947'),
    ('V9E-948', 'V9E948'),
    ('V9F-778', 'V9F778'),
    ('V9F-780', 'V9F780'),
    ('V9V-846', 'V9V846'),
    ('V9V-860', 'V9V860'),
    ('VBU-734', 'VBU734'),
    ('VEW-721', 'VEW721'),
    ('VEW-834', 'VEW834'),
    ('BJB-753', 'BJB753'),
    ('V7Z-928', 'V7Z928'),
    ('VAL-827', 'VAL827'),
    ('VAL-860', 'VAL860'),
    ('VAM-846', 'VAM846'),
    ('VBZ-736', 'VBZ736'),
    ('BUW-928', 'BUW928'),
    ('CJQ-858', 'CJQ858'),
    ('CJR-734', 'CJR734'),
    ('CJR-910', 'CJR910'),
    ('CJS-849', 'CJS849'),
    ('CJT-845', 'CJT845'),
    ('V0M-937', 'V0M937'),
    ('V0N-770', 'V0N770'),
    ('V0T-715', 'V0T715'),
    ('V8A-794', 'V8A794'),
    ('V8A-809', 'V8A809'),
    ('V9F-795', 'V9F795'),
    ('V9V-856', 'V9V856'),
    ('V9V-867', 'V9V867'),
    ('VAM-800', 'VAM800'),
    ('VAM-806', 'VAM806'),
    ('VBU-704', 'VBU704'),
    ('VBU-705', 'VBU705'),
    ('VBU-716', 'VBU716'),
    ('VBU-717', 'VBU717'),
    ('VBU-733', 'VBU733'),
    ('VBU-736', 'VBU736'),
    ('VBU-738', 'VBU738'),
    ('VBU-752', 'VBU752'),
    ('VBU-754', 'VBU754'),
    ('VBU-765', 'VBU765'),
    ('VBX-798', 'VBX798'),
    ('VBY-760', 'VBY760'),
    ('VBY-773', 'VBY773'),
    ('VBY-798', 'VBY798'),
    ('VBY-814', 'VBY814'),
    ('VBY-830', 'VBY830'),
    ('VBY-832', 'VBY832'),
    ('VBY-850', 'VBY850'),
    ('VBY-886', 'VBY886'),
    ('VBY-926', 'VBY926'),
    ('VCA-886', 'VCA886'),
    ('VCP-820', 'VCP820'),
    ('VCS-745', 'VCS745'),
    ('VCW-921', 'VCW921'),
    ('VCW-922', 'VCW922'),
    ('VCW-924', 'VCW924'),
    ('VCW-931', 'VCW931'),
    ('VCX-716', 'VCX716'),
    ('VCX-728', 'VCX728'),
    ('VCX-739', 'VCX739'),
    ('VDN-818', 'VDN818'),
    ('VEW-740', 'VEW740'),
    ('VEW-782', 'VEW782'),
    ('VFD-743', 'VFD743'),
    ('CAR-924', 'CAR924'),
    ('CAR-925', 'CAR925'),
    ('CAR-943', 'CAR943'),
    ('CAR-945', 'CAR945'),
    ('CAR-946', 'CAR946'),
    ('CAS-701', 'CAS701'),
    ('CAS-765', 'CAS765'),
    ('CAS-842', 'CAS842'),
    ('CAS-843', 'CAS843'),
    ('CAT-902', 'CAT902'),
    ('V0I-941', 'V0I941'),
    ('V0J-700', 'V0J700'),
    ('V0J-702', 'V0J702'),
    ('V0J-706', 'V0J706'),
    ('V0J-728', 'V0J728'),
    ('V0R-721', 'V0R721'),
    ('V0R-737', 'V0R737'),
    ('V0R-738', 'V0R738'),
    ('V0R-739', 'V0R739'),
    ('V0R-748', 'V0R748'),
    ('V0R-772', 'V0R772'),
    ('V0R-791', 'V0R791'),
    ('V9V-841', 'V9V841'),
    ('V9V-843', 'V9V843'),
    ('VAM-751', 'VAM751'),
    ('VAM-782', 'VAM782'),
    ('VAM-791', 'VAM791'),
    ('VAP-804', 'VAP804'),
    ('VAP-805', 'VAP805'),
    ('VAP-812', 'VAP812'),
    ('VAP-813', 'VAP813'),
    ('VAP-815', 'VAP815'),
    ('VAP-816', 'VAP816'),
    ('VAP-819', 'VAP819'),
    ('VAP-827', 'VAP827'),
    ('VAP-830', 'VAP830'),
    ('VAP-860', 'VAP860'),
    ('VAS-917', 'VAS917'),
    ('VBZ-701', 'VBZ701'),
    ('VCI-781', 'VCI781'),
    ('VCI-782', 'VCI782'),
    ('VCI-837', 'VCI837'),
    ('VCP-807', 'VCP807'),
    ('VCP-837', 'VCP837'),
    ('VCP-839', 'VCP839'),
    ('VCS-735', 'VCS735'),
    ('VCW-930', 'VCW930'),
    ('VCX-715', 'VCX715'),
    ('VCX-729', 'VCX729'),
    ('VDO-908', 'VDO908'),
    ('VEZ-930', 'VEZ930'),
    ('VFB-802', 'VFB802'),
    ('VFD-863', 'VFD863'),
    ('B8D-793', 'B8D793'),
    ('V8T-801', 'V8T801'),
    ('V9T-950', 'V9T950'),
    ('VEW-722', 'VEW722'),
    ('VEW-755', 'VEW755'),
    ('VEW-763', 'VEW763'),
    ('VEW-774', 'VEW774'),
    ('VEW-776', 'VEW776'),
    ('VEW-870', 'VEW870')
)
UPDATE vehiculos v
SET    placa = m.excel
FROM   mapa m
WHERE  v.placa = m.bd;

-- -------------------------------------------------------------------------------------
-- 3-bis · RENOMBRADO DE LA UNIDAD HISTORICA.
--     V5K-756 -> V5K756. Unica diferencia: el guion.
--     NO entra al programa (esta VENDIDA y figura en BAJAS), pero SI al inventario,
--     porque esta presente en STATUS TRACTOS fila 34.
--     Se renombra aparte del mapping de 164 para que ese mapping
--     siga siendo auditable de forma independiente.
--     Su historico viaja por ON UPDATE CASCADE: 1 inspeccion y 1 mantenimiento tecnico.
-- -------------------------------------------------------------------------------------
UPDATE vehiculos
SET    placa = 'V5K756'
WHERE  placa = 'V5K-756';

-- -------------------------------------------------------------------------------------
-- 4 · RESTITUIR LOS DOS CHECK, con la definicion literal que tenian y NOT VALID.
--     Copiadas de pg_get_constraintdef antes de retirarlas.
-- -------------------------------------------------------------------------------------
ALTER TABLE vehiculos
    ADD CONSTRAINT chk_vehiculos_operacion CHECK (
        operacion IS NULL OR operacion::text = ANY ((ARRAY[
            'LAS BAMBAS'::character varying, 'SAN RAFAEL'::character varying,
            'GLP'::character varying, 'INDUSTRIA'::character varying,
            'CARGAS DIVERSAS'::character varying, 'QUELLAVECO'::character varying,
            'BATEAS'::character varying, 'CONSTANCIA'::character varying,
            'CARAVELI'::character varying, 'CACHIMAYO'::character varying,
            'PUCAMARCA'::character varying, 'PAMPA DE COBRE'::character varying,
            'CERRO VERDE'::character varying, 'RACIEMSA'::character varying,
            'ODEBRECHT'::character varying, 'ANTAPACCAY'::character varying,
            'CRESPO'::character varying, 'COESTI'::character varying])::text[]))
    NOT VALID;

ALTER TABLE vehiculos
    ADD CONSTRAINT chk_vehiculos_cliente CHECK (
        cliente IS NULL OR cliente::text = ANY ((ARRAY[
            'AUSTRAL'::character varying, 'PRIMAX'::character varying,
            'REPSOL'::character varying, 'SAN JOSE'::character varying,
            'SOLGAS'::character varying])::text[]))
    NOT VALID;

-- -------------------------------------------------------------------------------------
-- 5 · CREAR LAS 10 UNIDADES QUE EL EXCEL TIENE Y LA BD NO.
--
--     Se insertan SOLO con placa. Las demas columnas quedan en NULL, y no por
--     descuido: ninguna puede rellenarse sin inventar informacion.
--
--     Datos disponibles en las hojas STATUS para estas 10 unidades:
--   VCP879   STATUS CAMIONETAS  fila   8  tipo="CAMIONETA" marca="HILUX" modelo="TOYOTA" anio="2023" operacion="GERENCIA" cliente="GERENCIA"
--   VCI921   STATUS CAMIONETAS  fila   7  tipo="CAMIONETA" marca="HILUX" modelo="TOYOTA" anio="2023" operacion="ADMINISTRACIÓN" cliente="ADMINISTRACIÓN"
--   VCR944   STATUS CAMIONETAS  fila  21  tipo="CAMIONETA" marca="HILUX" modelo="TOYOTA" anio="2023" operacion="OP. REPSOL" cliente="QUELLAVECO"
--   VDO898   STATUS CAMIONETAS  fila  20  tipo="CAMIONETA" marca="HILUX" modelo="TOYOTA" anio="2024" operacion="OP. REPSOL" cliente="QUELLAVECO"
--   VDO941   STATUS TRACTOS     fila 137  tipo="TRACTOCAMINON" marca="MERCEDES BENZ" modelo="NEW ACTROS 264515" anio="2025" operacion="OP. REPSOL" cliente="LAS BAMBAS"
--   B6Z714   STATUS TRACTOS     fila  11  tipo="TRACTOCAMINON" marca="HINO" modelo="FM" anio="2011" operacion="OP. GLP" cliente="CORPORACION PRIMAX S.A."
--   V0R915   STATUS CAMIONETAS  fila  29  tipo="CAMINON" marca="MITSUBISHI" modelo="FUSO CANTER" anio="2018" operacion="MANTENIMIENTO" cliente="MANTENIMIENTO"
--   V0R941   STATUS CAMIONETAS  fila  25  tipo="CAMIONETA" marca="MITSUBISHI" modelo="L200" anio="2019" operacion="ADMINISTRACIÓN" cliente="ADMINISTRACIÓN"
--   V9T961   STATUS TRACTOS     fila   5  tipo="TRACTOCAMINON" marca="HYUNDAI" modelo="H-1" anio="2014" operacion="ADMINISTRACIÓN" cliente="ADMINISTRACIÓN"
--   V9U834   STATUS CAMIONETAS  fila   9  tipo="CAMIONETA" marca="HILUX" modelo="TOYOTA" anio="2018" operacion="GERENCIA" cliente="GERENCIA"
--
--     Por que cada columna queda en NULL:
--     * operacion  : ninguno de los valores de STATUS pertenece al dominio de
--                    chk_vehiculos_operacion. La columna admite NULL; forzar un
--                    valor exigiria ampliar el CHECK, que es decision humana.
--     * cliente    : idem con chk_vehiculos_cliente.
--     * anio_fabricacion : la columna es DATE y STATUS solo trae el anio. Las 172
--                    filas existentes estan TODAS en NULL, asi que no hay convencion
--                    que copiar; construir un 1 de enero seria inventar mes y dia.
--     * tipo_vehiculo : STATUS usa un vocabulario distinto al de la BD
--                    (TRACTOCAMINON / CAMIONETA / CAMINON frente a TRACTO / TRACTO
--                    RIGIDO COMBUSTIBLE). Ademas CAMINON y TRACTOCAMINON son erratas
--                    de CAMION y TRACTOCAMION. Cargarlo tal cual meteria sinonimos y
--                    faltas de ortografia en el maestro.
--     * marca_tracto / modelo_tracto : DEFECTO REAL DE LA FUENTE, no esquivado.
--                    En STATUS CAMIONETAS las dos columnas estan permutadas respecto
--                    de su encabezado: "MARCA DE CAMIONETA" contiene HILUX (un
--                    modelo) y "MODELO DE CAMIONETA" contiene TOYOTA (una marca).
--                    Afecta a las 7 unidades nuevas de esa hoja.
--                    En STATUS TRACTOS estan bien (HYUNDAI/H-1, HINO/FM,
--                    MERCEDES BENZ/NEW ACTROS 264515): afecta a las otras 3.
--                    Se deja NULL en las 10 por coherencia: corregir la permutacion
--                    por mi cuenta seria decidir que TOYOTA es marca y HILUX modelo,
--                    y eso es una correccion del Excel, no de la carga.
--     * los 5 booleanos de inventario : por instruccion expresa quedan en NULL.
--                    El inventario real se carga en vehiculo_equipos (migracion 005).
--
--     Todo esto queda como pendiente humano explicito, no como dato perdido.
-- -------------------------------------------------------------------------------------
INSERT INTO vehiculos (placa)
VALUES
    ('VCP879'),
    ('VCI921'),
    ('VCR944'),
    ('VDO898'),
    ('VDO941'),
    ('B6Z714'),
    ('V0R915'),
    ('V0R941'),
    ('V9T961'),
    ('V9U834');

-- -------------------------------------------------------------------------------------
-- 6 · VERIFICACION FINAL. Aborta si el resultado no es exactamente el esperado.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_total      integer;
    v_del_excel  integer;
    v_conservadas integer;
    v_con_guion  integer;
    v_checks     integer;
    v_mal_despues integer;
BEGIN
    SELECT count(*) INTO v_total FROM vehiculos;
    IF v_total <> 182 THEN
        RAISE EXCEPTION 'Esperaba 182 vehiculos (172 + 10 nuevas), hay %', v_total;
    END IF;

    SELECT count(*) INTO v_del_excel
    FROM vehiculos v
    WHERE v.placa IN ('V0R757', 'V0R775', 'V0R877', 'V5K729', 'V5K758', 'V5K772', 'V5K778', 'V6V849', 'V6V850', 'V6V853', 'V6V866', 'V6V874', 'V6V876', 'V6V880', 'V6V889', 'V7L859', 'V7L860', 'V7L872', 'V7L877', 'V7L892', 'V7L911', 'V7L926', 'V7L943', 'V8A743', 'V8A789', 'V8A792', 'V8A793', 'V8A796', 'V8A799', 'V8A803', 'V8A804', 'VBU712', 'VBU737', 'V6V859', 'V6V865', 'V7L924', 'V9E937', 'V9E947', 'V9E948', 'V9F778', 'V9F780', 'V9V846', 'V9V860', 'VBU734', 'VEW721', 'VEW834', 'BJB753', 'V7Z928', 'VAL827', 'VAL860', 'VAM846', 'VBZ736', 'BUW928', 'CJQ858', 'CJR734', 'CJR910', 'CJS849', 'CJT845', 'V0M937', 'V0N770', 'V0T715', 'V8A794', 'V8A809', 'V9F795', 'V9V856', 'V9V867', 'VAM800', 'VAM806', 'VBU704', 'VBU705', 'VBU716', 'VBU717', 'VBU733', 'VBU736', 'VBU738', 'VBU752', 'VBU754', 'VBU765', 'VBX798', 'VBY760', 'VBY773', 'VBY798', 'VBY814', 'VBY830', 'VBY832', 'VBY850', 'VBY886', 'VBY926', 'VCA886', 'VCP820', 'VCS745', 'VCW921', 'VCW922', 'VCW924', 'VCW931', 'VCX716', 'VCX728', 'VCX739', 'VDN818', 'VEW740', 'VEW782', 'VFD743', 'CAR924', 'CAR925', 'CAR943', 'CAR945', 'CAR946', 'CAS701', 'CAS765', 'CAS842', 'CAS843', 'CAT902', 'V0I941', 'V0J700', 'V0J702', 'V0J706', 'V0J728', 'V0R721', 'V0R737', 'V0R738', 'V0R739', 'V0R748', 'V0R772', 'V0R791', 'V9V841', 'V9V843', 'VAM751', 'VAM782', 'VAM791', 'VAP804', 'VAP805', 'VAP812', 'VAP813', 'VAP815', 'VAP816', 'VAP819', 'VAP827', 'VAP830', 'VAP860', 'VAS917', 'VBZ701', 'VCI781', 'VCI782', 'VCI837', 'VCP807', 'VCP837', 'VCP839', 'VCS735', 'VCW930', 'VCX715', 'VCX729', 'VDO908', 'VEZ930', 'VFB802', 'VFD863', 'B8D793', 'V8T801', 'V9T950', 'VEW722', 'VEW755', 'VEW763', 'VEW774', 'VEW776', 'VEW870', 'VCP879', 'VCI921', 'VCR944', 'VDO898', 'VDO941', 'B6Z714', 'V0R915', 'V0R941', 'V9T961', 'V9U834');
    IF v_del_excel <> 174 THEN
        RAISE EXCEPTION 'Esperaba las 174 unidades activas del Excel, hay %', v_del_excel;
    END IF;

    SELECT count(*) INTO v_conservadas
    FROM vehiculos v
    WHERE v.placa IN ('D4R-972', 'DEMO', 'F3L-787', 'VD0-941', 'VFB-827', 'VOR-739', 'VOR-748');
    IF v_conservadas <> 7 THEN
        RAISE EXCEPTION 'Las 7 placas que solo existen en la BD deben conservarse, hay %', v_conservadas;
    END IF;

    -- La unidad historica quedo con la placa canonica y sigue en el maestro.
    IF NOT EXISTS (SELECT 1 FROM vehiculos WHERE placa = 'V5K756') THEN
        RAISE EXCEPTION 'V5K756 debe seguir en el maestro como historico';
    END IF;
    IF EXISTS (SELECT 1 FROM vehiculos WHERE placa = 'V5K-756') THEN
        RAISE EXCEPTION 'V5K-756 no debia quedar: se renombro a V5K756';
    END IF;

    SELECT count(*) INTO v_con_guion FROM vehiculos WHERE placa LIKE '%-%';
    IF v_con_guion <> 6 THEN
        RAISE EXCEPTION 'Solo deben quedar 6 placas con guion (D4R-972 F3L-787 VD0-941 VFB-827 VOR-739 VOR-748), hay %', v_con_guion;
    END IF;

    -- Los dos CHECK tienen que estar de vuelta, y seguir siendo NOT VALID.
    SELECT count(*) INTO v_checks FROM pg_constraint
    WHERE conrelid = 'public.vehiculos'::regclass
      AND conname IN ('chk_vehiculos_operacion', 'chk_vehiculos_cliente')
      AND contype = 'c' AND NOT convalidated;
    IF v_checks <> 2 THEN
        RAISE EXCEPTION 'Los 2 CHECK de vehiculos deben estar restituidos y NOT VALID, hay %', v_checks;
    END IF;

    -- Y el defecto de datos preexistente tiene que seguir intacto: si el numero de
    -- filas fuera de dominio cambio, alguien modifico datos que no debia.
    SELECT count(*) INTO v_mal_despues FROM vehiculos
    WHERE (operacion IS NOT NULL AND operacion NOT IN ('LAS BAMBAS', 'SAN RAFAEL', 'GLP', 'INDUSTRIA', 'CARGAS DIVERSAS', 'QUELLAVECO', 'BATEAS', 'CONSTANCIA', 'CARAVELI', 'CACHIMAYO', 'PUCAMARCA', 'PAMPA DE COBRE', 'CERRO VERDE', 'RACIEMSA', 'ODEBRECHT', 'ANTAPACCAY', 'CRESPO', 'COESTI'))
       OR (cliente   IS NOT NULL AND cliente   NOT IN ('AUSTRAL', 'PRIMAX', 'REPSOL', 'SAN JOSE', 'SOLGAS'));
    IF v_mal_despues <> 29 THEN
        RAISE EXCEPTION 'Las 29 filas fuera de dominio debian quedar intactas, hay %', v_mal_despues;
    END IF;

    RAISE NOTICE 'Reconciliacion correcta: % vehiculos, 174 activas del Excel, 1 historica (V5K756), 7 conservadas, 29 filas fuera de dominio sin tocar', v_total;
END $$;
