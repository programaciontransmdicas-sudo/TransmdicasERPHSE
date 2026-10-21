import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { UiIcon } from './UiIcon';
import { AdjuntosSeleccionados } from './AdjuntosSeleccionados';

const campo = {
  width: '100%', padding: '0.7rem', borderRadius: '0.5rem',
  border: '1px solid var(--border-color)', background: 'var(--bg-color)',
  color: 'var(--text-primary)', boxSizing: 'border-box'
};

export function CerrarReportePulseraModal({ reporte, onClose, onCrearEntrega, onCerrado }) {
  const [decision, setDecision] = useState('');
  const [motivo, setMotivo] = useState('');
  const [evidencia, setEvidencia] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);

  const guardar = async event => {
    event.preventDefault();
    if (enviando.current) return;
    if (decision === 'si') {
      if (typeof onCrearEntrega !== 'function') {
        toast.error('No se pudo abrir Entregas TI. Actualiza la página e inténtalo nuevamente.');
        return;
      }
      onCrearEntrega(reporte);
      return;
    }
    if (decision !== 'no' || !motivo.trim() || !evidencia) {
      toast.error('Indique si aplica un cambio. Para cerrar sin cambio, complete el motivo y la fotografía.');
      return;
    }
    enviando.current = true;
    setGuardando(true);
    try {
      const cerrado = await api.cerrarReportePulseraSinCambio(reporte.id, { motivo: motivo.trim(), evidencia });
      toast.success('Reporte cerrado sin cambio de pulsera');
      onCerrado(cerrado);
    } catch (error) {
      toast.error(error.message || 'No se pudo cerrar el reporte');
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(16,27,51,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="titulo-cierre-pulsera" style={{ position: 'relative', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '1rem', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
        <button type="button" className="ui-icon-button" aria-label="Cerrar confirmación" disabled={guardando} onClick={onClose} style={{ position: 'absolute', right: '1rem', top: '1rem' }}><UiIcon name="close" /></button>
        <h3 id="titulo-cierre-pulsera" style={{ margin: '0 2rem 0.5rem 0' }}>Cerrar reporte de pulsera</h3>
        <p style={{ color: 'var(--text-secondary)' }}>PUL-{String(reporte.id).padStart(4, '0')} · {reporte.nombre_receptor}</p>
        <form onSubmit={guardar} style={{ display: 'grid', gap: '1rem' }}>
          <fieldset disabled={guardando} style={{ border: '1px solid var(--border-color)', borderRadius: '0.6rem', padding: '1rem' }}>
            <legend>¿Aplica un cambio de pulsera?</legend>
            <label style={{ display: 'block', margin: '0.4rem 0' }}><input type="radio" name="aplica_cambio" value="si" required checked={decision === 'si'} onChange={() => setDecision('si')} /> Sí, entregar una nueva pulsera</label>
            <label style={{ display: 'block', margin: '0.4rem 0' }}><input type="radio" name="aplica_cambio" value="no" required checked={decision === 'no'} onChange={() => setDecision('no')} /> No, cerrar sin cambio</label>
          </fieldset>
          {decision === 'si' && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Se abrirá una nueva entrega TI para esta persona. El reporte se cerrará cuando registres la entrega.</p>}
          {decision === 'no' && <>
            <label htmlFor="motivo-cierre-pulsera">Motivo del cierre sin cambio *</label>
            <textarea id="motivo-cierre-pulsera" value={motivo} onChange={event => setMotivo(event.target.value)} required maxLength={4000} rows={4} disabled={guardando} style={{ ...campo, resize: 'vertical' }} />
            <label htmlFor="evidencia-cierre-pulsera">Fotografía de evidencia *</label>
            <input id="evidencia-cierre-pulsera" type="file" accept="image/*" disabled={guardando} required={!evidencia} onChange={event => {
              const archivo = event.target.files?.[0];
              event.target.value = '';
              if (!archivo) return;
              if (!archivo.type.startsWith('image/')) { toast.error('Seleccione una imagen'); return; }
              if (archivo.size > 5 * 1024 * 1024) { toast.error('La fotografía debe pesar como máximo 5 MB'); return; }
              setEvidencia(archivo);
            }} style={campo} />
            <small style={{ color: 'var(--text-secondary)' }}>Imagen de hasta 5 MB.</small>
            <AdjuntosSeleccionados archivos={evidencia ? [evidencia] : []} onQuitar={() => setEvidencia(null)} disabled={guardando} />
          </>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" className="ui-button ui-button-secondary" disabled={guardando} onClick={onClose}>Cancelar</button>
            <button type="submit" className="ui-button ui-button-primary" disabled={guardando || !decision || (decision === 'no' && (!motivo.trim() || !evidencia))}>{guardando ? 'Guardando…' : decision === 'si' ? 'Crear entrega TI' : 'Cerrar reporte'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
