import { useCallback, useEffect, useState } from 'react';
import { seguridadApi } from '../services/seguridadApi';
import { CONTROLES, BASES, FILTROS_INICIALES, fechaPeru, numero, tonoEstado } from './seguridad/config';
import { Icono } from './seguridad/Icono';
import { DetalleSeguridad } from './seguridad/DetalleSeguridad';
import { TablaSeguridad } from './seguridad/TablaSeguridad';
import { FormularioSeguridad } from './seguridad/FormularioSeguridad';
import { FormularioLlaves } from './seguridad/FormularioLlaves';
import './seguridad/seguridad.css';

function useLectura(cargar) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: '' });
  useEffect(() => {
    const abortador = new AbortController();
    let activo = true;
    async function ejecutar() {
      setEstado({ datos: null, cargando: true, error: '' });
      try {
        const datos = await cargar(abortador.signal);
        if (activo) setEstado({ datos, cargando: false, error: '' });
      } catch (error) {
        if (activo && error.name !== 'AbortError') setEstado({ datos: null, cargando: false, error: error.message });
      }
    }
    ejecutar();
    return () => { activo = false; abortador.abort(); };
  }, [cargar]);
  return estado;
}

function Mensaje({ estado, reintentar }) {
  if (estado.cargando) return <div className="sp-loading" role="status"><span className="sp-spinner"/>Consultando registros…</div>;
  if (estado.error) return <div className="sp-error" role="alert"><Icono nombre="alert"/><div><strong>No se pudo cargar la información</strong><p>{estado.error}</p><button className="sp-btn" onClick={reintentar}>Volver a intentar</button></div></div>;
  return null;
}

function Resumen({ estado, abrir, reintentar }) {
  const datos = estado.datos;
  if (!datos) return <Mensaje estado={estado} reintentar={reintentar}/>;
  const control = tipo => datos.controles.find(c => c.id === tipo) || { pendientes: 0, anomalias: 0 };
  const indicadores = [
    { titulo: 'Registros', valor: datos.total, nota: 'En las bases y fechas seleccionadas', icono: 'grid', tono: 'blue' },
    { titulo: 'Vehículos en base', valor: control('vehiculos').pendientes, nota: 'Ingresos que siguen abiertos', icono: 'truck', tono: 'green', tipo: 'vehiculos' },
    { titulo: 'Personal en instalaciones', valor: control('personal').pendientes, nota: 'Ingresos pendientes de salida', icono: 'users', tono: 'teal', tipo: 'personal' },
    { titulo: 'Llaves por devolver', valor: control('llaves').pendientes, nota: 'Recojos pendientes de devolución', icono: 'key', tono: 'amber', tipo: 'llaves' },
  ];
  return <>
    <div className="sp-kpis">{indicadores.map(k => <article className={`sp-kpi sp-tone-${k.tono}`} key={k.titulo}>
      <div className="sp-kpi-top"><span>{k.titulo}</span><span className="sp-icon-tile"><Icono nombre={k.icono}/></span></div>
      <strong>{numero(k.valor)}</strong><p>{k.nota}</p>
    </article>)}</div>
    
    <div className="sp-summary-bottom">
      <article className="sp-panel"><div className="sp-panel-heading"><Icono nombre="route"/><h3>Rondas de supervisión</h3></div>
        <div className="sp-round-summary"><div><strong>{numero(control('rondas').total)}</strong><span>rondas registradas</span></div><div><strong className="sp-amber-text">{numero(control('rondas').anomalias)}</strong><span>con anomalías reportadas</span></div></div>
        <button className="sp-text-btn" onClick={() => abrir('rondas')}>Consultar rondas <Icono nombre="arrow" size={16}/></button>
      </article>
      <article className="sp-panel sp-info-panel"><span className="sp-icon-tile"><Icono nombre="shield" size={23}/></span><div><h3>Control de garitas y gestión desde el ERP</h3><p>Consulta los controles recibidos de TransReport y registra aquí Terceros, Activos y Llaves.</p><small>Los indicadores de pendientes muestran el estado actual de los registros incluidos en tus filtros.</small></div></article>
    </div>
  </>;
}

function Listado({ tipo, api, filtros, revision, abrirDetalle, reintentar, puedeEditar, onNuevo }) {
  const meta = CONTROLES.find(c => c.id === tipo);
  const [consulta, setConsulta] = useState({ busqueda: '', estado: '', pagina: 1 });
  const [texto, setTexto] = useState('');
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState('');
  const cargar = useCallback(signal => api.listado(tipo, { ...filtros, ...consulta }, signal), [api, tipo, filtros, consulta, revision]);
  const lectura = useLectura(cargar);
  const datos = lectura.datos;
  const paginas = Math.max(1, Math.ceil((datos?.total || 0) / (datos?.limite || 25)));
  async function exportar() {
    setExportando(true); setErrorExportar('');
    try { await api.exportar(tipo, { ...filtros, busqueda: consulta.busqueda, estado: consulta.estado }); }
    catch (e) { setErrorExportar(e.message); }
    finally { setExportando(false); }
  }
  return <div className="sp-panel sp-list-panel">
    <div className="sp-list-heading"><div><h3><Icono nombre={meta.icono}/>{meta.nombre}</h3><p>{datos ? `${numero(datos.total)} ${datos.total === 1 ? 'registro encontrado' : 'registros encontrados'}` : 'Consultando registros'}</p></div>
      <div className="sp-list-actions"><button type="button" className="sp-btn sp-btn-export" disabled={exportando || lectura.cargando} onClick={exportar}><Icono nombre="download" size={17}/>{exportando ? 'Preparando Excel…' : 'Exportar Excel'}</button>{puedeEditar && ['terceros', 'activos', 'llaves'].includes(tipo) && <button type="button" className="sp-btn sp-btn-primary" onClick={() => onNuevo(tipo)}>+ {tipo === 'terceros' ? 'Registrar ingreso' : tipo === 'llaves' ? 'Registrar recojo' : 'Registrar movimiento'}</button>}</div>
    </div>
    <form className="sp-list-filters" onSubmit={e => { e.preventDefault(); setConsulta(c => ({ ...c, busqueda: texto.trim(), pagina: 1 })); }}>
      <label className="sp-search"><span className="sp-sr-only">Buscar registros</span><Icono nombre="search" size={18}/><input value={texto} maxLength={100} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre, DNI, placa o estado…"/></label>
      <label className="sp-state-filter"><span className="sp-sr-only">Estado</span><select value={consulta.estado} onChange={e => { const valor = e.target.value; setConsulta(c => ({ ...c, estado: valor, pagina: 1 })); }}>
        <option value="">Todos los estados</option>{[...new Set([...(datos?.estados || []), ...(consulta.estado ? [consulta.estado] : [])])].map(estado => <option key={estado}>{estado}</option>)}
      </select></label><button className="sp-btn" type="submit">Buscar</button>
    </form>
    {errorExportar && <div className="sp-error sp-error-compact" role="alert">{errorExportar}</div>}
    <Mensaje estado={lectura} reintentar={reintentar}/>
    {datos && (datos.registros.length ? <>
      <TablaSeguridad nombre={meta.nombre}>
        <table className="sp-table"><thead><tr><th>Registro en sistema <small>Hora de Perú</small></th><th>Base</th><th>{meta.referencia}</th><th>{meta.persona}</th><th>Identificación</th><th>Estado</th><th><span className="sp-sr-only">Acciones</span></th></tr></thead>
          <tbody>{datos.registros.map(r => <tr key={r.id}><td className="sp-date-cell">{fechaPeru(r.creado_en)}<small>#{r.id.slice(0, 8).toUpperCase()}</small></td><td><span className="sp-base-label">{r.base}</span></td><td className="sp-reference">{r.referencia || '—'}</td><td>{r.persona || '—'}</td><td>{r.documento || '—'}</td><td><span className={`sp-badge sp-badge-${tonoEstado(r.estado)}`}>{r.estado || 'Registrado'}</span></td><td><button className="sp-detail-btn" onClick={() => abrirDetalle({ tipo, id: r.id })}><Icono nombre="eye" size={16}/>Ver detalle</button></td></tr>)}</tbody>
        </table>
      </TablaSeguridad>
      <div className="sp-pagination"><span>Mostrando {(consulta.pagina - 1) * datos.limite + 1}–{Math.min(consulta.pagina * datos.limite, datos.total)} de {numero(datos.total)}</span><div><button className="sp-btn" disabled={consulta.pagina <= 1} onClick={() => setConsulta(c => ({ ...c, pagina: c.pagina - 1 }))}>Anterior</button><span>Página {consulta.pagina} de {paginas}</span><button className="sp-btn" disabled={consulta.pagina >= paginas} onClick={() => setConsulta(c => ({ ...c, pagina: c.pagina + 1 }))}>Siguiente</button></div></div>
    </> : <div className="sp-empty"><span className="sp-icon-tile"><Icono nombre="search" size={25}/></span><h4>No encontramos registros</h4><p>Prueba otra base, amplía las fechas o cambia la búsqueda.</p>{consulta.pagina > 1 && <button className="sp-btn" onClick={() => setConsulta(c => ({ ...c, pagina: 1 }))}>Ir a la primera página</button>}</div>)}
  </div>;
}

export function SeguridadPatrimonial({ api = seguridadApi, puedeEditar = false, tipo: tipoExterno, onTipoChange }) {
  const [tipoInterno, setTipoInterno] = useState('resumen');
  const tipo = tipoExterno ?? tipoInterno;
  const setTipo = onTipoChange ?? setTipoInterno;
  const [borrador, setBorrador] = useState(FILTROS_INICIALES);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [revision, setRevision] = useState(0);
  const [detalle, setDetalle] = useState(null);
  const [errorFiltro, setErrorFiltro] = useState('');
  const [formulario, setFormulario] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const cargar = useCallback(signal => api.resumen(filtros, signal), [api, filtros, revision]);
  const resumen = useLectura(cargar);
  const refrescar = () => setRevision(r => r + 1);
  function aplicar(e) {
    e.preventDefault();
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) { setErrorFiltro('La fecha inicial no puede superar la fecha final.'); return; }
    setErrorFiltro(''); setFiltros({ ...borrador });
  }
  return <section className="sp-module" aria-label="Seguridad Patrimonial">
    <header className="sp-page-heading"><div><div className="sp-eyebrow"><span/>SEGURIDAD · CONTROL OPERATIVO</div><h2>Seguridad Patrimonial</h2><p>El control de tus bases, en un solo lugar.</p></div><button className="sp-btn" onClick={refrescar} disabled={resumen.cargando}><Icono nombre="refresh" size={17}/>Actualizar</button></header>
    {mensaje && <div className="sp-success" role="status"><Icono nombre="check" size={19}/><span>{mensaje}</span><button className="sp-icon-button" aria-label="Cerrar aviso" onClick={() => setMensaje('')}><Icono nombre="close" size={16}/></button></div>}
    <form className="sp-global-filters" onSubmit={aplicar}>
      <label><span>Base operativa</span><select value={borrador.base} onChange={e => setBorrador(b => ({ ...b, base: e.target.value }))}><option value="">Todas las bases</option>{BASES.map(base => <option key={base}>{base}</option>)}</select></label>
      <label><span>Registro desde</span><input type="date" value={borrador.desde} max={borrador.hasta || undefined} onChange={e => setBorrador(b => ({ ...b, desde: e.target.value }))}/></label>
      <label><span>Registro hasta</span><input type="date" value={borrador.hasta} min={borrador.desde || undefined} onChange={e => setBorrador(b => ({ ...b, hasta: e.target.value }))}/></label>
      <button className="sp-btn sp-btn-primary" type="submit">Aplicar filtros</button>
      {(borrador.base || borrador.desde || borrador.hasta || filtros.base || filtros.desde || filtros.hasta) && <button className="sp-text-btn" type="button" onClick={() => { setBorrador(FILTROS_INICIALES); setFiltros(FILTROS_INICIALES); setErrorFiltro(''); }}>Limpiar</button>}
      <div className="sp-filter-caption"><Icono nombre="calendar" size={14}/><span>Fechas de registro en el sistema · Hora de Perú</span></div>
    </form>
    {errorFiltro && <p className="sp-error" role="alert">{errorFiltro}</p>}
    <div className="sp-filter-status"><span className="sp-status-dot"/>{filtros.base || 'Todas las bases'}<span className="sp-separator">/</span>{filtros.desde || filtros.hasta ? `${filtros.desde || 'Inicio'} → ${filtros.hasta || 'Hoy'}` : 'Todos los registros'}<span className="sp-status-right">Información compartida con TransReport</span></div>
    {tipo === 'resumen' ? <Resumen estado={resumen} abrir={setTipo} reintentar={refrescar}/> : <Listado key={`${tipo}:${JSON.stringify(filtros)}`} tipo={tipo} api={api} filtros={filtros} revision={revision} abrirDetalle={setDetalle} reintentar={refrescar} puedeEditar={puedeEditar} onNuevo={control => { setMensaje(''); setFormulario({ tipo: control }); }}/>}
    {detalle && <DetalleSeguridad key={`${detalle.tipo}:${detalle.id}`} api={api} seleccion={detalle} onCerrar={() => setDetalle(null)} puedeEditar={puedeEditar} onOperacion={registro => { setDetalle(null); setMensaje(''); setFormulario({ tipo: registro.tipo, registro }); }}/>}
    {formulario && (() => { const Formulario = formulario.tipo === 'llaves' ? FormularioLlaves : FormularioSeguridad; return <Formulario api={api} tipo={formulario.tipo} baseInicial={filtros.base} registro={formulario.registro} onCancelar={() => { setFormulario(null); if (formulario.registro) setDetalle({ tipo: formulario.tipo, id: formulario.registro.id }); }} onGuardado={seleccion => { setFormulario(null); setMensaje(formulario.registro ? formulario.tipo === 'terceros' ? 'Salida registrada correctamente.' : formulario.tipo === 'llaves' ? 'Devolución registrada correctamente.' : 'Retorno registrado correctamente.' : formulario.tipo === 'terceros' ? 'Ingreso de terceros registrado correctamente.' : formulario.tipo === 'llaves' ? 'Recojo de llaves registrado correctamente.' : 'Movimiento de activos registrado correctamente.'); refrescar(); setDetalle(seleccion); }}/>; })()}
  </section>;
}
