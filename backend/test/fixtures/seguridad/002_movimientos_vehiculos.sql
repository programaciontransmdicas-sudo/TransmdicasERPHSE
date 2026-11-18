BEGIN;

CREATE TABLE transreport.movimientos_vehiculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    control_id uuid NOT NULL
        REFERENCES transreport.controles_vehiculos(id)
        ON DELETE RESTRICT,

    tipo text NOT NULL
        CHECK (tipo IN ('INGRESO', 'SALIDA')),

    fecha timestamptz NOT NULL,

    agente text NOT NULL
        CHECK (length(trim(agente)) > 0),

    kilometraje bigint NOT NULL
        CHECK (kilometraje >= 0),

    conductor text NOT NULL
        CHECK (length(trim(conductor)) > 0),

    dni varchar(8) NOT NULL
        CHECK (dni ~ '^[0-9]{8}$'),

    origen text,
    destino text,
    condicion text,

    repuesto text
        CHECK (
            repuesto IN (
                'Presente',
                'Ausente',
                'Con observación'
            )
        ),

    carga text
        CHECK (carga IN ('Sin carga', 'Cargada')),

    implementacion_completa boolean NOT NULL DEFAULT false,
    estacionamiento_seguro boolean NOT NULL DEFAULT false,

    boleta text NOT NULL DEFAULT '',
    precintos text NOT NULL DEFAULT '',
    observaciones text NOT NULL DEFAULT '',

    creado_en timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT movimiento_unico_por_control
        UNIQUE (control_id, tipo),

    CONSTRAINT campos_minimos_movimiento
        CHECK (
            (
                tipo = 'INGRESO'
                AND NULLIF(trim(origen), '') IS NOT NULL
                AND NULLIF(trim(condicion), '') IS NOT NULL
                AND repuesto IS NOT NULL
                AND carga IS NOT NULL
            )
            OR
            (
                tipo = 'SALIDA'
                AND NULLIF(trim(destino), '') IS NOT NULL
            )
        )
);

COMMIT;