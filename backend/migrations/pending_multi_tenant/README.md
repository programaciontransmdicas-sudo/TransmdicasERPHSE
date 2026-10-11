# Trigger de sincronización de vehículos · NO EJECUTAR

Un solo fichero, `20261007_904_vehiculos_sincronizacion_trigger.sql`. No destruye nada:
crea **un trigger**. Está aquí, fuera de `backend/migrations/`, porque se midió que
aplicarlo rompe cosas que hoy funcionan.

## Qué haría

Instala `trg_sincronizar_vehiculo_cliente_operacion` sobre `vehiculos`, recuperado literal
de la base de producción origen. Es la regla que mantiene en sincronía
`vehiculos.cliente_operacion_id` y las dos columnas de texto antiguas:

- `INSERT` sin id → lo resuelve desde `UPPER(BTRIM(cliente))`/`UPPER(BTRIM(operacion))`, y
  si no lo encuentra **aborta**;
- `UPDATE` de `cliente` u `operacion` → lo vuelve a resolver, o aborta;
- `INSERT`/`UPDATE` con id → **reescribe** `cliente` y `operacion` desde el catálogo.

La función que invoca, `sincronizar_vehiculo_cliente_operacion()`, ya la crea
`20261007_903`. Sin trigger que la llame es inerte, así que este fichero es una única
sentencia `CREATE TRIGGER`.

## Por qué no está en `migrations/`

Igual que con `pending_cleanup/`: hoy **no existe ningún runner**. No hay dependencia de
migración instalada, ningún script de `package.json` recorre la carpeta, `initDb.js` no lee
`.sql`, ningún script de `scripts/` hace `readdir` sobre `migrations/` y no hay CI. Las
migraciones se aplican una a una y a mano.

Pero el orden léxico no garantiza nada: `904` ordena después de `903`, y una ruta
automática futura que recorriese `migrations/` lo arrastraría. Dentro de esta carpeta no
hay orden que pueda encabezar.

## Lo que rompe, medido en la branch aislada

1. **La suite de regresión de TI-PR-01 no arranca.** 43 suites crean su fixture con
   `INSERT INTO vehiculos (placa) VALUES ($1)`, sin cliente ni operación. Con el trigger
   instalado, `x43` murió construyendo el fixture:
   `ERROR NO CONTROLADO: La combinación cliente <NULL> / operación <NULL> no existe`
   — 3 asserts OK de 88, el resto sin ejecutarse.

2. **Un script del repositorio.** `scripts/ti-pr-01/probar-generador.mjs:78` hace ese mismo
   `INSERT`.

3. **Un camino vivo de la API.** `flota/service.js:195` exige placa y operación pero **no**
   exige cliente. Un vehículo con operación y sin cliente se acepta hoy y dejaría de
   aceptarse. Es el formulario de alta de vehículos, no una prueba desechable.

## Una consecuencia más, que no es un fallo pero hay que saberla

La tercera rama reescribe el texto desde el catálogo. Los 31 vehículos que `902` asignó por
nivel 2 tienen hoy un texto que no concuerda con su id (vacío, en su mayoría). La primera
vez que alguien los edite, el trigger les normalizará `cliente` y `operacion`. El backfill
no los tocó; la primera edición sí lo hará. Si eso no se quiere, hay que decidirlo antes.

## Requisitos antes de devolverlo a `migrations/`

1. Autorización humana explícita.
2. Decidir si el alta de vehículo debe exigir `cliente` además de `operacion`, y aplicarlo
   en `flota/service.js` si la respuesta es sí.
3. Dar a los fixtures de las 43 suites y a `probar-generador.mjs` un par válido, o hacerlos
   insertar `cliente_operacion_id` directamente.
4. Los 29 vehículos con texto incompatible con `chk_vehiculos_cliente` /
   `chk_vehiculos_operacion` siguen siendo ineditables con trigger o sin él: eso es
   anterior a este hotfix y va por su propia vía.
