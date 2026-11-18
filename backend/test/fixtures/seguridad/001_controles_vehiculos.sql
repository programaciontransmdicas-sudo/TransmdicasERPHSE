BEGIN;

CREATE SCHEMA IF NOT EXISTS transreport;

CREATE TABLE transreport.controles_vehiculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    base text NOT NULL
        CHECK (base IN ('Peruarbo', 'Moquegua', 'Espinar')),

    placa varchar(6) NOT NULL
        CHECK (placa ~ '^[A-Z0-9]{6}$'),

    carreta varchar(6)
        CHECK (carreta ~ '^[A-Z0-9]{6}$'),

    vehiculo_placa varchar
        REFERENCES public.vehiculos(placa)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    conductor text NOT NULL
        CHECK (length(trim(conductor)) > 0),

    dni varchar(8) NOT NULL
        CHECK (dni ~ '^[0-9]{8}$'),

    operacion text NOT NULL
        CHECK (length(trim(operacion)) > 0),

    cliente_operacion_id integer
        REFERENCES public.cliente_operaciones(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    ingreso_registrado boolean NOT NULL,

    estado text NOT NULL
        CHECK (estado IN ('En base', 'Salida registrada')),

    creado_en timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT salida_sin_ingreso_cerrada
        CHECK (
            ingreso_registrado
            OR estado = 'Salida registrada'
        )
);

CREATE UNIQUE INDEX controles_vehiculos_un_ingreso_abierto
ON transreport.controles_vehiculos (placa)
WHERE estado = 'En base';

COMMIT;