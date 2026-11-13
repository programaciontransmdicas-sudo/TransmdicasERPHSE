import { useEffect, useState } from 'react';
import { apiTiPr01 } from '../../services/api';
import { AdjuntosSeleccionados } from '../AdjuntosSeleccionados';

export function DesviacionOrden({ programaId, orden, editable, bloqueado }) {
  const [registro, setRegistro] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState(null);
  const [imagen, setImagen] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const visitaId = orden.programacion_id, otId = orden.id;

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true); setError('');
    apiTiPr01.obtenerDesviacion(programaId, visitaId, otId, controller.signal).then(data => {
      const d = data.desviacion;
      setRegistro(d); setRespuesta(d ? (d.existe ? 'si' : 'no') : '');
      setDescripcion(d?.descripcion || ''); setFoto(null);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [programaId, visitaId, otId]);

  useEffect(() => {
    if (!registro?.tiene_imagen || !registro.existe) { setImagen(''); return; }
    const controller = new AbortController();
    let url = '';
    apiTiPr01.imagenDesviacion(programaId, visitaId, otId, controller.signal).then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setImagen(url); }
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [programaId, visitaId, otId, registro]);

  const guardar = async () => {
    if (!respuesta) { setError('Selecciona Sí o No.'); return; }
    if (respuesta === 'si' && !descripcion.trim()) { setError('Describe la desviación encontrada.'); return; }
    setGuardando(true); setError(''); setMensaje('');
    try {
      const data = await apiTiPr01.guardarDesviacion(programaId, visitaId, otId, respuesta === 'si', descripcion.trim(), respuesta === 'si' ? foto : null);
      setRegistro(data.desviacion); setFoto(null); setMensaje('Desviación guardada.');
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };
  const inactivo = !editable || bloqueado || guardando || cargando;
  return <section className="ti-card ti-desviacion" style={{ marginTop: 12 }}>
    <style>{`
      .ti-desviacion .desv-intro { margin: 0 0 16px; color: var(--text-secondary, #64748b); font-size: 13px; line-height: 1.5; }
      .ti-desviacion .desv-campos { border: 0; padding: 0; margin: 0; min-width: 0; }
      .ti-desviacion .desv-pregunta { display: block; margin: 0 0 10px; color: var(--text-primary, #152238); font-size: 14px; font-weight: 700; }
      .ti-desviacion .desv-opciones { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
      .ti-desviacion .desv-opcion { display: inline-flex; align-items: center; gap: 9px; min-width: 108px; padding: 10px 14px; border: 1px solid var(--border-color, #dce4ef); border-radius: 8px; background: var(--bg-color, #fff); color: var(--text-primary, #172238); font-size: 14px; font-weight: 600; cursor: pointer; }
      .ti-desviacion .desv-opcion.seleccionada { border-color: #2563eb; background: #eff6ff; color: #1e40af; }
      .ti-desviacion .desv-opcion input { width: 16px; height: 16px; margin: 0; accent-color: #2563eb; }
      .ti-desviacion .desv-campos:disabled .desv-opcion { cursor: default; }
      .ti-desviacion .desv-detalle { display: grid; gap: 16px; }
      .ti-desviacion .desv-campo { display: grid; gap: 6px; color: var(--text-primary, #172238); font-size: 13px; font-weight: 700; }
      .ti-desviacion .desv-campo textarea { display: block; width: 100%; box-sizing: border-box; min-height: 100px; padding: 11px 12px; resize: vertical; border: 1px solid var(--border-color, #dce4ef); border-radius: 8px; background: var(--bg-color, #fff); color: var(--text-primary, #172238); font: inherit; font-weight: 400; }
      .ti-desviacion .desv-ayuda { color: var(--text-secondary, #64748b); font-size: 12px; font-weight: 400; line-height: 1.5; }
      .ti-desviacion .desv-archivo { width: 100%; box-sizing: border-box; color: var(--text-secondary, #64748b); font-size: 13px; font-weight: 400; }
      .ti-desviacion .desv-archivo::file-selector-button { margin-right: 12px; padding: 9px 14px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 7px; background: var(--bg-color, #fff); color: var(--text-primary, #172238); font-weight: 600; cursor: pointer; }
      .ti-desviacion .desv-foto { display: block; max-width: min(100%, 300px); max-height: 200px; border: 1px solid var(--border-color, #dce4ef); border-radius: 8px; object-fit: contain; }
      .ti-desviacion .desv-acciones { display: flex; margin-top: 18px; }
      .ti-desviacion .desv-ok { margin: 0 0 12px; color: #047857; font-size: 13px; font-weight: 600; }
      @media (max-width: 520px) { .ti-desviacion .desv-opcion { flex: 1; justify-content: center; } .ti-desviacion .desv-acciones button { width: 100%; } }
    `}</style>
    <h3>Desviación adicional</h3>
    <div className="ti-pad">
      <p className="desv-intro">Registra cualquier hallazgo adicional encontrado durante la revisión.</p>
      {cargando && <p role="status">Cargando desviación…</p>}
      {error && <div role="alert" className="ti-badbox">{error}</div>}
      {mensaje && <p role="status" className="desv-ok">{mensaje}</p>}
      <fieldset disabled={inactivo} className="desv-campos">
        <legend className="desv-pregunta">¿Se encontró alguna desviación adicional?</legend>
        <div className="desv-opciones">
          <label className={`desv-opcion ${respuesta === 'si' ? 'seleccionada' : ''}`}>
            <input type="radio" name={`desviacion-${otId}`} checked={respuesta === 'si'} onChange={() => { setRespuesta('si'); setMensaje(''); }} /> Sí
          </label>
          <label className={`desv-opcion ${respuesta === 'no' ? 'seleccionada' : ''}`}>
            <input type="radio" name={`desviacion-${otId}`} checked={respuesta === 'no'} onChange={() => { setRespuesta('no'); setFoto(null); setMensaje(''); }} /> No
          </label>
        </div>
        {respuesta === 'si' && <div className="desv-detalle">
          <label className="desv-campo">
            <span>Descripción de la desviación <span aria-hidden="true">*</span></span>
            <textarea rows={3} maxLength={4000} value={descripcion} placeholder="Describe el hallazgo encontrado…" onChange={e => { setDescripcion(e.target.value); setMensaje(''); }} />
          </label>
          {imagen && <div className="desv-campo"><span>Fotografía guardada</span><img className="desv-foto" src={imagen} alt="Fotografía de la desviación" /></div>}
          {editable && <label className="desv-campo">
            <span>Fotografía de la desviación <span className="desv-ayuda">(opcional)</span></span>
            <span className="desv-ayuda">JPG, PNG o WEBP · Máximo 10 MB</span>
            <input className="desv-archivo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const archivo = e.target.files?.[0] || null; e.target.value = ''; setFoto(archivo); setMensaje(''); }} />
          </label>}
          <AdjuntosSeleccionados archivos={foto ? [foto] : []} disabled={inactivo} onQuitar={() => setFoto(null)} />
        </div>}
      </fieldset>
      {editable && <div className="desv-acciones"><button type="button" className="ti-btn primary" disabled={inactivo} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar desviación'}</button></div>}
    </div>
  </section>;
}
