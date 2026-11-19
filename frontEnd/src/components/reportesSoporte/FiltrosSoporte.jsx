import { useMemo, useState } from 'react';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import './filtrosSoporte.css';
import { filtrarSoporte } from './filtrarSoporte';
export function useFiltrosSoporte(tipo, registros) {
  const [filtros,setFiltros] = useState({texto:'',estado:'',cliente:'',operacion:'',categoria:'',desde:'',hasta:''});
  const opciones=useMemo(()=>({estados:[...new Set(registros.map(r=>r.estado).filter(Boolean))].sort(),clientes:[...new Set(registros.map(r=>r.cliente).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es')),operaciones:[...new Set(registros.filter(r=>!filtros.cliente||r.cliente===filtros.cliente).map(r=>r.operacion).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es')),categorias:[...new Set(registros.map(r=>r.tipo_solicitud).filter(Boolean))].sort()}),[registros,filtros.cliente]);
  const filtrar = lista => filtrarSoporte(tipo, lista, filtros);
  return {filtros,setFiltros,opciones,filtrar};
}
export function FiltrosSoporte({tipo, control, registros, alLimpiar}) {
  const [exportando,setExportando]=useState(false); const {filtros,setFiltros,opciones}=control;
  const cambiar=(k,v)=>setFiltros(prev=>({...prev,[k]:v}));
  const incorrecto=!!(filtros.desde && filtros.hasta && filtros.desde>filtros.hasta);
  async function exportar(){if(!registros.length || incorrecto || exportando)return;setExportando(true);try{await api.exportarSoporteExcel(tipo,registros.map(r=>r.id));}catch(e){toast.error(e.message || 'No se pudo descargar el reporte.');}finally{setExportando(false);}}
  return <section className="soporte-filtros" aria-label="Filtros de reportes">
    <div className="soporte-filtros-cabecera"><strong>Filtrar registros</strong><span>{registros.length} resultado(s)</span></div>
    <div className="soporte-filtros-grilla">
      <label>Buscar<input type="search" value={filtros.texto} placeholder="Número, nombre, placa o descripción" onChange={e=>cambiar('texto',e.target.value)} /></label>
      <label>Estado<select value={filtros.estado} onChange={e=>cambiar('estado',e.target.value)}><option value="">Todos</option>{opciones.estados.map(v=><option key={v}>{v}</option>)}</select></label>
      {opciones.clientes.length > 0 && <label>Cliente<select value={filtros.cliente} onChange={e=>setFiltros(prev=>({...prev,cliente:e.target.value,operacion:''}))}><option value="">Todos</option>{opciones.clientes.map(v=><option key={v}>{v}</option>)}</select></label>}
      {tipo==='tickets' && <label>Categoría<select value={filtros.categoria} onChange={e=>cambiar('categoria',e.target.value)}><option value="">Todas</option>{opciones.categorias.map(v=><option key={v}>{v}</option>)}</select></label>}
      <label>Operación<select value={filtros.operacion} onChange={e=>cambiar('operacion',e.target.value)}><option value="">Todas</option>{opciones.operaciones.map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Creado desde<input type="date" value={filtros.desde} onChange={e=>cambiar('desde',e.target.value)} /></label>
      <label>Creado hasta<input type="date" value={filtros.hasta} onChange={e=>cambiar('hasta',e.target.value)} /></label>
    </div>
    {incorrecto && <p role="alert">La fecha inicial no puede ser posterior a la fecha final.</p>}
    <div className="soporte-filtros-acciones"><button type="button" className="ui-button ui-button-secondary" onClick={()=>{setFiltros({texto:'',estado:'',cliente:'',operacion:'',categoria:'',desde:'',hasta:''});alLimpiar?.();}}>Limpiar filtros</button><button type="button" className="ui-button ui-button-primary" disabled={incorrecto||exportando||!registros.length} onClick={exportar}>{exportando?'Generando…':'Descargar Excel'}</button></div>
  </section>;
}
