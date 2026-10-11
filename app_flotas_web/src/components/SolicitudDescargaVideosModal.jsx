import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { api } from '../services/api';
import { UiIcon } from './UiIcon';

const FORM_INICIAL = {
  cliente_operacion_id: '',
  placas: [],
  fecha_llegada_unidad: '',
  hora_llegada_unidad: '',
  fecha_descarga: '',
  hora_inicio: '',
  hora_fin: '',
  motivo: ''
};

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  outlineColor: 'var(--accent-color)'
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  color: 'var(--text-secondary)',
  fontSize: '0.85rem',
  fontWeight: '600'
};

export function SolicitudDescargaVideosModal({
  open,
  onClose,
  usuario
}) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [opciones, setOpciones] = useState({
    clientesOperaciones: [],
    vehiculos: [],
    nombreSolicitante: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busquedaPlaca, setBusquedaPlaca] = useState('');

  useEffect(() => {
    if (!open) return;

    let vigente = true;
    setLoading(true);

    api.getOpcionesSolicitudDescargaVideos()
      .then(data => {
        if (!vigente) return;

        setOpciones({
          clientesOperaciones:
            Array.isArray(data?.clientesOperaciones)
              ? data.clientesOperaciones
              : [],
          vehiculos: Array.isArray(data?.vehiculos)
            ? data.vehiculos
            : [],
          nombreSolicitante:
            data?.nombreSolicitante || ''
        });

        setForm(FORM_INICIAL);
        setBusquedaPlaca('');
      })
      .catch(error => {
        if (vigente) {
          toast.error(
            error.message ||
            'No se pudieron cargar las opciones'
          );
        }
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });

    return () => {
      vigente = false;
    };
  }, [open]);


  const placasCoincidentes =
    useMemo(() => {
      const termino =
        busquedaPlaca
          .trim()
          .toLowerCase();

      if (!termino) {
        return [];
      }

      return opciones.vehiculos.filter(
        vehiculo => {
          const placa = String(
            vehiculo?.placa || ''
          ).trim();

          const yaSeleccionada =
            form.placas.includes(placa);

          const coincide =
            placa
              .toLowerCase()
              .includes(termino);

          return (
            placa &&
            !yaSeleccionada &&
            coincide
          );
        }
      );
    }, [
      opciones.vehiculos,
      form.placas,
      busquedaPlaca
    ]);

  const agregarPlaca = placa => {
    setForm(actual => {
      if (actual.placas.includes(placa)) {
        return actual;
      }

      return {
        ...actual,
        placas: [
          ...actual.placas,
          placa
        ]
      };
    });

    setBusquedaPlaca('');
  };

  const quitarPlaca = placa => {
    setForm(actual => ({
      ...actual,
      placas: actual.placas.filter(
        item => item !== placa
      )
    }));
  };

  if (!open) return null;

  const guardar = async event => {
    event.preventDefault();

    if (
      !form.cliente_operacion_id ||
      form.placas.length === 0 ||
      !form.fecha_llegada_unidad ||
      !form.hora_llegada_unidad ||
      !form.fecha_descarga ||
      !form.hora_inicio ||
      !form.hora_fin ||
      !form.motivo.trim()
    ) {
      return toast.error('Complete todos los campos');
    }

    if (form.hora_fin <= form.hora_inicio) {
      return toast.error(
        'La hora final debe ser posterior a la hora inicial'
      );
    }

    try {
      setSaving(true);

      await api.createSolicitudDescargaVideos({
        ...form,
        motivo: form.motivo.trim()
      });

      toast.success('Solicitud de descarga registrada');
      setForm(FORM_INICIAL);
      onClose();
    } catch (error) {
      toast.error(
        error.message ||
        'No se pudo registrar la solicitud'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(16,27,51,0.45)',
        backdropFilter: 'blur(5px)'
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '2rem',
          borderRadius: '1rem',
          backgroundColor: 'var(--bg-color)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              color: 'var(--text-primary)',
              fontSize: '1.5rem'
            }}>
              Solicitud de descarga de videos
            </h2>
            <p style={{
              margin: '0.35rem 0 0',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem'
            }}>
              Seleccione las placas y el rango horario solicitado.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-icon-button"
            aria-label="Cerrar"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <form
          onSubmit={guardar}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem'
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem'
          }}>
            <div>
              <label style={labelStyle}>Nombre del solicitante</label>
              <input
                type="text"
                readOnly
                value={
                  opciones.nombreSolicitante ||
                  usuario?.nombre_completo ||
                  usuario?.username ||
                  'Usuario actual'
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Cliente / Operación</label>
              <select
                required
                value={form.cliente_operacion_id}
                disabled={loading}
                onChange={event =>
                  setForm(actual => ({
                    ...actual,
                    cliente_operacion_id:
                      event.target.value
                  }))
                }
                style={inputStyle}
              >
                <option value="">
                  {loading
                    ? 'Cargando...'
                    : 'Seleccione un cliente y una operación'}
                </option>
                {opciones.clientesOperaciones.map(opcion => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.etiqueta || `${opcion.cliente} - ${opcion.operacion}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '0.5rem'
            }}>
              <label style={{
                ...labelStyle,
                marginBottom: 0
              }}>
                Placas
              </label>

              <span style={{
                color: 'var(--text-secondary)',
                fontSize: '0.8rem'
              }}>
                {form.placas.length} agregada(s)
              </span>
            </div>

            <>
              <input
                type="search"
                value={busquedaPlaca}
                onChange={event =>
                  setBusquedaPlaca(event.target.value)
                }
                placeholder="Escriba una placa para buscar..."
                autoComplete="off"
                style={inputStyle}
              />
              {busquedaPlaca.trim() && (
                <div style={{
                  maxHeight: '190px',
                  overflowY: 'auto',
                  marginTop: '0.5rem',
                  borderRadius: '0.65rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)'
                }}>
                  {placasCoincidentes.length === 0 ? (
                    <p style={{
                      padding: '1rem',
                      margin: 0,
                      color: 'var(--text-secondary)',
                      textAlign: 'center'
                    }}>
                      {opciones.vehiculos.length === 0
                        ? 'No existen placas para esta operación.'
                        : form.placas.length === opciones.vehiculos.length
                          ? 'Todas las placas fueron agregadas.'
                          : 'No se encontraron placas.'}
                    </p>
                  ) : (
                    placasCoincidentes.map(vehiculo => (
                      <button
                        key={vehiculo.placa}
                        type="button"
                        onClick={() =>
                          agregarPlaca(vehiculo.placa)
                        }
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem 1rem',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          border: 'none',
                          borderBottom:
                            '1px solid var(--border-color)',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <strong>{vehiculo.placa}</strong>

                        <span style={{
                          color: 'var(--accent-color)',
                          fontSize: '0.82rem',
                          fontWeight: '700'
                        }}>
                          + Agregar
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div style={{
                marginTop: '1rem'
              }}>
                <div style={{
                  marginBottom: '0.55rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.82rem',
                  fontWeight: '600'
                }}>
                  Placas agregadas a la solicitud
                </div>

                {form.placas.length === 0 ? (
                  <div style={{
                    padding: '1rem',
                    borderRadius: '0.65rem',
                    border:
                      '1px dashed var(--border-color)',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    fontSize: '0.85rem'
                  }}>
                    Todavía no ha agregado ninguna placa.
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.55rem',
                    padding: '0.75rem',
                    borderRadius: '0.65rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)'
                  }}>
                    {form.placas.map(placa => (
                      <span
                        key={placa}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '2rem',
                          backgroundColor:
                            'var(--accent-color)',
                          color: 'white',
                          fontSize: '0.82rem',
                          fontWeight: '700'
                        }}
                      >
                        {placa}

                        <button
                          type="button"
                          onClick={() =>
                            quitarPlaca(placa)
                          }
                          aria-label={`Quitar placa ${placa}`}
                          title="Quitar placa"
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: '18px',
                            height: '18px',
                            padding: 0,
                            border: 'none',
                            borderRadius: '50%',
                            backgroundColor:
                              'rgba(255,255,255,0.25)',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>

          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem'
          }}>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem'
              }}
            >
              <div>
                <label style={labelStyle}>
                  Fecha de llegada de la unidad
                </label>

                <input
                  type="date"
                  required
                  value={form.fecha_llegada_unidad}
                  onChange={event => setForm({
                    ...form,
                    fecha_llegada_unidad: event.target.value
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Hora de llegada de la unidad
                </label>

                <input
                  type="time"
                  required
                  value={form.hora_llegada_unidad}
                  onChange={event => setForm({
                    ...form,
                    hora_llegada_unidad: event.target.value
                  })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem'
              }}
            >
              <div>
                <label style={labelStyle}>
                  Fecha de la descarga
                </label>

                <input
                  type="date"
                  required
                  value={form.fecha_descarga}
                  onChange={event => setForm({
                    ...form,
                    fecha_descarga: event.target.value
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Hora de inicio de descarga
                </label>

                <input
                  type="time"
                  required
                  value={form.hora_inicio}
                  onChange={event => setForm({
                    ...form,
                    hora_inicio: event.target.value
                  })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Hora de fin de descarga
                </label>

                <input
                  type="time"
                  required
                  value={form.hora_fin}
                  onChange={event => setForm({
                    ...form,
                    hora_fin: event.target.value
                  })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Motivo</label>
            <textarea
              required
              rows="4"
              maxLength={1000}
              value={form.motivo}
              onChange={event => setForm({
                ...form,
                motivo: event.target.value
              })}
              placeholder="Explique el motivo de la descarga..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <small style={{ color: 'var(--text-secondary)' }}>
            La fecha y hora de ingreso se registrarán automáticamente.
          </small>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              onClick={onClose}
              className="ui-button ui-button-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="ui-button ui-button-primary"
            >
              {saving ? 'Guardando...' : 'Guardar solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
