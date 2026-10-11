import React, {
  useCallback,
  useEffect,
  useState
} from 'react';

import toast from 'react-hot-toast';

import { api } from '../services/api';
import { UiIcon } from './UiIcon';

const ESTADOS = [
  'Pendiente',
  'En Proceso',
  'Resuelto'
];

const COLORES_ESTADO = {
  Pendiente: {
    background: '#fff6e4',
    color: '#b66a00'
  },
  'En Proceso': {
    background: '#e8f1ff',
    color: '#2458e8'
  },
  Resuelto: {
    background: '#e7f9f1',
    color: '#0e9f6e'
  }
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

const formatearFecha = valor => {
  if (!valor) return '—';

  const [anio, mes, dia] =
    String(valor)
      .slice(0, 10)
      .split('-');

  return dia && mes && anio
    ? `${dia}/${mes}/${anio}`
    : valor;
};

const formatearHora = valor =>
  valor
    ? String(valor).slice(0, 5)
    : '—';

export function ReportesPulserasPanel({
  canManage
}) {
  const [reportes, setReportes] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [updatingId, setUpdatingId] =
    useState(null);

  const cargarReportes =
    useCallback(async () => {
      try {
        setLoading(true);

        const data =
          await api.getReportesPulseras();

        setReportes(
          Array.isArray(data)
            ? data
            : []
        );
      } catch (error) {
        toast.error(
          error.message ||
          'No se pudieron cargar los reportes'
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  const cambiarEstado =
    async (id, estado) => {
      try {
        setUpdatingId(id);

        await api.updateEstadoReportePulsera(
          id,
          estado
        );

        setReportes(actuales =>
          actuales.map(reporte =>
            reporte.id === id
              ? {
                ...reporte,
                estado
              }
              : reporte
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
        Cargando reportes de pulseras...
      </div>
    );
  }

  return (
    <section>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '1rem'
      }}>
        <div>
          <h3 style={{
            margin: 0,
            color: 'var(--text-primary)'
          }}>
            Reportes de pulseras
          </h3>

          <p style={{
            margin: '0.3rem 0 0',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem'
          }}>
            {reportes.length} reporte(s) registrado(s)
          </p>
        </div>

        <button
          type="button"
          onClick={cargarReportes}
          className="ui-button ui-button-secondary"
        >
          <UiIcon name="refresh" />
          Actualizar
        </button>
      </div>

      {reportes.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem'
        }}>
          No existen reportes de pulseras.
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
                  'Reporte',
                  'Solicitante',
                  'Receptor',
                  'Operación',
                  'Llegada de personal',
                  'Motivo',
                  'Evidencia',
                  'Ingreso',
                  'Estado'
                ].map(titulo => (
                  <th
                    key={titulo}
                    style={{
                      padding: '0.85rem',
                      fontSize: '0.78rem',
                      textTransform: 'uppercase',
                      borderBottom:
                        '1px solid var(--border-color)'
                    }}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {reportes.map(reporte => {
                const colorEstado =
                  COLORES_ESTADO[
                    reporte.estado
                  ] ||
                  COLORES_ESTADO.Pendiente;

                return (
                  <tr
                    key={reporte.id}
                    style={{
                      color: 'var(--text-primary)',
                      borderBottom:
                        '1px solid var(--border-color)'
                    }}
                  >
                    <td style={{
                      padding: '0.85rem',
                      fontWeight: '700'
                    }}>
                      PUL-
                      {String(reporte.id)
                        .padStart(4, '0')}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {reporte.nombre_solicitante || '—'}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {reporte.nombre_receptor || '—'}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {reporte.operacion || '—'}
                    </td>

                    <td style={{
                      padding: '0.85rem',
                      whiteSpace: 'nowrap'
                    }}>
                      <strong>
                        {formatearFecha(
                          reporte.fecha_llegada_personal
                        )}
                      </strong>

                      <div style={{
                        marginTop: '0.25rem',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem'
                      }}>
                        {formatearHora(
                          reporte.hora_llegada_personal
                        )}
                      </div>
                    </td>

                    <td style={{
                      padding: '0.85rem',
                      maxWidth: '250px'
                    }}>
                      {reporte.motivo_renovacion}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {reporte.evidencia_url ? (
                        <button
                          type="button"
                          className="ui-button ui-button-secondary"
                          onClick={() =>
                            window.open(
                              reporte.evidencia_url,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          Ver
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td style={{
                      padding: '0.85rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatearFechaHora(
                        reporte.fecha_creacion
                      )}
                    </td>

                    <td style={{ padding: '0.85rem' }}>
                      {canManage ? (
                        <select
                          value={
                            reporte.estado ||
                            'Pendiente'
                          }
                          disabled={
                            updatingId === reporte.id
                          }
                          onChange={event =>
                            cambiarEstado(
                              reporte.id,
                              event.target.value
                            )
                          }
                          style={{
                            padding: '0.45rem 0.65rem',
                            borderRadius: '2rem',
                            border:
                              '1px solid var(--border-color)',
                            fontWeight: '700',
                            cursor: 'pointer',
                            ...colorEstado
                          }}
                        >
                          {ESTADOS.map(estado => (
                            <option
                              key={estado}
                              value={estado}
                            >
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
                          {reporte.estado || 'Pendiente'}
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