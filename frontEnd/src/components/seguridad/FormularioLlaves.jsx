import { useEffect, useRef, useState } from 'react';
import { BASES, fechaPeru } from './config';
import { Icono } from './Icono';
import { BuscadorMaestro } from './BuscadorMaestro';
import { nuevoId, ahoraPeru } from './bienesFormulario';

export function FormularioLlaves({ api, baseInicial = '', registro, onCancelar, onGuardado }) {
  const dialogo = useRef(null);
  const cierre = Boolean(registro);
  const [datos, setDatos] = useState(() => cierre
    ? { devolucionFecha: ahoraPeru(), recibe: '', observaciones: '' }
    : { id: nuevoId(), base: baseInicial, fecha: ahoraPeru(), nombre: '', cargo: '', placa: '', identificacion: '', agente: '', observaciones: '' });
  const originales = useRef(datos);
  const personaSeleccionada = useRef(null);
  const [clave] = useState(nuevoId);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState(null);
  useEffect(() => {
    const previo = document.activeElement;
    dialogo.current?.showModal();
    return () => { if (previo instanceof HTMLElement) previo.focus(); };
  }, []);
  function cambiar(e) { setDatos(d => ({ ...d, [e.target.name]: e.target.value })); }
  function buscarPersonal(nombre, titulo) {
    return <BuscadorMaestro api={api} tipo="personal" titulo={titulo} valor={datos[nombre]}
      onCambiar={valor => {
        const anterior = personaSeleccionada.current;
        setDatos(d => ({ ...d, [nombre]: valor,
          ...(nombre === 'nombre' && anterior && valor !== anterior.nombre && d.cargo === anterior.cargo ? { cargo: '' } : {}) }));
        if (nombre === 'nombre' && valor !== anterior?.nombre) personaSeleccionada.current = null;
      }}
      onElegir={persona => {
        if (nombre === 'nombre') personaSeleccionada.current = { nombre: persona.nombre_completo, cargo: persona.cargo || '' };
        setDatos(d => ({ ...d, [nombre]: persona.nombre_completo,
          ...(nombre === 'nombre' ? { cargo: persona.cargo || '' } : {}) }));
      }} />;
  }
  function buscarPlaca() {
    return <BuscadorMaestro api={api} tipo="vehiculos" titulo="Placa de la unidad" valor={datos.placa}
      onCambiar={placa => setDatos(d => ({ ...d, placa: placa.toUpperCase() }))}
      onElegir={unidad => setDatos(d => ({ ...d, placa: unidad.placa }))} />;
  }
  function cancelar() {
    if (ocupado) return;
    if (pendiente && !window.confirm('El envío no se confirmó. ¿Cerrar sin reintentar?')) return;
    if (!pendiente && JSON.stringify(datos) !== JSON.stringify(originales.current) && !window.confirm('¿Descartar los datos sin guardar?')) return;
    onCancelar();
  }
  async function guardar(e) {
    e.preventDefault();
    if (ocupado) return;
    setError('');
    const envio = pendiente || (cierre ? { ...datos, revision: registro.revision } : datos);
    setOcupado(true);
    try {
      const resultado = cierre
        ? await api.cerrar('llaves', registro.id, envio, clave)
        : await api.crear('llaves', envio, null, clave);
      onGuardado({ tipo: 'llaves', id: resultado.id });
    } catch (err) {
      setError(err.message);
      setPendiente(!err.status || err.status >= 500 ? envio : null);
    } finally { setOcupado(false); }
  }
  function campo(nombre, titulo, tipo = 'text', obligatorio = true) {
    return <label className="sp-form-field"><span>{titulo}{obligatorio && <span className="sp-required"> *</span>}</span>
      {tipo === 'textarea' ? <textarea name={nombre} value={datos[nombre]} onChange={cambiar} rows={3} maxLength={10000}/> :
        <input name={nombre} type={tipo} value={datos[nombre]} onChange={cambiar} required={obligatorio} maxLength={tipo === 'text' ? (nombre === 'placa' ? 20 : 10000) : undefined}/>}
    </label>;
  }
  return <dialog ref={dialogo} className="sp-detail-dialog sp-form-dialog" onCancel={e => { e.preventDefault(); cancelar(); }} aria-labelledby="sp-llaves-titulo">
    <form className="sp-detail-shell sp-form-shell" onSubmit={guardar}>
      <header className="sp-detail-header"><span className="sp-control-icon"><Icono nombre="key" size={24}/></span><div><span className="sp-eyebrow">SEGURIDAD PATRIMONIAL · ERP</span><h3 id="sp-llaves-titulo">{cierre ? 'Registrar devolución de llaves' : 'Registrar recojo de llaves'}</h3><p>{cierre ? `${registro.base} · ${registro.datos.placa}` : 'Completa los datos del recojo.'}</p></div><button type="button" className="sp-icon-button" disabled={ocupado} onClick={cancelar} aria-label="Cerrar formulario"><Icono nombre="close"/></button></header>
      <div className="sp-detail-body sp-form-body">
        {pendiente && <div className="sp-form-notice" role="status">Envío sin confirmar. Reintenta para evitar duplicados.</div>}
        {error && <div className="sp-error sp-form-error" role="alert">{error}</div>}
        <fieldset disabled={ocupado || Boolean(pendiente)} className="sp-form-content">
          {cierre && <div className="sp-form-record"><strong>{registro.datos.nombre} · {registro.datos.placa}</strong><span>Recojo: {fechaPeru(registro.datos.fecha)}</span></div>}
          <section className="sp-form-section sp-form-first"><div className="sp-form-grid">
            {cierre ? <>{campo('devolucionFecha', 'Fecha y hora de devolución', 'datetime-local')}{buscarPersonal('recibe', 'Agente que recibe')}</> : <>
              <label className="sp-form-field"><span>Base operativa <span className="sp-required">*</span></span><select name="base" value={datos.base} onChange={cambiar} required><option value="">Selecciona una base</option>{BASES.map(base => <option key={base}>{base}</option>)}</select></label>
              {campo('fecha', 'Fecha y hora del recojo', 'datetime-local')}{buscarPersonal('nombre', 'Apellidos y nombres de quien recoge')}{campo('cargo', 'Cargo')}{buscarPlaca()}{campo('identificacion', 'Identificación de la llave / juego', 'text', false)}{buscarPersonal('agente', 'Agente que entrega')}
            </>}
            {campo('observaciones', 'Observaciones', 'textarea', false)}
          </div></section>
        </fieldset>
      </div>
      <footer className="sp-detail-footer sp-form-footer"><span>Campos con * obligatorios · Hora de Perú</span><div><button className="sp-btn" type="button" disabled={ocupado} onClick={cancelar}>Cancelar</button><button className="sp-btn sp-btn-primary" disabled={ocupado} type="submit">{ocupado ? 'Guardando…' : pendiente ? 'Reintentar confirmación' : cierre ? 'Guardar devolución' : 'Guardar recojo'}</button></div></footer>
    </form>
  </dialog>;
}
