-- Complementa las tres migraciones existentes sin sustituir los maestros del ERP.
ALTER TABLE transreport.controles_vehiculos
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN IF NOT EXISTS datos jsonb,
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

ALTER TABLE transreport.controles_vehiculos
  ALTER COLUMN creado_en TYPE timestamptz(3);

CREATE TABLE transreport.dispositivos (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  base text NOT NULL CHECK (base IN ('Peruarbo','Moquegua','Espinar')),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transreport.registros (
  id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('personal','terceros','activos','llaves','relevos','rondas')),
  base text NOT NULL CHECK (base IN ('Peruarbo','Moquegua','Espinar')),
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  creado_en timestamptz(3) NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo,id),
  CHECK (datos ? 'id' AND datos->>'id'=id::text),
  CHECK (datos ? 'base' AND datos->>'base'=base),
  CHECK (datos->>'estado' IS NOT NULL)
);
CREATE UNIQUE INDEX personal_dni_abierto
  ON transreport.registros ((datos->>'dni'))
  WHERE tipo='personal' AND datos->>'estado'='En instalaciones';
CREATE UNIQUE INDEX llave_placa_abierta
  ON transreport.registros ((regexp_replace(upper(datos->>'placa'),'[[:space:]-]','','g')))
  WHERE tipo='llaves' AND datos->>'estado'='Fuera de garita';
CREATE INDEX registros_listado ON transreport.registros(tipo,base,creado_en DESC,id DESC);
CREATE INDEX vehiculos_listado ON transreport.controles_vehiculos(base,creado_en DESC,id DESC);

CREATE TABLE transreport.archivos (
  id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('vehiculos','personal','terceros','activos','llaves','relevos','rondas')),
  registro_id uuid NOT NULL,
  base text NOT NULL CHECK (base IN ('Peruarbo','Moquegua','Espinar')),
  vehiculo_id uuid GENERATED ALWAYS AS (CASE WHEN tipo='vehiculos' THEN registro_id END) STORED,
  control_tipo text GENERATED ALWAYS AS (CASE WHEN tipo<>'vehiculos' THEN tipo END) STORED,
  nombre text NOT NULL,
  public_id text NOT NULL UNIQUE,
  recurso text NOT NULL CHECK (recurso IN ('image','raw')),
  formato text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL CHECK (bytes>0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehiculo_id) REFERENCES transreport.controles_vehiculos(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (control_tipo,registro_id) REFERENCES transreport.registros(tipo,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX archivos_registro ON transreport.archivos(tipo,registro_id);

-- Conserva el acceso a evidencias que pudieran haberse guardado previamente.
INSERT INTO transreport.archivos(id,tipo,registro_id,base,nombre,public_id,recurso,formato,mime,bytes)
SELECT f.id,'vehiculos',c.id,c.base,f.vista||'.'||f.formato,f.cloudinary_public_id,'image',f.formato,
  CASE WHEN f.formato='jpg' THEN 'image/jpeg' ELSE 'image/'||f.formato END,f.bytes
FROM transreport.fotos_vehiculos f
JOIN transreport.movimientos_vehiculos m ON m.id=f.movimiento_id
JOIN transreport.controles_vehiculos c ON c.id=m.control_id;

CREATE TABLE transreport.operaciones (
  dispositivo_id uuid NOT NULL REFERENCES transreport.dispositivos(id),
  clave uuid NOT NULL,
  huella text NOT NULL,
  tipo text NOT NULL,
  registro_id uuid NOT NULL,
  respuesta jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(dispositivo_id,clave)
);
CREATE TABLE transreport.eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispositivo_id uuid NOT NULL,
  clave uuid NOT NULL,
  tipo text NOT NULL,
  registro_id uuid NOT NULL,
  accion text NOT NULL,
  revision integer NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(dispositivo_id,clave) REFERENCES transreport.operaciones(dispositivo_id,clave)
);
-- Además de la clave de reintento, protege el idNuevo de salidas independientes.
CREATE UNIQUE INDEX salida_id_movimiento_unico ON transreport.controles_vehiculos
 ((datos->'salida'->>'idMovimiento')) WHERE datos->'salida'->>'idMovimiento' IS NOT NULL;
