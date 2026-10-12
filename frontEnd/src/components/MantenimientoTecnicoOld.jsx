import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

export function MantenimientoTecnico({ permisos }) {
  const [mantenimientos, setMantenimientos] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('fecha');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const formatDMY = (dateObj) => {
    if (!dateObj) return null;
    const isoStr = dateObj.toISOString().split('T')[0];
    const parts = isoStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    placa: '',
    fecha_ejecutada: (() => {
      const tzOffset = (new Date()).getTimezoneOffset() * 60000;
      return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    })(),
    frecuencia_dias: 180,
    dvr: 'OK',
    copiloto: 'OK',
    radio_base: 'OK',
    handy: 'OK',
    camara_interna: 'OK',
    camara_externa: 'OK',
    camara_retroceso: 'OK',
    sensores_retroceso: 'OK',
    sensores_delanteros: 'OK',
    sistema_adas: 'OK'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mants, vehsResponse] = await Promise.all([
        api.getMantenimientos(),
        api.getVehiculos(1, 10000)
      ]);
      setMantenimientos(mants);
      setVehiculos(vehsResponse.data || []);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    api.downloadExcel();
    toast.success('Descargando reporte...');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.placa) return toast.error('Selecciona una placa');
    try {
      toast.loading('Registrando mantenimiento...', { id: 'save-mant' });
      await api.createMantenimiento(formData);
      toast.success('Mantenimiento registrado', { id: 'save-mant' });
      setShowModal(false);
      loadData();
    } catch (error) {
      toast.error('Error al registrar', { id: 'save-mant' });
    }
  };

  const renderStatus = (val) => {
    return (
      <span style={{
        padding: '0.2rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: '500',
        backgroundColor: val === 'OK' ? '#e7f9f1' : val === 'N/A' ? '#eef0f5' : '#fdeae8',
        color: val === 'OK' ? '#0e9f6e' : val === 'N/A' ? '#6b7280' : '#dc3b2a'
      }}>
        {val}
      </span>
    );
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando mantenimientos...</div>;

  return (
    <div className="erp-module-page erp-maintenance-page" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Mantenimiento de Equipos Tecnológicos</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Gestión profunda de DVR, ADAS, Sensores y Cámaras</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {(!permisos || permisos.editar !== false) && (
            <button 
              onClick={() => setShowModal(true)}
              style={{ padding: '0.5rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '500' }}>
              + Registrar Mantenimiento
            </button>
          )}
          <button 
            onClick={handleDownloadExcel}
            style={{ padding: '0.5rem 1rem', background: '#0e9f6e', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📊</span> Descargar Excel a Jefe
          </button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: '#9ca3af' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por placa..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', outline: 'none', width: '300px' }}
          />
          <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Ordenar por:</span>
          <select 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', outline: 'none' }}
          >
            <option value="fecha">Fecha Ejecutada</option>
            <option value="placa">Placa (A-Z)</option>
          </select>
        </div>

        <table style={{ minWidth: '1500px', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ textAlign: 'center' }}>
              <th colSpan="8" style={{ borderRight: '1px solid white', backgroundColor: '#101b33', color: 'white', padding: '0.75rem' }}>DATOS</th>
              <th colSpan="3" style={{ borderRight: '1px solid white', backgroundColor: '#db8b0b', color: 'white', padding: '0.75rem' }}>PROGRAMADO</th>
              <th colSpan="11" style={{ backgroundColor: '#0e9f6e', color: 'white', padding: '0.75rem' }}>EJECUTADO</th>
            </tr>
            <tr style={{ backgroundColor: '#e7f9f1', color: '#0e9f6e' }}>
              <th>N°</th>
              <th>Tipo Vehículo</th>
              <th>Placa</th>
              <th>Marca Tracto</th>
              <th>Modelo Tracto</th>
              <th>Año Fab.</th>
              <th>Operación</th>
              <th>Cliente</th>
              <th>Fecha Ult Mant.</th>
              <th>Frecuencia</th>
              <th>Fecha Prox Mant.</th>
              <th>DVR</th>
              <th>Copiloto</th>
              <th>Radio Base</th>
              <th>Handy</th>
              <th>Cám. Interna</th>
              <th>Cám. Externa</th>
              <th>Cám. Retroceso</th>
              <th>Sens. Retroceso</th>
              <th>Sens. Delanteros</th>
              <th>ADAS</th>
              <th>Fecha Ejecutada</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let filtered = mantenimientos.filter(m => (m.placa || '').toLowerCase().includes((searchTerm || '').toLowerCase()));
              filtered.sort((a, b) => {
                if (sortBy === 'placa') {
                  return (a.placa || '').localeCompare(b.placa || '');
                } else {
                  let dA = new Date(a.fecha_ejecutada || 0).getTime();
                  let dB = new Date(b.fecha_ejecutada || 0).getTime();
                  if (isNaN(dA)) dA = 0;
                  if (isNaN(dB)) dB = 0;
                  return dB - dA;
                }
              });

              const paginatedData = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
              const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

              if (filtered.length === 0) {
                return <tr><td colSpan="22" style={{textAlign: 'center', padding: '2rem'}}>No hay mantenimientos registrados</td></tr>;
              }

              return (
                <>
                  {paginatedData.map((m, i) => {
                    const vehiculo = vehiculos.find(v => v.placa === m.placa) || {};
                let f = null;
                let fp = null;
                if (m.fecha_ejecutada) {
                  try {
                    const parsedF = new Date(m.fecha_ejecutada);
                    if (!isNaN(parsedF.getTime())) {
                      f = parsedF;
                      fp = new Date(f);
                      fp.setDate(fp.getDate() + (m.frecuencia_dias || 180));
                    }
                  } catch(e) {}
                }
                
                return (
                  <tr key={m.id}>
                    <td>{i + 1}</td>
                    <td>{vehiculo.tipo_vehiculo || '-'}</td>
                    <td style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{m.placa}</td>
                    <td>{vehiculo.marca_tracto || '-'}</td>
                    <td>{vehiculo.modelo_tracto || '-'}</td>
                    <td>{vehiculo.anio_fabricacion || '-'}</td>
                    <td>{vehiculo.operacion || '-'}</td>
                    <td>{vehiculo.cliente || '-'}</td>
                    <td>{f ? formatDMY(f) : <span style={{color: '#9ca3af'}}>Sin registro</span>}</td>
                    <td>{m.frecuencia_dias === 180 ? 'Semestral' : `${m.frecuencia_dias}d`}</td>
                    <td style={{ color: '#2458e8', fontWeight: '500' }}>{fp ? formatDMY(fp) : <span style={{color: '#9ca3af'}}>-</span>}</td>
                    <td>{renderStatus(m.dvr)}</td>
                    <td>{renderStatus(m.copiloto)}</td>
                    <td>{renderStatus(m.radio_base)}</td>
                    <td>{renderStatus(m.handy)}</td>
                    <td>{renderStatus(m.camara_interna)}</td>
                    <td>{renderStatus(m.camara_externa)}</td>
                    <td>{renderStatus(m.camara_retroceso)}</td>
                    <td>{renderStatus(m.sensores_retroceso)}</td>
                    <td>{renderStatus(m.sensores_delanteros)}</td>
                    <td>{renderStatus(m.sistema_adas)}</td>
                    <td>{f ? formatDMY(f) : <span style={{color: '#9ca3af'}}>-</span>}</td>
                  </tr>
                );
              })}
              {totalPages > 1 && (
                <tr>
                  <td colSpan="22" style={{ padding: '1rem', backgroundColor: 'var(--bg-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem', cursor: currentPage===1?'not-allowed':'pointer', backgroundColor: 'var(--card-bg)' }}>Ant</button>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem', cursor: currentPage===totalPages?'not-allowed':'pointer', backgroundColor: 'var(--card-bg)' }}>Sig</button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          );
        })()}
        </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ backgroundColor: 'var(--card-bg)', padding: '2rem', borderRadius: '0.5rem', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Registrar Mantenimiento Técnico</h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Placa</label>
                  <select 
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e5ed' }}
                    value={formData.placa} 
                    onChange={e => setFormData({...formData, placa: e.target.value})}
                    required
                  >
                    <option value="">-- Seleccionar Vehículo --</option>
                    {vehiculos.map(v => <option key={v.placa} value={v.placa}>{v.placa} ({v.programa})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Fecha Ejecutada</label>
                  <input type="date" required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e5ed' }} value={formData.fecha_ejecutada} onChange={e => setFormData({...formData, fecha_ejecutada: e.target.value})} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Frecuencia (días)</label>
                  <input type="number" required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e5ed' }} value={formData.frecuencia_dias} onChange={e => setFormData({...formData, frecuencia_dias: parseInt(e.target.value)})} />
                </div>
              </div>

              <h4 style={{ fontWeight: 'bold', marginBottom: '1rem', color: 'var(--accent-color)' }}>Checklist de Equipos</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: 'var(--bg-color)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                {['dvr', 'copiloto', 'radio_base', 'handy', 'camara_interna', 'camara_externa', 'camara_retroceso', 'sensores_retroceso', 'sensores_delanteros', 'sistema_adas'].map(key => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                    <select 
                      value={formData[key]}
                      onChange={e => setFormData({...formData, [key]: e.target.value})}
                      style={{ padding: '0.25rem', borderRadius: '0.375rem', border: '1px solid #e2e5ed' }}
                    >
                      <option value="OK">OK</option>
                      <option value="FALLO">FALLO</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.5rem 1rem' }}>Cancelar</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '0.375rem' }}>Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
