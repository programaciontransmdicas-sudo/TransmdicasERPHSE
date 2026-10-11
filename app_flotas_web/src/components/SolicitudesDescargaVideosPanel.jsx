import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { api } from '../services/api';
import { UiIcon } from './UiIcon';

const ESTADOS = [
  'Pendiente',
  'En proceso',
  'Atendida',
  'Rechazada'
];

const COLORES_ESTADO = {
  Pendiente: {
    background: '#fff6e4',
    color: '#b66a00'
  },
  'En proceso': {
    background: '#e8f1ff',
    color: '#2458e8'
  },
  Atendida: {
    background: '#e7f9f1',
    color: '#0e9f6e'
  },
  Rechazada: {
    background: '#fdeae8',
    color: '#dc3b2a'
  }
};

const formatearFecha = valor => {
  if (!valor) return '—';

  const fecha = String(valor).slice(0, 10);
  const [anio, mes, dia] = fecha.split('-');

  return dia && mes && anio
    ? `${dia}/${mes}/${anio}`
    : valor;
};

const formatearFechaHora = valor => {
  if (!valor) return '—';

  return new Date(valor).toLocaleString(
    'es-PE',
    {
      dateStyle: 'short',
      timeStyle: 'short'
    }
  );
};

const formatearHora = valor =>
  valor ? String(valor).slice(0, 5) : '—';

export function SolicitudesDescargaVideosPanel({
  canManage
}) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const cargarSolicitudes = useCallback(async () => {
    try {
      setLoading(true);

      const data =
        await api.getSolicitudesDescargaVideos();

      setSolicitudes(
        Array.isArray(data) ? data : []
      );
    } catch (error) {
      toast.error(
        error.message ||
        'No se pudieron cargar las solicitudes'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarSolicitudes();
  }, [cargarSolicitudes]);

  const cambiarEstado = async (id, estado) => {
    try {
      setUpdatingId(id);

      await api.updateEstadoSolicitudDescargaVideos(
        id,
        estado
      );

      setSolicitudes(actuales =>
        actuales.map(solicitud =>
          solicitud.id === id
            ? { ...solicitud, estado }
            : solicitud
        )
      );

      toast.success('Estado actualizado');
    } catch (error) {
      toast.error(
        error.message ||
        'No se pudo actualizar el estado'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '3rem',
        textAlign: 'center',
        color: 'var(--text-secondary)'
      }}>
        Cargando solicitudes de descarga...
      </div>
    );
  }

  return (
    <section>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <h3 style={{
            margin: 0,
            color: 'var(--text-primary)'
          }}>
            Solicitudes de descarga de videos
          </h3>
          <p style={{
            margin: '0.3rem 0 0',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem'
          }}>
            {solicitudes.length} solicitud(es) registrada(s)
          </p>
        </div>

        <button
          type="button"
          onClick={cargarSolicitudes}
          className="ui-button ui-button-secondary"
        >
          <UiIcon name="refresh" />
          Actualizar
        </button>
      </div>

      {solicitudes.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem'
        }}>
          No existen solicitudes de descarga de videos.
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          backgroundColor: 'var(--card-bg)'
        }}>
          <table style={{
            width: '100%',
            minWidth: '1100px',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                textAlign: 'left'
              }}>
                {[
                  'Solicitud',
                  'Solicitante',
                  'Operación',
                  'Placas',
                  'Descarga solicitada',
                  'Motivo',
                  'Ingreso',
                  'Estado'
                ].map(titulo => (
                  <th
                    key={titulo}
                    style={{
                      padding: '0.85rem',
                      fontSize: '0.78rem',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {solicitudes.map(solicitud => {
                const colorEstado =
                  COLORES_ESTADO[solicitud.estado] ||
                  COLORES_ESTADO.Pendiente;

                return (
                  <tr
                    key={solicitud.id}
                    style={{
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                  >
                    <td style={{ padding: '0.85rem', fontWeight: '700' }}>
                      DVD-{String(solicitud.id).padStart(4, '0')}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {solicitud.nombre_solicitante || '—'}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {solicitud.operacion}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      <div style={{
                        display: 'flex',
                        gap: '0.35rem',
                        flexWrap: 'wrap',
                        maxWidth: '230px'
                      }}>
                        {(solicitud.placas || []).map(placa => (
                          <span
                            key={placa}
                            style={{
                              padding: '0.2rem 0.45rem',
                              borderRadius: '0.4rem',
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)',
                              fontSize: '0.78rem',
                              fontWeight: '700'
                            }}
                          >
                            {placa}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem', whiteSpace: 'nowrap' }}>
                      <strong>{formatearFecha(solicitud.fecha_descarga)}</strong>
                      <div style={{
                        marginTop: '0.25rem',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem'
                      }}>
                        {formatearHora(solicitud.hora_inicio)} –{' '}
                        {formatearHora(solicitud.hora_fin)}
                      </div>
                    </td>

                    <td style={{
                      padding: '0.85rem',
                      maxWidth: '240px',
                      whiteSpace: 'normal'
                    }}>
                      {solicitud.motivo}
                    </td>

                    <td style={{ padding: '0.85rem', whiteSpace: 'nowrap' }}>
                      {formatearFechaHora(solicitud.fecha_ingreso)}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {canManage ? (
                        <select
                          value={solicitud.estado}
                          disabled={updatingId === solicitud.id}
                          onChange={event =>
                            cambiarEstado(
                              solicitud.id,
                              event.target.value
                            )
                          }
                          style={{
                            padding: '0.45rem 0.65rem',
                            borderRadius: '2rem',
                            border: '1px solid var(--border-color)',
                            fontWeight: '700',
                            cursor: 'pointer',
                            ...colorEstado
                          }}
                        >
                          {ESTADOS.map(estado => (
                            <option key={estado} value={estado}>
                              {estado}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '0.4rem 0.7rem',
                          borderRadius: '2rem',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          ...colorEstado
                        }}>
                          {solicitud.estado}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
