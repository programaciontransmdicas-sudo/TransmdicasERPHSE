import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ConfigTiposEntregas({ alCambiar }) {
  const [tipos, setTipos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function cargar() {
    try { const r = await api.listarTiposEquipo(true); setTipos(r.tipos || []); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { cargar(); }, []);
  async function agregar(e) {
    e.preventDefault(); if (ocupado) return;
    setOcupado(true); setError('');
    try { await api.crearTipoEquipo(nombre); setNombre(''); await cargar(); await alCambiar?.(); }
    catch (e) { setError(e.message); }
    finally { setOcupado(false); }
  }
  async function alternar(item) {
    if (ocupado) return;
    setOcupado(true); setError('');
    try { await api.cambiarEstadoTipoEquipo(item.id, !item.activo); await cargar(); await alCambiar?.(); }
    catch (e) { setError(e.message); }
    finally { setOcupado(false); }
  }
  return <div className="erp-module-page"><h2>Configuraciones</h2><p style={{color: "var(--text-secondary)"}}>Administra las opciones disponibles en el ERP.</p><section className="card" style={{padding:'1.25rem',marginBottom:'1.5rem'}} aria-label="Configuración de dispositivos">
    <div style={{display:'flex',justifyContent:'space-between',gap:'.8rem',alignItems:'center',flexWrap:'wrap'}}>
      <div><h3 style={{margin:'0 0 .25rem'}}>Dispositivos de Entregas TI</h3><p style={{margin:0,color:'var(--text-secondary)'}}>Agrega o desactiva opciones sin modificar las entregas registradas.</p></div>
    </div>
    <form onSubmit={agregar} style={{display:'flex',gap:'.5rem',marginTop:'1rem',flexWrap:'wrap'}}>
      <label htmlFor="nuevo-tipo-equipo" className="sr-only">Nombre del dispositivo</label>
      <input id="nuevo-tipo-equipo" value={nombre} onChange={e=>setNombre(e.target.value)} maxLength={100} required placeholder="Nombre del dispositivo" style={{flex:'1 1 220px',padding:'.6rem'}} />
      <button type="submit" className="ui-button ui-button-primary" disabled={ocupado}>Agregar dispositivo</button>
    </form>
    {error && <p role="alert" style={{color:'#b42318'}}>{error}</p>}
    <div style={{display:'grid',gap:'.5rem',marginTop:'1rem'}}>
      {tipos.map(tipo=><div key={tipo.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.75rem',borderBottom:'1px solid var(--border-color)',padding:'.55rem 0',flexWrap:'wrap'}}>
        <span><strong>{tipo.valor}</strong> · {tipo.activo ? 'Activo' : 'Inactivo'}</span>
        <button type="button" className="ui-button ui-button-secondary" disabled={ocupado || (tipo.valor === 'PULSERA' && tipo.activo)} onClick={()=>alternar(tipo)}>{tipo.activo ? 'Desactivar' : 'Activar'}</button>
      </div>)}
    </div>
    <small>PULSERA permanece activa porque se utiliza en los reportes de pulseras.</small>
  </section></div>;
}
