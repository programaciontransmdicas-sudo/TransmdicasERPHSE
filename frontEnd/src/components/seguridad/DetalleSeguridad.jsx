import { useEffect, useRef, useState } from 'react';
import { CONTROLES, etiqueta, fechaPeru, numero, tonoEstado } from './config';
import { Icono } from './Icono';
import { devueltos } from './bienesFormulario';

const OMITIDOS = new Set(['id', 'base', 'revision', 'estado', 'fotos', 'archivos', 'sctr', 'sustento', 'evidencias',
  'firmaIngreso', 'archivo', 'bienes', 'retornos', 'idMovimiento', 'vehiculoPlaca', 'clienteOperacionId', 'control_id',
  'movimiento_id', 'creado_en', 'actualizado_en', 'operacion_id']);

function mostrar(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) return fechaPeru(valor);
  if (Array.isArray(valor) && valor.every(x => typeof x !== 'object')) return valor.join(' · ') || '—';
  return String(valor);
}

function Campos({ datos }) {
  if (!datos || typeof datos !== 'object') return null;
  const entradas = Object.entries(datos).filter(([clave, valor]) => !OMITIDOS.has(clave) && !/hash|token|url|public_?id|cloudinary/i.test(clave)
    && valor !== undefined && valor !== null && valor !== '' && (!Array.isArray(valor) || valor.length));
  const planos = entradas.filter(([, v]) => typeof v !== 'object' || (Array.isArray(v) && v.every(x => typeof x !== 'object')));
  const grupos = entradas.filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  return <>
    <dl className="sp-detail-fields">{planos.map(([clave, valor]) => <div className={String(valor).length > 100 ? 'sp-field-wide' : ''} key={clave}><dt>{etiqueta(clave)}</dt><dd>{mostrar(valor)}</dd></div>)}</dl>
    {grupos.map(([clave, valor]) => <section className="sp-detail-subsection" key={clave}><h4>{etiqueta(clave)}</h4><Campos datos={valor}/></section>)}
  </>;
}

function Foto({ api, seleccion, archivo }) {
  const [imagen, setImagen] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let activo = true, url;
    const abortador = new AbortController();
    async function cargar() {
      setError(''); setImagen(null);
      try {
        const blob = await api.archivo(seleccion.tipo, seleccion.id, archivo.id, abortador.signal);
        if (!activo) return;
        if (!blob.type.startsWith('image/')) throw new Error('El archivo recibido no es una imagen.');
        url = URL.createObjectURL(blob);
        setImagen({ url, blob });
      } catch (e) { if (activo && e.name !== 'AbortError') setError(e.message); }
    }
    cargar();
    return () => { activo = false; abortador.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, seleccion.tipo, seleccion.id, archivo.id, revision]);
  return <figure className="sp-photo">
    {imagen ? <a href={imagen.url} target="_blank" rel="noreferrer" title={`Ampliar ${archivo.nombre}`}><img src={imagen.url} alt={archivo.vista || archivo.nombre} loading="lazy"/></a>
      : <div className="sp-photo-placeholder">{error ? <><Icono nombre="alert"/><span>{error}</span><button className="sp-btn" onClick={() => setRevision(r => r + 1)}>Reintentar</button></> : <span className="sp-spinner"/>}</div>}
    <figcaption><div><strong>{archivo.vista || archivo.nombre}</strong><span>{archivo.etapa ? `${archivo.etapa === 'INGRESO' ? 'Ingreso' : 'Salida'} · ` : ''}{numero(Math.ceil(archivo.bytes / 1024))} KB</span></div><button className="sp-icon-button" title={`Descargar ${archivo.nombre}`} aria-label={`Descargar ${archivo.nombre}`} disabled={!imagen} onClick={() => api.descargarBlob(imagen.blob, archivo.nombre)}><Icono nombre="download" size={17}/></button></figcaption>
  </figure>;
}

function Documento({ api, seleccion, archivo }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const activo = useRef(true);
  useEffect(() => { activo.current = true; return () => { activo.current = false; }; }, []);
  async function descargar() {
    setOcupado(true); setError('');
    try {
      const blob = await api.archivo(seleccion.tipo, seleccion.id, archivo.id);
      if (activo.current) api.descargarBlob(blob, archivo.nombre);
    } catch (e) { if (activo.current) setError(e.message); }
    finally { if (activo.current) setOcupado(false); }
  }
  return <div className="sp-document"><span className="sp-icon-tile"><Icono nombre="file"/></span><div><strong>{archivo.nombre}</strong><small>{archivo.formato?.toUpperCase()} · {numero(Math.ceil(archivo.bytes / 1024))} KB</small>{error && <p className="sp-amber-text" role="alert">{error}</p>}</div><button className="sp-btn" onClick={descargar} disabled={ocupado}><Icono nombre="download" size={16}/>{ocupado ? 'Descargando…' : 'Descargar'}</button></div>;
}

function Bienes({ bienes, registro }) {
  if (!bienes?.length) return null;
  return <section className="sp-detail-subsection"><h4>Bienes y números de serie</h4><div className="sp-goods-list">{bienes.map((bien, i) => <article key={bien.id || bien.bienId || i}><div><strong>{bien.descripcion || 'Bien registrado'}</strong><span>Cantidad: {numero(bien.cantidad)}</span></div>{registro?.movimiento === 'Salida' && registro?.retorna === 'Sí' && <p className="sp-muted">Recibidos: {numero(devueltos(registro, bien))} · Pendientes: {numero(Math.max(0, bien.cantidad - devueltos(registro, bien)))}</p>}{bien.series?.length > 0 && <details><summary>{numero(bien.series.length)} números de serie</summary><div className="sp-series">{bien.series.map((serie, j) => <code key={`${serie}:${j}`}>{serie}</code>)}</div></details>}</article>)}</div></section>;
}

export function DetalleSeguridad({ api, seleccion, onCerrar, puedeEditar = false, onOperacion }) {
  const dialogo = useRef(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pestana, setPestana] = useState('datos');
  const meta = CONTROLES.find(c => c.id === seleccion.tipo);
  useEffect(() => {
    const elemento = dialogo.current;
    const previo = document.activeElement;
    if (!elemento.open) elemento.showModal();
    return () => { if (previo instanceof HTMLElement) previo.focus(); };
  }, []);
  useEffect(() => {
    let activo = true;
    const abortador = new AbortController();
    async function cargar() {
      setDatos(null); setError('');
      try {
        const registro = await api.detalle(seleccion.tipo, seleccion.id, abortador.signal);
        if (activo) setDatos(registro);
      } catch (e) { if (activo && e.name !== 'AbortError') setError(e.message); }
    }
    cargar();
    return () => { activo = false; abortador.abort(); };
  }, [api, seleccion.tipo, seleccion.id, revision]);
  const archivos = datos?.archivos || [];
  const fotos = archivos.filter(a => a.mime?.startsWith('image/'));
  const documentos = archivos.filter(a => !a.mime?.startsWith('image/'));
  const movimientos = datos?.datos.movimientos;
  const campos = datos ? { ...datos.datos } : {};
  if (Array.isArray(campos.movimientos)) delete campos.movimientos;
  return <dialog className="sp-detail-dialog" ref={dialogo} onCancel={onCerrar} onClick={e => { if (e.target === dialogo.current) onCerrar(); }} aria-labelledby="sp-detail-title">
    <div className="sp-detail-shell">
      <header className="sp-detail-header"><span className="sp-control-icon"><Icono nombre={meta.icono} size={25}/></span><div><span className="sp-eyebrow">DETALLE DEL REGISTRO</span><h3 id="sp-detail-title">{meta.nombre}</h3><p>#{seleccion.id.slice(0, 8).toUpperCase()}{datos ? ` · ${datos.base}` : ''}</p></div><button className="sp-icon-button" onClick={onCerrar} aria-label="Cerrar detalle" autoFocus><Icono nombre="close"/></button></header>
      {datos && <nav className="sp-detail-tabs" aria-label="Información del registro">{[{ id: 'datos', nombre: 'Información', icono: 'file' }, { id: 'fotos', nombre: `Fotos (${fotos.length})`, icono: 'eye' }, { id: 'documentos', nombre: `Documentos (${documentos.length})`, icono: 'download' }].map(t => <button key={t.id} aria-current={pestana === t.id ? 'page' : undefined} className={pestana === t.id ? 'active' : ''} onClick={() => setPestana(t.id)}><Icono nombre={t.icono} size={16}/>{t.nombre}</button>)}</nav>}
      <div className="sp-detail-body">
        {!datos && !error && <div className="sp-loading" role="status"><span className="sp-spinner"/>Cargando detalle…</div>}
        {error && <div className="sp-error" role="alert"><div><p>{error}</p><button className="sp-btn" onClick={() => setRevision(r => r + 1)}>Reintentar</button></div></div>}
        {datos && pestana === 'datos' && <>
          <div className="sp-detail-meta"><span className={`sp-badge sp-badge-${tonoEstado(datos.datos.estado)}`}>{datos.datos.estado || 'Registrado'}</span><span>Registrado: {fechaPeru(datos.creado_en)}</span><span>Hora de Perú</span></div>
          {datos.datos.presentaAnomalias === 'Sí' && <div className="sp-anomaly"><Icono nombre="alert"/><div><strong>Se reportaron anomalías en esta ronda</strong><p>{datos.datos.anomalias || 'Revisa el detalle de la ronda.'}</p></div></div>}
          <Campos datos={campos}/>
          {Array.isArray(movimientos) && movimientos.length > 0 && <section className="sp-detail-subsection"><h4>Ingresos y salidas de la unidad</h4><div className="sp-timeline">{movimientos.map((m, i) => <article key={m.id || i}><div className="sp-timeline-dot"/><h5>{m.tipo === 'INGRESO' ? 'Ingreso' : 'Salida'} <span>{fechaPeru(m.fecha)}</span></h5><Campos datos={m}/></article>)}</div></section>}
          {datos.datos.firmaIngreso && <section className="sp-detail-subsection"><h4>Conformidad de ingreso</h4><span className="sp-badge sp-badge-green"><Icono nombre="check" size={14}/>Firma registrada</span><Campos datos={datos.datos.firmaIngreso}/></section>}
          <Bienes bienes={datos.datos.bienes} registro={datos.datos}/>
          {datos.datos.retornos?.length > 0 && <section className="sp-detail-subsection"><h4>Historial de retornos</h4>{datos.datos.retornos.map((r, i) => <article className="sp-return" key={r.id || i}><Campos datos={r}/><Bienes bienes={r.bienes}/></article>)}</section>}
        </>}
        {datos && pestana === 'fotos' && (fotos.length ? <div className="sp-photo-grid">{fotos.map(archivo => <Foto key={archivo.id} api={api} seleccion={seleccion} archivo={archivo}/>)}</div> : <div className="sp-empty"><Icono nombre="eye" size={30}/><h4>Sin imágenes adjuntas</h4><p>Este registro no tiene fotos o firmas guardadas.</p></div>)}
        {datos && pestana === 'documentos' && (documentos.length ? <div className="sp-document-list">{documentos.map(archivo => <Documento key={archivo.id} api={api} seleccion={seleccion} archivo={archivo}/>)}</div> : <div className="sp-empty"><Icono nombre="file" size={30}/><h4>Sin documentos adjuntos</h4><p>Los documentos PDF y Word se mostrarán aquí.</p></div>)}
      </div>
      <footer className="sp-detail-footer"><span>Seguridad Patrimonial · Gestión desde el ERP</span><div className="sp-list-actions">{datos && puedeEditar && ((seleccion.tipo === 'terceros' && datos.datos.estado === 'Registrado') || (seleccion.tipo === 'activos' && datos.datos.estado === 'Pendiente de retorno') || (seleccion.tipo === 'llaves' && datos.datos.estado === 'Fuera de garita')) && <button className="sp-btn sp-btn-primary" onClick={() => onOperacion(datos)}>{seleccion.tipo === 'terceros' ? 'Registrar salida' : seleccion.tipo === 'llaves' ? 'Registrar devolución' : 'Registrar retorno'}</button>}<button className="sp-btn" onClick={onCerrar}>Cerrar detalle</button></div></footer>
    </div>
  </dialog>;
}
