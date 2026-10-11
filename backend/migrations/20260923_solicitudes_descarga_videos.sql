BEGIN;

CREATE TABLE IF NOT EXISTS solicitudes_descarga_videos (
  id BIGSERIAL PRIMARY KEY,
  operacion VARCHAR(100) NOT NULL,
  fecha_descarga DATE NOT NULL,
  hora_inicio TIME WITHOUT TIME ZONE NOT NULL,
  hora_fin TIME WITHOUT TIME ZONE NOT NULL,
  motivo TEXT NOT NULL,
  solicitado_por INTEGER NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
  fecha_ingreso TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_solicitud_video_operacion
    CHECK (BTRIM(operacion) <> ''),
  CONSTRAINT chk_solicitud_video_horas
    CHECK (hora_fin > hora_inicio),
  CONSTRAINT chk_solicitud_video_motivo
    CHECK (
      BTRIM(motivo) <> ''
      AND CHAR_LENGTH(motivo) <= 1000
    ),
  CONSTRAINT fk_solicitud_video_usuario
    FOREIGN KEY (solicitado_por)
    REFERENCES usuarios(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS solicitud_descarga_video_placas (
  solicitud_id BIGINT NOT NULL,
  placa VARCHAR(20) NOT NULL,

  CONSTRAINT pk_solicitud_descarga_video_placas
    PRIMARY KEY (solicitud_id, placa),
  CONSTRAINT fk_solicitud_video_placas_solicitud
    FOREIGN KEY (solicitud_id)
    REFERENCES solicitudes_descarga_videos(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_solicitud_video_placas_vehiculo
    FOREIGN KEY (placa)
    REFERENCES vehiculos(placa)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_video_fecha
  ON solicitudes_descarga_videos(fecha_descarga);

CREATE INDEX IF NOT EXISTS idx_solicitudes_video_usuario
  ON solicitudes_descarga_videos(solicitado_por);

CREATE INDEX IF NOT EXISTS idx_solicitud_video_placas_placa
  ON solicitud_descarga_video_placas(placa);

COMMIT;
