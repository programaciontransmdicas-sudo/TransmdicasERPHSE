--
-- PostgreSQL database dump
--

\restrict xxCcvEHS1Mu55vfJcNnWQuUUikRk319SnNk73TAfnAqZROdV5KaNmocupZucKZv

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    accion character varying(255),
    tabla_afectada character varying(100),
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: entregas_ti; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entregas_ti (
    id integer NOT NULL,
    fecha date,
    encargado character varying(100),
    nombre character varying(200),
    dni character varying(20),
    cargo character varying(100),
    operacion character varying(100),
    condicion character varying(50),
    equipo_tipo character varying(100),
    marca character varying(100),
    modelo character varying(100),
    serie character varying(100),
    laptop character varying(100),
    mouse character varying(100),
    cargador character varying(100),
    motivo character varying(200),
    observaciones text,
    precio numeric(10,2),
    tipo_movimiento character varying(50) DEFAULT 'Entrega'::character varying,
    documento_url text
);


--
-- Name: entregas_ti_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entregas_ti_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entregas_ti_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entregas_ti_id_seq OWNED BY public.entregas_ti.id;


--
-- Name: equipos_flota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipos_flota (
    placa character varying NOT NULL,
    programa character varying,
    fecha character varying,
    hora character varying,
    tablet character varying,
    radio character varying,
    camaras character varying,
    img_tablet character varying,
    img_radio character varying,
    img_camaras character varying
);


--
-- Name: incidentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidentes (
    id integer NOT NULL,
    placa character varying,
    operacion character varying,
    fecha_solicitud character varying,
    hora_inicio character varying,
    hora_fin character varying,
    url_grabacion character varying,
    fecha_ingreso character varying,
    estado character varying
);


--
-- Name: incidentes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidentes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidentes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidentes_id_seq OWNED BY public.incidentes.id;


--
-- Name: incidentes_soporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidentes_soporte (
    id integer NOT NULL,
    placa character varying(20) NOT NULL,
    tipo_solicitud character varying(100) NOT NULL,
    descripcion text NOT NULL,
    operador character varying(100) NOT NULL,
    estado character varying(20) DEFAULT 'Pendiente'::character varying,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    categoria character varying(100) DEFAULT 'General'::character varying,
    prioridad character varying(20) DEFAULT 'Media'::character varying,
    evidencia text
);


--
-- Name: incidentes_soporte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidentes_soporte_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidentes_soporte_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidentes_soporte_id_seq OWNED BY public.incidentes_soporte.id;


--
-- Name: inspecciones_flota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspecciones_flota (
    id integer NOT NULL,
    placa character varying(20),
    fecha date,
    hora character varying(20),
    tablet character varying(50),
    radio character varying(50),
    camaras character varying(50),
    img_tablet text,
    img_radio text,
    img_camaras text,
    observaciones text
);


--
-- Name: inspecciones_flota_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inspecciones_flota_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspecciones_flota_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inspecciones_flota_id_seq OWNED BY public.inspecciones_flota.id;


--
-- Name: mantenimientos_tecnicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mantenimientos_tecnicos (
    id integer NOT NULL,
    placa character varying(50),
    fecha_ejecutada date,
    frecuencia_dias integer DEFAULT 30,
    dvr character varying(50),
    copiloto character varying(50),
    radio_base character varying(50),
    handy character varying(50),
    camara_interna character varying(50),
    camara_externa character varying(50),
    camara_retroceso character varying(50),
    sensores_retroceso character varying(50),
    sensores_delanteros character varying(50),
    sistema_adas character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mantenimientos_tecnicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mantenimientos_tecnicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mantenimientos_tecnicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mantenimientos_tecnicos_id_seq OWNED BY public.mantenimientos_tecnicos.id;


--
-- Name: personal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal (
    id integer NOT NULL,
    id_interno character varying(50),
    nombre_completo character varying(255) NOT NULL,
    dni character varying(20) NOT NULL,
    modalidad character varying(100),
    area character varying(100),
    cargo character varying(100),
    telefono character varying(30),
    estado character varying(20) DEFAULT 'Activo'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: personal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personal_id_seq OWNED BY public.personal.id;


--
-- Name: semirremolques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semirremolques (
    placa_sr character varying(20) NOT NULL,
    tipo character varying(100),
    marca character varying(100),
    modelo character varying(100),
    chasis character varying(100),
    capacidad character varying(100),
    compartimientos character varying(100),
    diametro_interior character varying(100),
    frecuencia_p character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol character varying(20) DEFAULT 'auditor'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    operacion character varying(100),
    estado character varying(20) DEFAULT 'activo'::character varying,
    permisos jsonb DEFAULT '{}'::jsonb
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculos (
    placa character varying(20) NOT NULL,
    programa character varying(50),
    tipo_vehiculo character varying(100),
    marca_tracto character varying(100),
    modelo_tracto character varying(100),
    anio_fabricacion character varying(20),
    operacion character varying(100),
    cliente character varying(100)
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: entregas_ti id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_ti ALTER COLUMN id SET DEFAULT nextval('public.entregas_ti_id_seq'::regclass);


--
-- Name: incidentes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidentes ALTER COLUMN id SET DEFAULT nextval('public.incidentes_id_seq'::regclass);


--
-- Name: incidentes_soporte id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidentes_soporte ALTER COLUMN id SET DEFAULT nextval('public.incidentes_soporte_id_seq'::regclass);


--
-- Name: inspecciones_flota id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecciones_flota ALTER COLUMN id SET DEFAULT nextval('public.inspecciones_flota_id_seq'::regclass);


--
-- Name: mantenimientos_tecnicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mantenimientos_tecnicos ALTER COLUMN id SET DEFAULT nextval('public.mantenimientos_tecnicos_id_seq'::regclass);


--
-- Name: personal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal ALTER COLUMN id SET DEFAULT nextval('public.personal_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: entregas_ti entregas_ti_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_ti
    ADD CONSTRAINT entregas_ti_pkey PRIMARY KEY (id);


--
-- Name: equipos_flota equipos_flota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos_flota
    ADD CONSTRAINT equipos_flota_pkey PRIMARY KEY (placa);


--
-- Name: incidentes incidentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidentes
    ADD CONSTRAINT incidentes_pkey PRIMARY KEY (id);


--
-- Name: incidentes_soporte incidentes_soporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidentes_soporte
    ADD CONSTRAINT incidentes_soporte_pkey PRIMARY KEY (id);


--
-- Name: inspecciones_flota inspecciones_flota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecciones_flota
    ADD CONSTRAINT inspecciones_flota_pkey PRIMARY KEY (id);


--
-- Name: mantenimientos_tecnicos mantenimientos_tecnicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mantenimientos_tecnicos
    ADD CONSTRAINT mantenimientos_tecnicos_pkey PRIMARY KEY (id);


--
-- Name: personal personal_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal
    ADD CONSTRAINT personal_dni_key UNIQUE (dni);


--
-- Name: personal personal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal
    ADD CONSTRAINT personal_pkey PRIMARY KEY (id);


--
-- Name: semirremolques semirremolques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semirremolques
    ADD CONSTRAINT semirremolques_pkey PRIMARY KEY (placa_sr);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_username_key UNIQUE (username);


--
-- Name: vehiculos vehiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (placa);


--
-- Name: ix_equipos_flota_placa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_equipos_flota_placa ON public.equipos_flota USING btree (placa);


--
-- Name: ix_equipos_flota_programa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_equipos_flota_programa ON public.equipos_flota USING btree (programa);


--
-- Name: ix_incidentes_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_incidentes_id ON public.incidentes USING btree (id);


--
-- Name: ix_incidentes_placa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_incidentes_placa ON public.incidentes USING btree (placa);


--
-- Name: inspecciones_flota inspecciones_flota_placa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecciones_flota
    ADD CONSTRAINT inspecciones_flota_placa_fkey FOREIGN KEY (placa) REFERENCES public.vehiculos(placa);


--
-- PostgreSQL database dump complete
--

\unrestrict xxCcvEHS1Mu55vfJcNnWQuUUikRk319SnNk73TAfnAqZROdV5KaNmocupZucKZv

