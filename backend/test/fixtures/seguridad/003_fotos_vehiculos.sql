BEGIN;

CREATE TABLE transreport.fotos_vehiculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    movimiento_id uuid NOT NULL
        REFERENCES transreport.movimientos_vehiculos(id)
        ON DELETE RESTRICT,

    vista text NOT NULL
        CHECK (
            vista IN (
                'Frente',
                'Lateral izquierdo',
                'Lateral derecho',
                'Parte posterior',
                'Interior de cabina'
            )
        ),

    cloudinary_public_id text NOT NULL UNIQUE
        CHECK (length(trim(cloudinary_public_id)) > 0),

    formato text NOT NULL
        CHECK (formato IN ('jpg', 'png', 'webp')),

    bytes integer NOT NULL
        CHECK (bytes > 0),

    creado_en timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT foto_unica_por_vista
        UNIQUE (movimiento_id, vista)
);

COMMIT;