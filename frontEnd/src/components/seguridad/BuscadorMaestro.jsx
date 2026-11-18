import { useEffect, useId, useState } from 'react';
import { Icono } from './Icono';
import './buscadorMaestro.css';

// La escritura manual sigue disponible; el nombre y el cargo solo se completan al elegir.
export function BuscadorMaestro({ api, tipo, titulo, valor, onCambiar, onElegir, obligatorio = true, grande = false }) {
  const id = useId();
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState([]);
  const [estado, setEstado] = useState('');
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const texto = consulta.trim();
    if (texto.length < 2) { setResultados([]); setEstado(''); return; }
    const controller = new AbortController();
    let activo = true;
    const timer = setTimeout(async () => {
      setEstado('cargando');
      try {
        const filas = await api.buscarCatalogo(tipo, texto, controller.signal);
        if (activo) { setResultados(Array.isArray(filas) ? filas : []); setEstado('listo'); }
      } catch (error) {
        if (activo && error.name !== 'AbortError') { setResultados([]); setEstado('error'); }
      }
    }, 300);
    return () => { activo = false; clearTimeout(timer); controller.abort(); };
  }, [api, tipo, consulta]);

  return <div className={`sp-form-field sp-search-field ${grande ? 'sp-field-wide' : ''}`} onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false);
  }}>
    <label htmlFor={id} className="sp-search-label">{titulo}{obligatorio && <span className="sp-required"> *</span>}</label>
    <div className="sp-search-box">
      <Icono nombre="search" size={17} className="sp-search-icon" />
      <input id={id} className="sp-search-input" type="text" value={valor || ''} required={obligatorio} maxLength={tipo === 'vehiculos' ? 20 : 255}
        autoComplete="off" placeholder={tipo === 'personal' ? 'Buscar por nombre o DNI' : 'Buscar placa'}
        onFocus={() => setAbierto(true)} onKeyDown={e => { if (e.key === 'Escape' && abierto && consulta.trim().length >= 2) { e.preventDefault(); e.stopPropagation(); setAbierto(false); } }} onChange={e => {
          const texto = e.target.value;
          onCambiar(texto); setResultados([]); setEstado(''); setConsulta(texto); setAbierto(true);
        }} />
      {abierto && consulta.trim().length >= 2 && estado && <div className="sp-suggestions" aria-live="polite">
        {estado === 'cargando' && <p className="sp-suggestions-message">Buscando coincidencias…</p>}
        {estado === 'error' && <p className="sp-suggestions-message">No se pudo buscar. Puedes escribir los datos manualmente.</p>}
        {estado === 'listo' && resultados.length === 0 && <p className="sp-suggestions-message">Sin coincidencias. Puedes escribir los datos manualmente.</p>}
        {estado === 'listo' && resultados.length > 0 && <>
          <div className="sp-suggestions-heading">{tipo === 'personal' ? 'PERSONAL ENCONTRADO' : 'UNIDADES ENCONTRADAS'}</div>
          <ul className="sp-suggestions-list">
            {resultados.map(item => <li key={tipo === 'personal' ? item.id : item.placa}>
              <button type="button" className="sp-suggestion" onClick={() => {
                onElegir(item); setConsulta(''); setResultados([]); setAbierto(false);
              }}>
                <span className="sp-suggestion-icon"><Icono nombre={tipo === 'personal' ? 'users' : 'truck'} size={17} /></span>
                <span className="sp-suggestion-copy">
                  <strong>{tipo === 'personal' ? item.nombre_completo : item.placa}</strong>
                  {tipo === 'personal' && <span className="sp-suggestion-meta">DNI: {item.dni || 'No registrado'}{item.cargo ? ` · ${item.cargo}` : ''}</span>}
                </span>
              </button>
            </li>)}
          </ul>
        </>}
      </div>}
    </div>
    <small>{tipo === 'personal' ? 'Selecciona una persona o escribe el nombre manualmente.' : 'Selecciona una unidad o escribe la placa manualmente.'}</small>
  </div>;
}
