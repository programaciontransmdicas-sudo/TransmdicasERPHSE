import { useEffect, useRef, useState } from 'react';
import { UiIcon } from './UiIcon';

const enlaceSeguro = valor => {
  try {
    const url = new URL(valor);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};

export function RespuestaSolicitudVideosModal({ solicitud, soloLectura, guardando, onCerrar, onGuardar }) {
  const enlacesActuales = Array.isArray(solicitud.enlaces_videos) ? solicitud.enlaces_videos : [];
  const [enlaces, setEnlaces] = useState(enlacesActuales.join('\n'));
  const [observaciones, setObservaciones] = useState(solicitud.observaciones_atencion || '');
  const [error, setError] = useState('');
  const enviando = useRef(false);

  useEffect(() => {
    const anterior = document.activeElement;
    const listener = event => {
      if (event.key === 'Escape' && !guardando) onCerrar();
    };
    document.addEventListener('keydown', listener);
    return () => { document.removeEventListener('keydown', listener); anterior?.focus?.(); };
  }, [guardando, onCerrar]);

  const guardar = async event => {
    event.preventDefault();
    if (guardando || enviando.current) return;
    const lista = [...new Set(enlaces.split(/\r?\n/).map(e => e.trim()).filter(Boolean))];
    if (lista.length < 1 || lista.length > 20 || lista.some(e => e.length > 2048 || !enlaceSeguro(e))) {
      setError('Agrega entre 1 y 20 enlaces válidos, uno por línea, que comiencen con https:// o http://.');
      return;
    }
    setError('');
    enviando.current = true;
    try { await onGuardar({ enlaces_videos: lista, observaciones_atencion: observaciones.trim() }); }
    finally { enviando.current = false; }
  };

  return (
    <div className="ui-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="respuesta-video-titulo">
      <form className="ui-modal-card" onSubmit={guardar} style={{ width: 'min(620px, 94vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="ui-modal-heading">
          <div>
            <h3 id="respuesta-video-titulo">{soloLectura ? 'Respuesta de la solicitud' : 'Entregar videos'}</h3>
            <p>DVD-{String(solicitud.id).padStart(4, '0')}</p>
          </div>
          <button className="ui-icon-button" type="button" disabled={guardando} onClick={onCerrar} aria-label="Cerrar"><UiIcon name="close" /></button>
        </div>
        {soloLectura ? (
          <div>
            {enlacesActuales.length ? <ul style={{ paddingLeft: '1.3rem' }}>
              {enlacesActuales.map((enlace, index) => <li key={`${index}-${enlace}`} style={{ marginBottom: '0.7rem', overflowWrap: 'anywhere' }}>
                {enlaceSeguro(enlace) ? <a href={enlace} target="_blank" rel="noopener noreferrer">Abrir video {index + 1}</a> : 'Enlace no disponible'}
              </li>)}
            </ul> : <p>No hay enlaces de videos registrados para esta solicitud.</p>}
            <h4>Observaciones</h4>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{solicitud.observaciones_atencion || 'Sin observaciones.'}</p>
            {solicitud.fecha_atencion && <p>Atendida el {new Date(solicitud.fecha_atencion).toLocaleString('es-PE', { timeZone: 'America/Lima' })}{solicitud.nombre_atendedor ? ` por ${solicitud.nombre_atendedor}` : ''}.</p>}
          </div>
        ) : (
          <>
            <label className="ui-field" htmlFor="respuesta-video-enlaces"><span>Enlaces de los videos *</span>
              <textarea id="respuesta-video-enlaces" autoFocus rows={5} value={enlaces} disabled={guardando} required maxLength={42000}
                onChange={e => setEnlaces(e.target.value)} placeholder={'https://...\nhttps://...'} />
            </label>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Agrega un enlace por línea. Comprueba que el solicitante tenga permiso para abrir los videos.</p>
            <label className="ui-field" htmlFor="respuesta-video-observaciones"><span>Observaciones</span>
              <textarea id="respuesta-video-observaciones" rows={3} maxLength={4000} value={observaciones} disabled={guardando}
                onChange={e => setObservaciones(e.target.value)} placeholder="Indica qué videos entregas o cualquier detalle importante." />
            </label>
            {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}
          </>
        )}
        <div className="ui-modal-actions">
          <button type="button" className="ui-button ui-button-secondary" disabled={guardando} onClick={onCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && <button type="submit" className="ui-button ui-button-success" disabled={guardando}>{guardando ? 'Guardando…' : 'Entregar y marcar como atendida'}</button>}
        </div>
      </form>
    </div>
  );
}
