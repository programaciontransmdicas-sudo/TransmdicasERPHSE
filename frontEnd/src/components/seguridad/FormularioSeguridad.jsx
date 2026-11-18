import { useEffect, useRef, useState } from 'react';
import { BASES, fechaPeru, numero } from './config';
import { Icono } from './Icono';
import { BuscadorMaestro } from './BuscadorMaestro';
import { nuevoId, nuevaLinea, separarSeries, validarBienes, devueltos, seriesDevueltas, recogerRetorno, ahoraPeru } from './bienesFormulario';

const DOCUMENTOS = ['Vale de Salida de Almacén', 'Documento de Salida', 'Vale de Salida de Implementación', 'Vale de Salida de EPP', 'HSE-F-167 Registro de Equipos de Seguridad o Emergencia', 'Guía de Remisión Remitente', 'Boleta de Salida de Unidades', 'Factura', 'Correo de autorización'];
const AREAS_TERCEROS = ['Operaciones', 'HSE', 'GTH', 'Contabilidad', 'SIG', 'Administración', 'Mantenimiento', 'Log'];
const AREAS_ACTIVOS = ['Mantenimiento', 'HSE', 'Administración', 'Logística', 'Operaciones'];

function Campo({ nombre, titulo, datos, cambiar, tipo = 'text', opciones, obligatorio = true, ayuda, grande, ...props }) {
  const id = `sp-form-${nombre}`;
  const comunes = { id, name: nombre, value: datos[nombre] || '', onChange: e => cambiar(nombre, e.target.value), required: obligatorio, ...props };
  return <label htmlFor={id} className={`sp-form-field ${grande ? 'sp-field-wide' : ''}`}><span>{titulo}{obligatorio && <span className="sp-required"> *</span>}</span>
    {opciones ? <select {...comunes}><option value="">Selecciona una opción</option>{opciones.map(opcion => <option key={opcion}>{opcion}</option>)}</select>
      : tipo === 'textarea' ? <textarea {...comunes} rows={3} maxLength={10000}/> : <input {...comunes} type={tipo} maxLength={tipo === 'text' ? 10000 : undefined}/>}
    {ayuda && <small>{ayuda}</small>}
  </label>;
}

function Bienes({ lineas, setLineas }) {
  const cambiar = (id, clave, valor) => setLineas(actuales => actuales.map(b => b.id === id ? { ...b, [clave]: valor } : b));
  return <section className="sp-form-section"><div className="sp-form-section-title"><div><h4>Bienes del movimiento</h4><p>Agrega cada tipo de bien y sus series, si corresponde.</p></div><button type="button" className="sp-btn" disabled={lineas.length >= 500} onClick={() => setLineas(l => [...l, nuevaLinea()])}>+ Agregar bien</button></div>
    <div className="sp-goods-editor">{lineas.map((bien, i) => <fieldset className="sp-good-editor" key={bien.id}><legend>Bien {i + 1}</legend>
      <div className="sp-good-editor-heading"><strong>Descripción y cantidad</strong><button type="button" className="sp-text-btn" disabled={lineas.length === 1} onClick={() => setLineas(l => l.filter(b => b.id !== bien.id))}>Quitar bien</button></div>
      <div className="sp-form-grid"><label className="sp-form-field sp-good-description" htmlFor={`bien-${bien.id}`}><span>Descripción del bien <span className="sp-required">*</span></span><input id={`bien-${bien.id}`} value={bien.descripcion} maxLength={10000} required onChange={e => cambiar(bien.id, 'descripcion', e.target.value)}/></label>
        <label className="sp-form-field" htmlFor={`cantidad-${bien.id}`}><span>Cantidad <span className="sp-required">*</span></span><input id={`cantidad-${bien.id}`} type="number" min={1} max={1000000} step={1} value={bien.cantidad} required onChange={e => cambiar(bien.id, 'cantidad', e.target.value)}/></label>
        <label className="sp-form-field sp-field-wide" htmlFor={`series-${bien.id}`}><span>Series / identificaciones</span><textarea id={`series-${bien.id}`} value={bien.seriesTexto} maxLength={128000} rows={3} placeholder="Una serie por línea. Deja vacío para bienes sin serie." onChange={e => cambiar(bien.id, 'seriesTexto', e.target.value)}/></label>
      </div><div className="sp-series-summary"><span>{numero(separarSeries(bien.seriesTexto).length)} series ingresadas</span><button type="button" className="sp-text-btn" disabled={!separarSeries(bien.seriesTexto).length} onClick={() => cambiar(bien.id, 'cantidad', separarSeries(bien.seriesTexto).length)}>Usar cantidad de series</button></div>
    </fieldset>)}</div>
  </section>;
}

function RetornoBienes({ registro, seleccion, setSeleccion }) {
  function todos() {
    const siguiente = {};
    for (const bien of registro.bienes || []) {
      const saldo = Number(bien.cantidad) - devueltos(registro, bien);
      if (saldo > 0) siguiente[bien.id] = bien.series?.length ? { series: bien.series.filter(s => !seriesDevueltas(registro, bien).has(s)) } : { cantidad: saldo };
    }
    setSeleccion(siguiente);
  }
  return <section className="sp-form-section"><div className="sp-form-section-title"><div><h4>Bienes recibidos</h4><p>Selecciona únicamente lo que está retornando ahora.</p></div></div><div className="sp-return-actions"><button type="button" className="sp-btn" onClick={todos}>Seleccionar todo lo pendiente</button><button type="button" className="sp-text-btn" onClick={() => setSeleccion({})}>Limpiar selección</button></div>
    <div className="sp-goods-editor">{(registro.bienes || []).map(bien => {
      const saldo = Number(bien.cantidad) - devueltos(registro, bien);
      if (saldo <= 0) return null;
      return <fieldset className="sp-good-editor" key={bien.id}><legend>{bien.descripcion}</legend><p className="sp-pending-count">{numero(saldo)} pendientes de retorno</p>
        {bien.series?.length ? <div className="sp-return-series">{bien.series.filter(s => !seriesDevueltas(registro, bien).has(s)).map(serie => <label key={serie}><input type="checkbox" checked={(seleccion[bien.id]?.series || []).includes(serie)} onChange={e => {
          const marcadas = seleccion[bien.id]?.series || [];
          setSeleccion(s => ({ ...s, [bien.id]: { series: e.target.checked ? [...marcadas, serie] : marcadas.filter(v => v !== serie) } }));
        }}/><span>{serie}</span></label>)}</div> : <label className="sp-form-field" htmlFor={`recibido-${bien.id}`}><span>Cantidad recibida ahora</span><input id={`recibido-${bien.id}`} type="number" min={0} max={saldo} step={1} value={seleccion[bien.id]?.cantidad ?? 0} onChange={e => { const valor = e.target.value; setSeleccion(s => ({ ...s, [bien.id]: { cantidad: valor } })); }}/></label>}
      </fieldset>;
    })}</div>
  </section>;
}

function inicializar(tipo, base, registro) {
  const ahora = ahoraPeru();
  if (registro) return tipo === 'terceros' ? { salida: ahora, observaciones: '' } : { retorno: ahora, recibe: '', documentoRetorno: registro.datos.numero || '', observaciones: '' };
  return tipo === 'terceros'
    ? { id: nuevoId(), base, fechaIngreso: ahora.slice(0, 10), responsableSolicitud: '', nombre: '', dni: '', fechaSalida: ahora.slice(0, 10), empresa: '', responsableSitio: '', area: '', horaIngreso: ahora.slice(11), motivo: '' }
    : { id: nuevoId(), base, fecha: ahora, movimiento: '', nombre: '', area: '', motivo: '', documento: '', numero: '', autoriza: '', retorna: '', fechaPrevista: '', agente: '', observaciones: '' };
}

export function FormularioSeguridad({ api, tipo, baseInicial = '', registro, onCancelar, onGuardado }) {
  const dialogo = useRef(null), entradaArchivo = useRef(null);
  const [datos, setDatos] = useState(() => inicializar(tipo, baseInicial, registro));
  const originales = useRef(datos);
  const [lineas, setLineas] = useState(() => [nuevaLinea()]);
  const [seleccion, setSeleccion] = useState({});
  const [archivo, setArchivo] = useState(null);
  const [clave] = useState(nuevoId);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState(null);
  const cierre = Boolean(registro), terceros = tipo === 'terceros';
  const titulo = cierre ? terceros ? 'Registrar salida de terceros' : 'Registrar retorno de activos' : terceros ? 'Registrar ingreso de terceros' : 'Registrar movimiento de activos';
  const boton = cierre ? terceros ? 'Guardar salida' : 'Guardar retorno' : terceros ? 'Guardar ingreso' : 'Guardar movimiento';
  useEffect(() => {
    const previo = document.activeElement;
    if (!dialogo.current.open) dialogo.current.showModal();
    return () => { if (previo instanceof HTMLElement) previo.focus(); };
  }, []);
  function cambiar(nombre, valor) {
    setDatos(anterior => {
      const nuevo = { ...anterior, [nombre]: valor };
      if (nombre === 'movimiento' && valor === 'Ingreso') { nuevo.retorna = 'No'; nuevo.fechaPrevista = ''; }
      if (nombre === 'retorna' && valor === 'No') nuevo.fechaPrevista = '';
      return nuevo;
    });
  }
  function cancelar() {
    if (ocupado) return;
    if (pendiente && !window.confirm('El envío todavía no se confirmó. Puedes reintentarlo conservando estos datos. ¿Quieres cerrar el formulario de todas formas?')) return;
    const modificado = JSON.stringify(datos) !== JSON.stringify(originales.current) || archivo || lineas.length > 1 || lineas.some(b => b.descripcion || b.seriesTexto || Number(b.cantidad) !== 1) || Object.keys(seleccion).length > 0;
    if (!pendiente && modificado && !window.confirm('¿Quieres cerrar el formulario y descartar los datos que aún no guardaste?')) return;
    onCancelar();
  }
  function elegirArchivo(e) {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) { setError('El archivo admite hasta 5 MB.'); e.target.value = ''; setArchivo(null); return; }
    setError(''); setArchivo(file);
  }
  function preparar() {
    const entrada = { ...datos };
    if (cierre) {
      entrada.revision = registro.revision;
      if (!terceros) entrada.seleccion = recogerRetorno(registro.datos, seleccion);
      return entrada;
    }
    if (terceros) {
      if (entrada.fechaSalida < entrada.fechaIngreso) throw new Error('La fecha prevista de salida no puede ser anterior al ingreso.');
      const nombres = entrada.nombre.replaceAll('/', '\n').split('\n').map(n => n.trim()).filter(Boolean);
      const dnis = entrada.dni.match(/\b\d{8}\b/g) || [];
      if (!dnis.length || entrada.dni.replace(/\b\d{8}\b/g, '').replace(/[\s/,;-]+/g, '') || new Set(dnis).size !== dnis.length) throw new Error('Indica DNI de ocho dígitos, sin duplicados.');
      if (nombres.length !== dnis.length) throw new Error('Indica un nombre y un DNI por persona, en el mismo orden.');
    } else {
      entrada.bienes = validarBienes(lineas);
      if (!archivo) throw new Error('Adjunta el documento firmado, guía o factura del movimiento.');
      if (entrada.movimiento === 'Salida' && entrada.retorna === 'Sí' && entrada.fechaPrevista && entrada.fechaPrevista < entrada.fecha.slice(0, 10)) throw new Error('La fecha prevista de retorno no puede ser anterior al movimiento.');
    }
    return entrada;
  }
  async function guardar(e) {
    e.preventDefault();
    if (ocupado) return;
    setError('');
    let envio;
    try { envio = pendiente || { datos: preparar(), archivo }; } catch (err) { setError(err.message); return; }
    setOcupado(true);
    try {
      const resultado = cierre ? await api.cerrar(tipo, registro.id, envio.datos, clave) : await api.crear(tipo, envio.datos, envio.archivo, clave);
      onGuardado({ tipo, id: resultado.id });
    } catch (err) {
      setError(err.message);
      if (!err.status || err.status >= 500) setPendiente(envio);
      else setPendiente(null);
    } finally { setOcupado(false); }
  }
  const buscarPersonal = (nombre, titulo, grande = false) => <BuscadorMaestro
    api={api} tipo="personal" titulo={titulo} valor={datos[nombre]} grande={grande}
    onCambiar={valor => cambiar(nombre, valor)}
    onElegir={persona => cambiar(nombre, persona.nombre_completo)} />;
  const comun = { datos, cambiar };
  return <dialog ref={dialogo} className="sp-detail-dialog sp-form-dialog" onCancel={e => { e.preventDefault(); cancelar(); }} aria-labelledby="sp-form-title">
    <form className="sp-detail-shell sp-form-shell" onSubmit={guardar}>
      <header className="sp-detail-header"><span className="sp-control-icon"><Icono nombre={terceros ? 'badge' : 'box'} size={24}/></span><div><span className="sp-eyebrow">SEGURIDAD PATRIMONIAL · ERP</span><h3 id="sp-form-title">{titulo}</h3><p>{cierre ? `${registro.base} · Registro #${registro.id.slice(0, 8).toUpperCase()}` : 'Completa los datos del registro.'}</p></div><button type="button" className="sp-icon-button" disabled={ocupado} onClick={cancelar} aria-label="Cerrar formulario"><Icono nombre="close"/></button></header>
      <div className="sp-detail-body sp-form-body">
        {pendiente && <div className="sp-form-notice" role="status"><strong>Falta confirmar el envío.</strong><p>Conservamos los datos para reintentar el mismo registro sin duplicarlo.</p></div>}
        {error && <div className="sp-error sp-form-error" role="alert">{error}</div>}
        <fieldset disabled={ocupado || Boolean(pendiente)} className="sp-form-content">
          {cierre ? <><div className="sp-form-record"><strong>{registro.datos.nombre || registro.datos.numero}</strong><span>{terceros ? registro.datos.empresa : `Documento: ${registro.datos.numero}`} · {fechaPeru(registro.datos.fecha)}</span></div><div className="sp-form-grid">
            {terceros ? <Campo {...comun} nombre="salida" titulo="Fecha y hora de salida real" tipo="datetime-local"/> : <><Campo {...comun} nombre="retorno" titulo="Fecha y hora de retorno" tipo="datetime-local"/>{buscarPersonal('recibe', 'Agente que recibe y verifica')}<Campo {...comun} nombre="documentoRetorno" titulo="Documento con el que se autorizó la salida" grande/></>}
            <Campo {...comun} nombre="observaciones" titulo="Observaciones" tipo="textarea" obligatorio={false} grande/>
          </div>{!terceros && <RetornoBienes registro={registro.datos} seleccion={seleccion} setSeleccion={setSeleccion}/>}</>
            : <><section className="sp-form-section sp-form-first"><h4>{terceros ? 'Datos del ingreso' : 'Datos del movimiento'}</h4><div className="sp-form-grid">
              <Campo {...comun} nombre="base" titulo="Base operativa" opciones={BASES}/>
              {terceros ? <>{buscarPersonal('responsableSolicitud', 'Responsable de la solicitud')}<Campo {...comun} nombre="fechaIngreso" titulo="Fecha de ingreso" tipo="date"/><Campo {...comun} nombre="horaIngreso" titulo="Hora de ingreso" tipo="time"/><Campo {...comun} nombre="fechaSalida" titulo="Fecha prevista de salida" tipo="date" min={datos.fechaIngreso}/><Campo {...comun} nombre="empresa" titulo="Empresa tercera"/>
                <Campo {...comun} nombre="nombre" titulo="Apellidos y nombres de terceros" tipo="textarea" ayuda="Una persona por línea, en el mismo orden que sus DNI."/><Campo {...comun} nombre="dni" titulo="DNI de terceros" tipo="textarea" ayuda="Un DNI de ocho dígitos por persona."/>
                {buscarPersonal('responsableSitio', 'Responsable en sitio')}<Campo {...comun} nombre="area" titulo="Área / Operación" opciones={AREAS_TERCEROS} obligatorio={false}/><Campo {...comun} nombre="motivo" titulo="Motivo del ingreso" tipo="textarea" grande/>
              </> : <><Campo {...comun} nombre="fecha" titulo="Fecha y hora del movimiento" tipo="datetime-local"/><Campo {...comun} nombre="movimiento" titulo="Movimiento" opciones={['Ingreso', 'Salida']}/>{buscarPersonal('nombre', 'Persona que ingresa / retira el bien')}<Campo {...comun} nombre="area" titulo="Área responsable" opciones={AREAS_ACTIVOS}/>{buscarPersonal('agente', 'Agente que verifica y registra')}<Campo {...comun} nombre="motivo" titulo="Motivo del movimiento" tipo="textarea" grande/></>}
            </div></section>
            {!terceros && <><section className="sp-form-section"><h4>Autorización y retorno</h4><div className="sp-form-grid"><Campo {...comun} nombre="documento" titulo="Documento de sustento" opciones={DOCUMENTOS}/><Campo {...comun} nombre="numero" titulo="Número de documento"/>{buscarPersonal('autoriza', 'Jefe que autoriza / responsable de recepción', true)}{datos.movimiento === 'Salida' && <><Campo {...comun} nombre="retorna" titulo="¿Debe retornar?" opciones={['Sí', 'No']}/>{datos.retorna === 'Sí' && <Campo {...comun} nombre="fechaPrevista" titulo="Fecha prevista de retorno" tipo="date" obligatorio={false} min={datos.fecha.slice(0, 10)}/>}</>}</div></section><Bienes lineas={lineas} setLineas={setLineas}/></>}
            <section className="sp-form-section"><h4>{terceros ? 'SCTR' : 'Sustento del movimiento'}</h4><label className="sp-upload-field" htmlFor="sp-form-adjunto"><Icono nombre="file" size={25}/><strong>{terceros ? 'Subir SCTR' : 'Adjuntar documento firmado / guía / factura'}{!terceros && ' *'}</strong><span>{terceros ? 'PDF o Word · Un archivo · Hasta 5 MB' : 'JPG, PNG, WebP o PDF · Un archivo · Hasta 5 MB'}</span><input id="sp-form-adjunto" type="file" ref={entradaArchivo} accept={terceros ? '.pdf,.doc,.docx' : '.jpg,.jpeg,.png,.webp,.pdf'} onChange={elegirArchivo} required={!terceros && !archivo}/></label>
              {archivo && <div className="sp-selected-file"><Icono nombre="file" size={17}/><span>{archivo.name} · {numero(Math.ceil(archivo.size / 1024))} KB</span><button type="button" className="sp-text-btn" onClick={() => { setArchivo(null); if (entradaArchivo.current) entradaArchivo.current.value = ''; }}>Quitar</button></div>}
              {terceros && <div className="sp-form-guidance"><strong>Condiciones para el ingreso</strong><p>El personal tercero debe conocer el RISST y las normas de control de acceso, contar con sus EPP y declarar sus bienes en garita. Para trabajos operativos debe contar con SCTR.</p></div>}
            </section>{!terceros && <section className="sp-form-section"><Campo {...comun} nombre="observaciones" titulo="Observaciones adicionales" tipo="textarea" obligatorio={false}/></section>}
          </>}
        </fieldset>
      </div>
      <footer className="sp-detail-footer sp-form-footer"><span>Los campos con * son obligatorios. Fechas en hora de Perú.</span><div><button className="sp-btn" type="button" disabled={ocupado} onClick={cancelar}>Cancelar</button><button className="sp-btn sp-btn-primary" type="submit" disabled={ocupado}>{ocupado ? <><span className="sp-spinner"/>Guardando…</> : pendiente ? 'Reintentar confirmación' : boton}</button></div></footer>
    </form>
  </dialog>;
}
