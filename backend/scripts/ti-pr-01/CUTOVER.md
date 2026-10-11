# TI-PR-01 · CUTOVER = 2026-10-01

Fecha a partir de la cual el programa se opera con el ERP nuevo. Decisión de negocio
aprobada el 2026-09-24.

## Las dos cosas que no deben confundirse

### BACKLOG CALCULADO

Obligaciones de cadencia cuya quincena es **anterior al 2026-10-01**.

Se **calculan** al vuelo desde la referencia de fase y la periodicidad:

```
referencia(unidad, familia, nivel) = ciclo real del nivel, si existe
                                     en caso contrario, ancla del nivel
término k                          = referencia + k × frecuencia_quincenas
```

Se pueden consultar y reportar. **No son filas de programación** y **no implican que
hubiera existido una orden de trabajo**: en aquel momento esta metodología no existía para
TI-PR-01. Son una deducción aritmética sobre la cadencia, no un hecho operativo.

Medido el 2026-09-24 sobre los 688 ciclos y las 1062 anclas: **922 términos** anteriores al
horizonte de octubre — M1 = 884, M2 = 22, M3 = 16. Los 16 de M3 son los GPS ya vencidos.

### PROGRAMACIÓN MATERIALIZADA

Fila real de `programacion_mantenimiento` creada por el ERP nuevo, con quincena **igual o
posterior al 2026-10-01**, y su detalle en `programacion_mantenimiento_equipos`.

Es la única que puede tener orden de trabajo, ejecución y, por tanto, mover un ciclo.

## Prohibido

Queda prohibido convertir automáticamente el backlog previo al cutover en:

- `programacion_mantenimiento`;
- orden de trabajo;
- ejecución;
- ciclo.

No se fabrican números de OT, ni ejecuciones, ni se cambia `fuente = 'EXCEL'` de los 688
ciclos históricos. Que esos ciclos **no tengan OT asociada es correcto**: su trazabilidad
es el Excel, la fecha real, la quincena derivada para la siembra inicial y la fila de
origen citada en sus observaciones.

## Cómo se responde «¿estaba vencida?»

Comparando el término calculado con la quincena actual, sin materializar nada:

```sql
-- forma de la consulta; el generador la implementará
WITH referencia AS (
  SELECT u.id AS unidad, f.tipo_equipo, f.nivel_mantenimiento AS nivel,
         f.frecuencia_quincenas AS frec,
         COALESCE(c.ultima_quincena, x.quincena_ancla) AS q_ref
  FROM programa_mantenimiento_unidades u
  JOIN programa_mantenimiento_frecuencias f ON f.programa_id = u.programa_id
  LEFT JOIN programa_mantenimiento_unidad_ciclos c
    ON c.programa_unidad_id = u.id AND c.tipo_equipo = f.tipo_equipo
   AND c.nivel_mantenimiento = f.nivel_mantenimiento
  LEFT JOIN programa_mantenimiento_unidad_anclas x
    ON x.programa_unidad_id = u.id AND x.tipo_equipo = f.tipo_equipo
   AND x.nivel_mantenimiento = f.nivel_mantenimiento
)
SELECT * FROM referencia WHERE q_ref IS NOT NULL;
-- los términos < 2026-10-01 son BACKLOG CALCULADO: se informan, no se materializan
```

Una obligación atrasada **no se desplaza**. Si un término queda incumplido, el ciclo no
avanza, la referencia no cambia y la serie **no genera un término nuevo en la quincena
siguiente**: el término sigue siendo el mismo, atrasado, hasta que se ejecute o se
reprograme formalmente (`quincena_reprogramada`, conservando `quincena_programada`).

## Unidades sin referencia

29 de las 174 unidades no tienen ningún ciclo M1 y por tanto **no recibieron ancla**. No se
les inventa fecha: quedan fuera del calendario hasta que exista evidencia o se declare un
arranque explícito. Igual criterio para las familias con inventario `POR_VALIDAR`.

## Estado al declarar el cutover

| | |
|---|---|
`programa_mantenimiento_unidad_ciclos` | 688 · M1 531, M2 0, M3 157 (GPS 156, ADAS 1) · `fuente='EXCEL'` en el 100 % |
`programa_mantenimiento_unidad_anclas` | 1062 · M2 531, M3 531 · `origen='DERIVADA_M1_INICIAL'` · 145 unidades |
`programacion_mantenimiento` | 0 |
`programacion_mantenimiento_equipos` | 0 |
órdenes de trabajo | `ordenes_trabajo` 0 y `ordenes_trabajo_detalle` 0 - las crea `20260925_013`, endurecidas por `20260925_014`, `20260925_015` y `20260928_016`
