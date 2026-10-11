# Cleanup destructivo · NO EJECUTAR

Estos dos ficheros **eliminan columnas y constraints de forma irreversible**. Están aquí,
fuera de `backend/migrations/`, para que ninguna ruta automática los alcance.

| fichero | qué destruye |
|---|---|
| `20261001_900_..._normalizacion_equipos_cleanup.sql` | 4 VALIDATE, 2 SET NOT NULL, 2 DROP CONSTRAINT, 10 DROP COLUMN |
| `20261001_901_..._versionado_programa_cleanup.sql` | 2 DROP CONSTRAINT, 4 DROP COLUMN |

## Por qué no están en `migrations/`

Hoy no existe ningún runner: no hay dependencia de migración, ningún script de
`package.json` recorre la carpeta, `initDb.js` no lee `.sql` y no hay CI. Las migraciones
se aplican una a una y a mano.

Pero el orden léxico **no puede garantizar** que un destructivo quede al final. Se
renumeraron dos veces (`007/008` → `010/011` → `900/901`) y aun así una aditiva futura
con fecha posterior, por ejemplo `20261002_013`, ordenaría **después** de `20261001_901`.
Mientras vivan en esta carpeta el problema desaparece: no hay orden que puedan encabezar.

Dentro de `pending_cleanup/` los números 900 y 901 ya no expresan orden de ejecución.
Se conservan solo para no renombrar los ficheros una tercera vez.

## `uq_programacion_mantenimiento_unidad_fecha` lo retira ya `013`

Ese unique sobre `(programa_unidad_id, fecha_programada)` **no era parcial**, así que no
excluía `CANCELADO` y bloqueaba el flujo de sustitución de una visita: obligaba a que la
programación sustituta usara otra `fecha_programada` solo para esquivarlo. La protección que
de verdad gobierna es `uq_programacion_unidad_quincena_efectiva`, que sí es parcial y libera
el slot al cancelar.

Por eso **`20260925_013` ya lo retira**, sin tocar las columnas. El paso `3.a` de `900`
conserva la sentencia con `DROP CONSTRAINT IF EXISTS`: así este cleanup no falla sobre una
base donde `013` ya lo quitó, y sigue funcionando sobre una base antigua donde `013` no se
hubiera aplicado. Si no existe, es un no-op correcto.

Lo que `900` sí sigue retirando: las columnas `fecha_programada` y `fecha_reprogramada`, y
`nivel_mantenimiento`. Ver `backend/scripts/ti-pr-01/GENERADOR.md`.

## Requisitos antes de devolverlos a `migrations/`

1. Autorización humana explícita.
2. `backend/src` e `initDb.js` adaptados al modelo definitivo: estas columnas legacy
   pueden seguir siendo consumidas por código existente.
3. Decidido qué hacer con `programas_mantenimiento.frecuencia_m1/m2/m3_dias`
   (15/90/180 días), que no pueden expresar las 24 quincenas de GPS y ADAS.
4. Decidido qué hacer con las filas de `vehiculos` fuera de dominio.
