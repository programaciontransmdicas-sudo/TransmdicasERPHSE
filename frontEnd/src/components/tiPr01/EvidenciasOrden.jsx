import { useCallback, useEffect, useRef, useState } from 'react';
import { apiTiPr01 } from '../../services/api';
import { AdjuntosSeleccionados } from '../AdjuntosSeleccionados';
import { ETIQUETA_EQUIPO } from './dominio';

const MENSAJES = {
  SOLO_TI_SUBE_EVIDENCIA: 'Solo TI o un administrador pueden subir fotografías.',
  SOLO_TI_RETIRA_EVIDENCIA: 'Solo TI o un administrador pueden retirar fotografías de una orden abierta.',
  SOLO_ADMIN_RETIRA_EVIDENCIA: 'Solo un administrador puede retirar fotografías de una orden cerrada o anulada.',
  ULTIMA_EVIDENCIA_OBLIGATORIA:
    'No se puede retirar esta fotografía porque el apartado quedaría por debajo del mínimo obligatorio.',
  MAXIMO_EVIDENCIAS_ALCANZADO: 'Este apartado ya tiene 4 fotografías activas.',
  FAMILIA_SIN_EVIDENCIA: 'Este equipo no admite fotografías.',
  ARCHIVO_NO_IMAGEN: 'Selecciona una imagen JPG, PNG o WEBP.',
  ARCHIVO_DEMASIADO_GRANDE: 'La imagen debe pesar como máximo 10 MB.',
  SIN_ARCHIVO: 'Selecciona una fotografía.',
  EVIDENCIA_YA_RETIRADA: 'La fotografía ya fue retirada. Actualiza la galería.',
  ORDEN_NO_ABIERTA: 'La orden ya no está abierta; no admite nuevas fotografías.'
};

function ErrorEvidencia({ error }) {
  if (!error) return null;
  return <div className="ti-badbox" role="alert">{MENSAJES[error.code] || error.message}</div>;
}

// El token se envía al ERP; el navegador recibe únicamente un blob temporal.
function ImagenEvidencia({ contexto, evidencia, ancho = 240, onAbrir }) {
  const [imagen, setImagen] = useState({ url: '', error: null });
  const [programaId, programacionId, otId] = contexto;
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    let activo = true;
    apiTiPr01.imagenEvidenciaOrden(programaId, programacionId, otId, evidencia.id, ancho, controller.signal)
      .then(blob => {
        if (!activo) return;
        url = URL.createObjectURL(blob);
        setImagen({ url, error: null });
      })
      .catch(error => {
        if (activo && error.name !== 'AbortError') setImagen({ url: '', error });
      });
    return () => {
      activo = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [programaId, programacionId, otId, evidencia.id, ancho]);
  if (imagen.error) return <ErrorEvidencia error={imagen.error} />;
  if (!imagen.url) return <span role="status" className="ti-smalltxt">Cargando fotografía…</span>;
  const foto = <img src={imagen.url} alt={`Evidencia del apartado ${evidencia.tipo_equipo || evidencia.detalle_id}`} />;
  return onAbrir
    ? <button type="button" className="ti-evidence-image" onClick={onAbrir} aria-label="Ampliar fotografía">{foto}</button>
    : <div className="ti-evidence-viewer">{foto}</div>;
}

function DialogoEvidencia({ titulo, children, onCerrar, ocupado }) {
  const dialogo = useRef(null);
  const cerrar = useRef(onCerrar);
  const busy = useRef(ocupado);
  useEffect(() => {
    cerrar.current = onCerrar;
    busy.current = ocupado;
  }, [onCerrar, ocupado]);
  useEffect(() => {
    const elementoAnterior = document.activeElement;
    const nodo = dialogo.current;
    nodo?.focus();
    const teclado = event => {
      if (event.key === 'Escape' && !busy.current) cerrar.current();
      if (event.key !== 'Tab') return;
      const botones = [...nodo.querySelectorAll('button:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      if (!botones.length) { event.preventDefault(); return; }
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      if (event.shiftKey && (document.activeElement === primero || document.activeElement === nodo)) {
        event.preventDefault(); ultimo.focus();
      } else if (!event.shiftKey && (document.activeElement === ultimo || document.activeElement === nodo)) {
        event.preventDefault(); primero.focus();
      }
    };
    nodo?.addEventListener('keydown', teclado);
    return () => { nodo?.removeEventListener('keydown', teclado); elementoAnterior?.focus(); };
  }, []);
  return <>
    <div className="ti-modal-overlay" onClick={ocupado ? undefined : onCerrar} />
    <div ref={dialogo} tabIndex={-1} className="ti-modal" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="ti-modal-h">{titulo}</div>
      <div className="ti-modal-b">{children}</div>
      <div className="ti-modal-f"><button type="button" className="ti-btn" onClick={onCerrar} disabled={ocupado}>Cerrar</button></div>
    </div>
  </>;
}

export function EvidenciasOrden({ programaId, orden, bloqueado }) {
  const [galeria, setGaleria] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [ampliada, setAmpliada] = useState(null);
  const [retiro, setRetiro] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [errorRetiro, setErrorRetiro] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [pendientes, setPendientes] = useState({});
  const candado = useRef(false);
  const montado = useRef(true);
  const contexto = [programaId, orden.programacion_id, orden.id];
  let rol = '';
  try { rol = String(JSON.parse(localStorage.getItem('nexus_user') || '{}').rol || '').toLowerCase(); } catch { /* sesión sin datos locales */ }
  if (rol === 'administrador') rol = 'admin';
  const cargar = useCallback(async () => {
    const datos = await apiTiPr01.listarEvidenciasOrden(programaId, orden.programacion_id, orden.id);
    if (montado.current) setGaleria(datos);
  }, [programaId, orden.programacion_id, orden.id]);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  useEffect(() => {
    let activo = true;
    cargar().catch(e => { if (activo) setError(e); }).finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [cargar, orden]);

  const ejecutar = async (trabajo, exito, esRetiro = false) => {
    if (candado.current || bloqueado) return false;
    candado.current = true;
    setOcupado(true); setError(null); setErrorRetiro(null); setMensaje('');
    try {
      await trabajo();
      if (!montado.current) return;
      setMensaje(exito);
      if (esRetiro) setRetiro(null);
      try { await cargar(); } catch (e) { setError(e); }
      return true;
    } catch (e) {
      if (!montado.current) return;
      if (esRetiro) setErrorRetiro(e); else setError(e);
      return false;
    } finally {
      candado.current = false;
      if (montado.current) setOcupado(false);
    }
  };
  const seleccionar = (apartado, event) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    if (!/\.(jpe?g|png|webp)$/i.test(archivo.name) || (archivo.type && !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type))) {
      setError({ code: 'ARCHIVO_NO_IMAGEN' }); return;
    }
    if (archivo.size > 10 * 1024 * 1024) { setError({ code: 'ARCHIVO_DEMASIADO_GRANDE' }); return; }
    if (!archivo.size) { setError({ message: 'La imagen está vacía.' }); return; }
    setError(null);
    setPendientes(actuales => ({ ...actuales, [apartado.detalle_id]: archivo }));
  };
  const quitarPendiente = detalleId => setPendientes(actuales => {
    const siguientes = { ...actuales };
    delete siguientes[detalleId];
    return siguientes;
  });
  const subir = async apartado => {
    const archivo = pendientes[apartado.detalle_id];
    if (!archivo) return;
    const guardado = await ejecutar(
      () => apiTiPr01.subirEvidenciaOrden(...contexto, apartado.detalle_id, archivo),
      'Fotografía agregada.'
    );
    if (guardado && montado.current) quitarPendiente(apartado.detalle_id);
  };
  const estadoOrden = galeria?.estado_orden || orden.estado;
  const puedeGestionarAbierta = rol === 'ti' || rol === 'admin';
  const puedeSubir = puedeGestionarAbierta && estadoOrden === 'ABIERTA';
  const puedeRetirar = estadoOrden === 'ABIERTA' ? puedeGestionarAbierta : ['CERRADA', 'ANULADA'].includes(estadoOrden) && rol === 'admin';
  return <section className="ti-card ti-evidence-section" aria-label="Evidencias de la orden">
    <h3>Evidencias fotográficas</h3>
    <div className="ti-pad">
      <p className="ti-smalltxt">Selecciona y revisa la fotografía antes de subirla · JPG, PNG o WEBP · máximo 10 MB.</p>
      <ErrorEvidencia error={error} />
      {mensaje && <p role="status">{mensaje}</p>}
      {cargando && <p role="status">Cargando evidencias…</p>}
      {!cargando && error && <button type="button" className="ti-btn" disabled={ocupado} onClick={() => { setError(null); cargar().catch(setError); }}>Actualizar galería</button>}
      {galeria?.apartados?.map(apartado => {
        const minimo =
          apartado.minimo ??
          (apartado.nivel_programado === 'M3' ? 3 : 1);

        const ultimaProtegida =
          estadoOrden === 'CERRADA' &&
          apartado.exige_evidencia &&
          apartado.activas <= minimo;
        return <div key={apartado.detalle_id} className="ti-section">
          <div className="ti-section-h"><b>{ETIQUETA_EQUIPO[apartado.tipo_equipo] || apartado.tipo_equipo}</b>
            {apartado.admite_evidencia && <span className="ti-right">{apartado.activas}/{apartado.maximo} fotografías</span>}
          </div>
          <div className="ti-section-b">
            {!apartado.admite_evidencia ? <p className="ti-smalltxt">Este equipo no admite evidencia fotográfica.</p> : <>
              {apartado.exige_evidencia && (
                <p className="ti-smalltxt">
                  Se requiere un mínimo de {minimo}{' '}
                  fotografía{minimo === 1 ? '' : 's'} para cerrar
                  este apartado.
                </p>
              )}
              {apartado.exige_observaciones && <p className="ti-smalltxt">Este resultado también requiere observaciones en el apartado.</p>}
              <div className="ti-evidence-grid">
                {apartado.evidencias.map(evidencia => <figure key={evidencia.id}>
                  <ImagenEvidencia contexto={contexto} evidencia={evidencia} onAbrir={() => setAmpliada(evidencia)} />
                  <figcaption>{evidencia.subida_por?.nombre || evidencia.subida_por?.username || 'Fotografía registrada'}</figcaption>
                  {puedeRetirar && <button type="button" className="ti-btn small" disabled={ocupado || bloqueado || ultimaProtegida}
                    title={ultimaProtegida ? MENSAJES.ULTIMA_EVIDENCIA_OBLIGATORIA : undefined}
                    onClick={() => { setRetiro(evidencia); setMotivo(''); setErrorRetiro(null); }}>Retirar</button>}
                </figure>)}
              </div>
              {!apartado.activas && <p className="ti-smalltxt">Todavía no hay fotografías.</p>}
              {puedeSubir && apartado.activas < apartado.maximo && <div className="ti-evidence-upload">
                <label className="ti-field">
                  <span>Seleccionar fotografía</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    disabled={ocupado || bloqueado} onChange={event => seleccionar(apartado, event)} />
                </label>
                <AdjuntosSeleccionados archivos={pendientes[apartado.detalle_id] ? [pendientes[apartado.detalle_id]] : []}
                  disabled={ocupado || bloqueado} onQuitar={() => quitarPendiente(apartado.detalle_id)} />
                {pendientes[apartado.detalle_id] && <div className="ti-bar" style={{ marginTop: 10 }}>
                  <button type="button" className="ti-btn primary" disabled={ocupado || bloqueado} onClick={() => subir(apartado)}>
                    {ocupado ? 'Subiendo…' : 'Subir fotografía'}
                  </button>
                  <span className="ti-smalltxt">Esta fotografía todavía no se ha guardado.</span>
                </div>}
              </div>}
              {apartado.activas >= apartado.maximo && <p className="ti-smalltxt">Se alcanzó el máximo de 4 fotografías.</p>}
              {ultimaProtegida && (
                <p className="ti-smalltxt">
                  Deben conservarse al menos {minimo}{' '}
                  fotografía{minimo === 1 ? '' : 's'}{' '}
                  activa{minimo === 1 ? '' : 's'}.
                </p>
              )}
            </>}
          </div>
        </div>;
      })}
    </div>
    {ampliada && <DialogoEvidencia titulo="Ver evidencia" onCerrar={() => setAmpliada(null)}>
      <ImagenEvidencia key={ampliada.id} contexto={contexto} evidencia={ampliada} ancho={960} />
    </DialogoEvidencia>}
    {retiro && <DialogoEvidencia titulo="Retirar fotografía" ocupado={ocupado} onCerrar={() => setRetiro(null)}>
      <p>La fotografía dejará de aparecer en la galería y conservará su registro de auditoría.</p>
      <label className="ti-field"><span>Motivo del retiro</span><textarea rows={3} maxLength={2000} value={motivo} disabled={ocupado} onChange={event => setMotivo(event.target.value)} /></label>
      <ErrorEvidencia error={errorRetiro} />
      <button type="button" className="ti-btn primary" disabled={ocupado || bloqueado || !motivo.trim()} onClick={() => ejecutar(
        () => apiTiPr01.retirarEvidenciaOrden(...contexto, retiro.id, motivo.trim()), 'Fotografía retirada.', true
      )}>{ocupado ? 'Retirando…' : 'Confirmar retiro'}</button>
    </DialogoEvidencia>}
  </section>;
}

