import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { apiTiPr01 } from '../../services/api';

const ChecklistContext = createContext(null);


export function ChecklistOrden({ programaId, orden, bloqueado = false, children }) {
  const [datos, setDatos] = useState(null);
  const [ediciones, setEdiciones] = useState({});
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoTodos, setGuardandoTodos] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [revision, setRevision] = useState(0);
  const candado = useRef(false);
  useEffect(() => {
    let activo = true;
    const controller = new AbortController();
    Promise.resolve().then(async () => {
      if (!activo) return;
      setCargando(true); setError(null);
      try {
        const resultado = await apiTiPr01.listarChecklistOrden(programaId, orden.programacion_id, orden.id, controller.signal);
        if (activo) { setDatos(resultado); setEdiciones({}); }
      } catch (e) {
        if (activo && e.name !== 'AbortError') setError(e.message);
      } finally { if (activo) setCargando(false); }
    });
    return () => { activo = false; controller.abort(); };
  }, [programaId, orden.id, orden.programacion_id, orden.estado, revision]);
  const cambiar = (actividad, cambios) => setEdiciones(prev => ({ ...prev,
    [actividad.id]: { estado: actividad.estado, observacion: actividad.observacion || '', ...prev[actividad.id], ...cambios }
  }));
  const guardar = async (actividad, cambios) => {
    if (candado.current || bloqueado) return false;
    candado.current = true;
    setGuardando(true); setError(null); setMensaje('');
    const cuerpo = cambios || ediciones[actividad.id];
    try {
      const resultado = await apiTiPr01.editarActividadChecklist(programaId, orden.programacion_id, orden.id,
        actividad.id, cuerpo);
      setDatos(prev => ({ ...prev, apartados: prev.apartados.map(p => ({ ...p,
        actividades: p.actividades.map(a => a.id === actividad.id ? { ...a, ...resultado.actividad } : a)
      })) }));
      setEdiciones(prev => {
        const siguientes = { ...prev };
        delete siguientes[actividad.id];
        return siguientes;
      });
      setMensaje({ detalleId: datos.apartados.find(p => p.actividades.some(a => a.id === actividad.id))?.detalle_id, texto: 'Cambios guardados.' });
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { candado.current = false; setGuardando(false); }
  };
  const seleccionarTodos = async detalleId => {
    if (candado.current || guardandoTodos || bloqueado || !datos?.editable || orden.estado !== 'ABIERTA') return;
    const actividades = datos.apartados.find(p => p.detalle_id === detalleId)?.actividades || [];
    const pendientes = actividades.filter(a => a.estado !== 'REALIZADO');
    setGuardandoTodos(true);
    try {
      for (const actividad of pendientes) {
        const observacion = ediciones[actividad.id]?.observacion ?? actividad.observacion ?? '';
        const guardada = await guardar(actividad, { estado: 'REALIZADO', observacion });
        if (!guardada) return;
      }
      setMensaje({ detalleId, texto: 'Todas las actividades están marcadas como realizadas.' });
    } finally { setGuardandoTodos(false); }
  };
  const editable = datos?.editable && orden.estado === 'ABIERTA';
  return <ChecklistContext.Provider value={{ datos, ediciones, error, cargando, guardando: guardando || guardandoTodos,
    seleccionarTodos, mensaje, bloqueado, editable, cambiar, guardar, actualizar: () => setRevision(n => n + 1) }}>
    {children}
  </ChecklistContext.Provider>;
}

export function ChecklistEquipo({ detalle }) {
  const contexto = useContext(ChecklistContext);
  const [motivoAbierto, setMotivoAbierto] = useState({});
  if (
  !contexto ||
  ![
    'CAMARAS',
    'COPILOTO',
    'RADIO_BASE',
    'GPS'
  ].includes(detalle.tipo_equipo)
) {
  return null;
}
  const { datos, ediciones, error, cargando, guardando, mensaje, bloqueado,
    editable, cambiar, guardar, seleccionarTodos, actualizar } = contexto;
  const actividades = datos?.apartados?.find(a => a.detalle_id === detalle.id)?.actividades || [];
  const realizadas = actividades.filter(a => a.estado === 'REALIZADO').length;
  return <section className="ti-checklist" aria-label={`Checklist de ${detalle.tipo_equipo}`}>
    <div className="ti-checklist-heading">
      <b>Checklist de actividades</b>
      {!cargando && actividades.length > 0 && <div className="ti-checklist-actions">
        <span>{realizadas} de {actividades.length} realizadas</span>
        {editable && <button type="button" className="ti-btn small" disabled={guardando || bloqueado || realizadas === actividades.length}
          onClick={() => seleccionarTodos(detalle.id)}>{guardando ? 'Guardando…' : 'Seleccionar todos'}</button>}
      </div>}
    </div>
    {error && <div className="ti-badbox" role="alert">{error}
      <button type="button" className="ti-btn small" disabled={guardando} onClick={actualizar}>Actualizar checklist</button>
    </div>}
    {cargando && <p role="status">Cargando actividades…</p>}
    {mensaje?.detalleId === detalle.id && <p className="ti-smalltxt" role="status">{mensaje.texto}</p>}
    {!cargando && !error && !actividades.length && <p className="ti-smalltxt">Este equipo no tiene actividades de checklist registradas.</p>}
    {!cargando && actividades.length > 0 && <>
      {['M1', 'M2', 'M3'].map(nivel => {
        const delNivel = actividades.filter(a => a.nivel_origen === nivel);
        if (!delNivel.length) return null;
        return <div className="ti-checklist-level" key={nivel}>
          <div className="ti-checklist-level-heading"><span className="ti-chip blue">{nivel}</span>
            <span>{delNivel.length} actividad{delNivel.length === 1 ? '' : 'es'}</span>
          </div>
          {delNivel.map(a => {
            const valor = ediciones[a.id] || { estado: a.estado, observacion: a.observacion || '' };
            const provisional = /^\[PROVISIONAL\]\s*/i.test(a.descripcion);
            const descripcion = a.descripcion.replace(/^\[PROVISIONAL\]\s*/i, '');
            const mostrarMotivo = motivoAbierto[a.id] || valor.estado === 'NO_APLICA' || (!editable && valor.observacion);
            return <div className="ti-checklist-item" key={a.id}>
              <div className="ti-checklist-row">
                <label className="ti-checklist-task">
                  <input type="checkbox" checked={valor.estado === 'REALIZADO'}
                    disabled={!editable || guardando || bloqueado}
                    onChange={e => guardar(a, { estado: e.target.checked ? 'REALIZADO' : 'PENDIENTE', observacion: valor.observacion })} />
                  <span>{descripcion}</span>
                </label>
                <div className="ti-checklist-actions">
                  {provisional && <span className="ti-checklist-provisional">Provisional</span>}
                  {valor.estado === 'NO_APLICA' && <span className="ti-chip grey">No aplica</span>}
                  {editable && <>
                    <button type="button" className="ti-checklist-link" disabled={guardando || bloqueado}
                      onClick={() => setMotivoAbierto(prev => ({ ...prev, [a.id]: !prev[a.id] }))}>
                      {motivoAbierto[a.id] ? 'Ocultar nota' : valor.observacion ? 'Ver nota' : 'Añadir nota'}
                    </button>
                    <button type="button" className="ti-checklist-link" disabled={guardando || bloqueado}
                      onClick={() => {
                        if (valor.estado !== 'NO_APLICA') setMotivoAbierto(prev => ({ ...prev, [a.id]: true }));
                        guardar(a, { estado: valor.estado === 'NO_APLICA' ? 'PENDIENTE' : 'NO_APLICA', observacion: valor.observacion });
                      }}>{valor.estado === 'NO_APLICA' ? 'Sí aplica' : 'No aplica'}</button>
                  </>}
                </div>
              </div>
              {mostrarMotivo && <div className="ti-checklist-note">
                {editable ? <>
                  <label className="ti-field"><span>{valor.estado === 'REALIZADO' ? 'Observación opcional' : 'Motivo o impedimento'}</span>
                    <textarea value={valor.observacion} maxLength={4000} rows={2} disabled={guardando || bloqueado}
                      placeholder={valor.estado === 'NO_APLICA' ? 'Indica por qué esta actividad no corresponde.' : 'Describe la observación o por qué quedó pendiente.'}
                      onChange={e => cambiar(a, { observacion: e.target.value })} />
                  </label>
                  <button type="button" className="ti-btn small" disabled={guardando || bloqueado || !ediciones[a.id]}
                    onClick={() => guardar(a)}>Guardar nota</button>
                </> : <p>{a.observacion}</p>}
              </div>}
            </div>;
          })}
        </div>;
      })}
      {editable && <p className="ti-smalltxt ti-checklist-help">Marca las tareas realizadas. Las casillas se guardan automáticamente.</p>}
    </>}
  </section>;
}
