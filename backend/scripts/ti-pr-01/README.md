# TI-PR-01 · carga inicial (Fase B)

> **DVR ya no es familia programable (migracion 20261007_017, 2026-10-07).** Lo que este
> documento describe sobre `DVR` es el estado de la CARGA INICIAL y se conserva como
> historia: el DVR forma parte del sistema de CAMARAS. Sigue existiendo como inventario
> fisico (`DVR_INTERNO`, `DVR_EXTERNO`), pero no tiene frecuencia, ni ciclo, ni ancla,
> ni detalle de visita.


Carga reproducible del programa **TI-PR-01** a partir del Excel fuente.

## Por qué está aquí y no en `backend/migrations`

`backend/migrations` contiene `20261001_900` y `20261001_901`, que son *cleanup*
destructivos y **todavía no deben ejecutarse**. Un runner que recorriera la carpeta en
orden los arrastraría. Además esta carga es un paso de **datos**, no de esquema.

> Esos dos ficheros se numeraron antes `20260923_007`/`20260923_008` y después
> `20261001_010`/`20261001_011`. El 2026-09-24 pasaron a **900 y 901**, un bloque
> terminal reservado, para que el orden léxico siga siendo el orden real de ejecución y
> cualquier migración aditiva futura quepa delante sin volver a renumerarlos. Los
> números 010 y 011 quedan retirados y no se reutilizan: así ninguna nota antigua que
> diga «010 es destructiva» puede apuntar a un fichero distinto del que describía.

## Requisitos previos

Estas migraciones deben estar aplicadas, en este orden:

| Migración | Qué aporta |
|---|---|
| `20260918_001_ti_pr_01_programa_mantenimiento.sql` | tablas base del programa |
| `20260918_002_ti_pr_01_normalizacion_equipos_expand.sql` | normalización por equipos y quincenas |
| `20260922_003_ti_pr_01_versionado_programa_expand.sql` | versionado documental |
| `20260923_004_ti_pr_01_versionado_desacople.sql` | desacople del versionado |
| `20260923_005_ti_pr_01_inventario_equipos_expand.sql` | tabla `vehiculo_equipos` |
| `20260923_006_ti_pr_01_reconciliacion_placas.sql` | placas en forma canónica |

El script comprueba las tres últimas por sí mismo y aborta si falta alguna.

## Uso

```bash
# 1 · prueba: hace todo el trabajo y termina en ROLLBACK
node backend/scripts/ti-pr-01/cargar-fase-b.mjs --ensayo

# 2 · carga real: termina en COMMIT, solo si todas las comprobaciones pasan
node backend/scripts/ti-pr-01/cargar-fase-b.mjs --confirmar
```

Sin bandera no hace nada: obliga a declarar la intención.

## Garantías

- **Huella del Excel.** Exige el SHA-256 exacto declarado en `EXCEL_SHA256`. Si el
  fichero cambió, aborta antes de abrir conexión. Si el cambio es legítimo hay que
  revalidar la carga y actualizar la constante a mano, nunca automáticamente.
- **Precondiciones.** Verifica base, esquema, que no es una réplica de solo lectura,
  que 004/005/006 están aplicadas, que las 175 placas existen en `vehiculos` y que las
  8 tablas de destino están vacías.
- **No duplica.** Si `TI-PR-01` ya existe, aborta con un mensaje explícito. No
  sobreescribe ni fusiona: la decisión sobre lo ya cargado es humana.
- **Una sola transacción.** B0, B0-bis, B1, B2 y B3 van juntos. Cualquier fallo revierte
  todo.
- **Conteos antes del COMMIT** y ejecución del fichero de validación completo
  (`migrations/validation/20260923_006_ti_pr_01_modelo_final_validation.sql`, 45
  consultas de solo lectura). Si una sola regla da `FAIL`, hace `ROLLBACK`.
- **No inventa datos.** Cada valor sale del Excel o del cajetín aprobado.

## Qué carga

| Bloque | Contenido |
|---|---|
| **B0** | 1 `programas_mantenimiento`: `TI-PR-01`, nombre leído de `TI-PR-01!D2`, estado `ACTIVO`. Las columnas legacy que aún son `NOT NULL` se rellenan con valores del propio cajetín: periodo `2026-09-01`…`2026-12-31`, versión `01`, fecha `2026-09-25`, y `frecuencia_m1/m2/m3_dias` = `15/90/180` (columna AD del cajetín). |
| **B0-bis** | 1 versión documental: `01`, `fecha_documento` y `vigencia_desde` = `2026-09-25`, `vigencia_hasta` NULL, estado `VIGENTE`, periodo `2026-09-01`…`2026-12-31`. |
| **B1** | 13 periodicidades en quincenas: M1=1, M2=6, M3=12 para DVR, COPILOTO, RADIO_BASE y CAMARAS; GPS solo M3=24. **`version_id = NULL` en las 13**, a propósito. ADAS no lleva periodicidad. |
| **B2** | 174 `programa_mantenimiento_unidades`, las activas de `IMP_UNIDADES`. `V5K756` **no** entra: está vendida y figura en BAJAS. |
| **B3** | 1400 `vehiculo_equipos` = 175 placas de STATUS × 8 tipos físicos. Incluye las 8 filas históricas de `V5K756`. |

## Qué NO carga, y por qué

- `programa_mantenimiento_unidad_ciclos` — faltan las referencias iniciales M1/M2/M3.
  No hay evidencia de ejecución y no se inventa.
- `programacion_mantenimiento` y `programacion_mantenimiento_equipos` — se derivan de
  los ciclos.
- `programa_mantenimiento_frecuencias.version_id` — se carga NULL. La periodicidad
  pertenece al **programa**, no a la revisión documental. La columna es deuda de
  transición y desaparece en el cleanup final.
- Los cinco booleanos legacy de `vehiculos` (`dvr_instalado`, `copiloto_instalado`,
  `radio_base_instalado`, `camaras_instaladas`, `gps_instalado`) — quedan NULL.
  `vehiculo_equipos` es la única fuente de verdad del inventario físico.

## Regla de proyección inventario → mantenimiento

Documentada, **no implementada**: no hay tabla ni vista que la materialice, para no
crear una segunda fuente de verdad. El backend la aplicará cuando se adapte.

| Tipo mantenible | Se deriva de |
|---|---|
| `DVR` | `DVR_INTERNO` OR `DVR_EXTERNO` |
| `CAMARAS` | `CAMARA_INTERNA` OR `CAMARA_EXTERNA` |
| `COPILOTO` | `COPILOTO` (directo) |
| `RADIO_BASE` | `RADIO_BASE` (directo) |
| `GPS` | `GPS` (directo). Familia anual: solo M3, 24 quincenas. |
| `ADAS` | `ADAS`, **solo si el proveedor actual es Tracklog** (ver más abajo). Desde `20260924_009` es familia mantenible anual: solo M3, 24 quincenas. |

Para `DVR` y `CAMARAS`, que agrupan dos equipos físicos, la lógica es de tres estados:

- alguno `INSTALADO` → **aplica**
- ambos `NO_APLICA` → **no aplica**
- cualquier otra combinación con `POR_VALIDAR` → **pendiente de validar**

`POR_VALIDAR` nunca se interpreta como «no».

## Una nota sobre el bloque GPS del Excel

Sus dos columnas están permutadas respecto de sus rótulos y el script lo compensa:

- `AD` se titula «TIPO DE GPS» pero contiene **números de serie** (105 valores distintos,
  casi todos únicos), más cuatro marcadores que no son series y por eso no se importan:
  `TDCTDC` (×34), `SIN COPILOTO` (×6), `0` (×4) y `SIN SERIE` (×2).
- `AE` se titula «MODELO DE GPS» pero contiene la **identidad real del equipo**: solo 8
  valores (`Ruptela_Pro4_3G`, `Ruptela_HCV5`, …).

Por eso la evidencia de instalación y la marca del GPS salen de `AE`, y la serie de `AD`.
La propia hoja derivada del libro, `IMP_EQUIPOS_STATUS`, hace lo mismo. Leer `AD` como
evidencia daría 148 GPS instalados en vez de 171. El script contrasta su derivación
contra esa hoja: 1400 filas, 1400 coincidencias.

## La hoja `HISTORICO_GPS` del Excel

**HISTORICO_GPS contiene referencias históricas M3 de GPS y de ADAS Tracklog. ADAS de
otros proveedores puede permanecer en inventario, pero no participa del programa
TI-PR-01 mientras la regla de negocio aplicable sea únicamente ADAS Tracklog.**

La hoja conserva ese nombre a propósito, aunque cubra las dos familias: renombrarla sería
técnicamente seguro (solo la citan `workbook.xml` y `docProps/app.xml`, ninguna fórmula),
pero cambiaría un nombre visible para quien usa el libro.

Cómo distingue las dos familias:

| columna | contenido |
|---|---|
| `A` PLACA | con guion, y **sufijo `_EVO4`** en los registros de ADAS |
| `B` CATEGORIA | fórmula sobre ese sufijo: `ADAS` o `GPS` |
| `C` / `D` | fecha de mantenimiento 2025 / 2026; `C` puede decir `NUEVO EQUIPO` |
| `E` NIVEL | `M3` en las 194 filas |
| `F` / `G` | OT/evidencia y observación: **vacías en las 194** |
| `H` | fecha consolidada, la más reciente de `C` y `D` |

### Elegibilidad de ADAS

La hoja **no dice cuál es el proveedor actual**: solo marca qué registros históricos
fueron de Tracklog. El proveedor vigente se lee del inventario, en
`vehiculo_equipos.marca` para `tipo_equipo='ADAS'`, cuyos únicos valores reales son:

```
MIX  TELEMATICS   (26 unidades, con dos espacios)   -> NO participa
EVO TRACKLOG      ( 1 unidad)                       -> SI participa
WISETRACK         ( 1 unidad)                       -> NO participa
```

Regla, **positiva y demostrable**:

```
ADAS elegible  <=>  estado_inventario = 'INSTALADO'  AND  marca ILIKE '%TRACKLOG%'
```

- **No** interpretar `MIX TELEMATICS` como Tracklog.
- **No** usar la exclusión de MIX como criterio: una lista negativa haría elegible a
  cualquier proveedor futuro que nadie haya previsto.
- **No** emparejar por la subcadena `EVO` a secas: aparece dentro de `NUEVO EQUIPO`, un
  marcador que la propia hoja usa, y produce falsos positivos.

Un registro histórico de Tracklog en una unidad que hoy lleva otro proveedor se conserva
como evidencia, pero **no genera ciclo activo**: el equipo al que se refiere ya no está
instalado.

## Huella del Excel en cada loader

Cada loader fija el SHA-256 del fichero con el que **realmente** se ejecutó, y ese valor
no se actualiza cuando el Excel evoluciona. Es lo que permite reconstruir con qué
snapshot se cargó cada cosa:

| loader | SHA-256 fijado | qué cargó |
|---|---|---|
| `cargar-fase-b.mjs` | `414b5135…d21a62` | B0–B3 |
| `cargar-b4-ciclos-m1.mjs` | `414b5135…d21a62` | 531 referencias M1 |
| `cargar-m3-historico-anual.mjs` | `9fba58c9…07a2e` | 157 referencias M3: 156 GPS + 1 ADAS Tracklog |

El SHA del loader M3 es posterior porque su fuente es la hoja `HISTORICO_GPS`, que se
incorporó al libro después de B4, más la corrección de `C36`.

## El loader M3 anual

`cargar-m3-historico-anual.mjs` sólo inserta en `programa_mantenimiento_unidad_ciclos`,
con `nivel_mantenimiento = 'M3'` y `tipo_equipo` en `GPS` o `ADAS`. Exige la migración
`20260924_009` aplicada: antes de ella el dominio de `chk_ciclo_tipo_equipo` no admitía
`ADAS`.

Ni las placas ni las fechas ni el total están escritos en el fichero: todo se deriva en
ejecución de `HISTORICO_GPS` cruzada con `vehiculo_equipos`. Los totales declarados
(156 / 1 / 157) son **barreras**: si la derivación no da exactamente eso, aborta.

El universo se cuenta por dos caminos independientes que deben coincidir: recorriendo las
194 filas de la hoja, y recorriendo las 174 unidades activas. El embudo de la hoja es:

| se descarta porque | filas |
|---|---|
| la placa no está en el universo de inventario (unidad histórica fuera de la flota) | 21 |
| ADAS cuyo proveedor actual no es Tracklog | 6 |
| el equipo no está `INSTALADO` hoy | 5 |
| sin fecha de mantenimiento en `H` (`NUEVO EQUIPO`) | 4 |
| la unidad no está en el programa activo (`V5K756`) | 1 |
| **quedan** | **157** |

De las 21 fuera del universo, 18 no existen en `vehiculos` y 3 existen pero guardadas
**con guion** (`D4R-972`, `F3L-787`, `VFB-827`): son parte de las filas fuera de dominio
pendientes de decisión humana. El loader las reporta y no las empareja. Ninguna placa
necesita convertir `O` ↔ `0`, y el loader comprueba que siga siendo así.

Un loader antiguo abortará si se lo ejecuta contra un Excel más reciente. Eso es
deliberado: obliga a revalidar antes de reutilizarlo.
