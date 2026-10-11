import React, {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';

import { api } from '../services/api';

const formatearTiempo = fecha => {
    if (!fecha) return '';

    const diferencia =
        Date.now - new Date(fecha).getTime();

    const minutos =
        Math.floor(diferencia / 60000);

    if (minutos < 1) {
        return 'Ahora';
    }
    if (minutos < 60) {
        return `Hace ${minutos} min`;
    }
    const horas =
        Math.floor(minutos / 60);

    if (horas < 24) {
        return `Hace ${horas} h`;
    }
    return new Date(fecha).toLocaleString(
        'es-PE',
        {
            day: '2-digit',
            month: 'short'
        }
    );
};
export function NotificacionesBell({
    onNavigate
}) {
    const [abierto, setAbierto] =
        useState(false);

    const [notificaciones, setNotificaciones] =
        useState([]);

    const [noLeidas, setNoLeidas] =
        useState(0);

    const contenedorRef = useRef(null);

    const cargarNotificaciones =
        useCallback(async () => {
            try {
                const data =
                    await api.getNotificaciones();

                setNotificaciones(
                    Array.isArray(data?.notificaciones)
                        ? data.notificaciones
                        : []
                );

                setNoLeidas(
                    Number(data?.noLeidas || 0)
                );
            } catch (error) {
                console.error(
                    'Error cargando notificaciones:',
                    error
                );
            }
        }, []);

    useEffect(() => {
        cargarNotificaciones();

        const intervalo = setInterval(
            cargarNotificaciones,
            30000
        );

        return () => clearInterval(intervalo);
    }, [cargarNotificaciones]);

    useEffect(() => {
        const cerrarAlHacerClickFuera = event => {
            if (
                contenedorRef.current &&
                !contenedorRef.current.contains(
                    event.target
                )
            ) {
                setAbierto(false);
            }
        };

        document.addEventListener(
            'mousedown',
            cerrarAlHacerClickFuera
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                cerrarAlHacerClickFuera
            );
        };
    }, []);

    const abrirNotificacion =
        async notificacion => {
            try {
                if (!notificacion.leida) {
                    await api.leerNotificacion(
                        notificacion.id
                    );

                    setNotificaciones(actuales =>
                        actuales.map(item =>
                            item.id === notificacion.id
                                ? {
                                    ...item,
                                    leida: true
                                }
                                : item
                        )
                    );

                    setNoLeidas(actual =>
                        Math.max(0, actual - 1)
                    );
                }

                if (notificacion.url) {
                    onNavigate?.(notificacion.url);
                }

                setAbierto(false);
            } catch (error) {
                console.error(
                    'Error leyendo notificación:',
                    error
                );
            }
        };

    const marcarTodasLeidas =
        async () => {
            try {
                await api.leerTodasNotificaciones();

                setNotificaciones(actuales =>
                    actuales.map(item => ({
                        ...item,
                        leida: true
                    }))
                );

                setNoLeidas(0);
            } catch (error) {
                console.error(
                    'Error leyendo notificaciones:',
                    error
                );
            }
        };

    return (
        <div
            ref={contenedorRef}
            style={{
                position: 'relative'
            }}
        >
            <button
                type="button"
                className="erp-icon-button"
                title="Notificaciones"
                aria-label="Notificaciones"
                onClick={() => setAbierto(
                    actual => !actual
                )}
                style={{ position: 'relative' }}
            >
                <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                </svg>

                {noLeidas > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-6px',
                        minWidth: '17px',
                        height: '17px',
                        padding: '0 4px',
                        borderRadius: '999px',
                        backgroundColor: '#dc3b2a',
                        color: '#fff',
                        fontSize: '0.65rem',
                        lineHeight: '17px',
                        fontWeight: '800',
                        border: '2px solid var(--card-bg)'
                    }}>
                        {noLeidas > 99
                            ? '99+'
                            : noLeidas}
                    </span>
                )}
            </button>

            {abierto && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.7rem)',
                    right: 0,
                    width: 'min(380px, calc(100vw - 2rem))',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    zIndex: 3000,
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.85rem',
                    boxShadow:
                        '0 16px 40px rgba(16,27,51,0.20)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '1rem',
                        borderBottom:
                            '1px solid var(--border-color)'
                    }}>
                        <div>
                            <strong>Notificaciones</strong>
                            {noLeidas > 0 && (
                                <span style={{
                                    marginLeft: '0.5rem',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.78rem'
                                }}>
                                    {noLeidas} sin leer
                                </span>
                            )}
                        </div>

                        {noLeidas > 0 && (
                            <button
                                type="button"
                                onClick={marcarTodasLeidas}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#2458e8',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem'
                                }}
                            >
                                Marcar todas leídas
                            </button>
                        )}
                    </div>

                    {notificaciones.length === 0 ? (
                        <div style={{
                            padding: '2.5rem 1rem',
                            textAlign: 'center',
                            color: 'var(--text-secondary)'
                        }}>
                            No tienes notificaciones.
                        </div>
                    ) : (
                        notificaciones.map(notificacion => (
                            <button
                                key={notificacion.id}
                                type="button"
                                onClick={() =>
                                    abrirNotificacion(
                                        notificacion
                                    )
                                }
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    borderBottom:
                                        '1px solid var(--border-color)',
                                    cursor: 'pointer',
                                    padding: '0.9rem 1rem',
                                    backgroundColor:
                                        notificacion.leida
                                            ? 'transparent'
                                            : 'rgba(36,88,232,0.08)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.6rem'
                                }}>
                                    {!notificacion.leida && (
                                        <span style={{
                                            width: '8px',
                                            height: '8px',
                                            marginTop: '0.35rem',
                                            flexShrink: 0,
                                            borderRadius: '50%',
                                            backgroundColor: '#2458e8'
                                        }} />
                                    )}

                                    <div>
                                        <strong style={{
                                            display: 'block',
                                            fontSize: '0.88rem'
                                        }}>
                                            {notificacion.titulo}
                                        </strong>

                                        <span style={{
                                            display: 'block',
                                            marginTop: '0.2rem',
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.8rem',
                                            lineHeight: '1.35'
                                        }}>
                                            {notificacion.mensaje}
                                        </span>

                                        <small style={{
                                            display: 'block',
                                            marginTop: '0.35rem',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {formatearTiempo(
                                                notificacion.fecha_creacion
                                            )}
                                        </small>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}