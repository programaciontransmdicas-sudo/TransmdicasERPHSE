import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UiIcon } from './UiIcon';

export function DirectorioPersonal({ permisos }) {
  const [personal, setPersonal] = useState([]);
  const [inventarioTI, setInventarioTI] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [showModal, setShowModal] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [formData, setFormData] = useState({
    nombre_completo: '',
    dni: '',
    modalidad: '',
    area: '',
    cargo: '',
    estado: 'Activo'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [dataPersonal, dataEntregas] = await Promise.all([
        api.getPersonal(),
        api.getEntregas().catch(() => []) // Fallback in case IT module is empty or fails
      ]);
      setPersonal(Array.isArray(dataPersonal) ? dataPersonal : []);
      setInventarioTI(Array.isArray(dataEntregas) ? dataEntregas : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (person = null) => {
    if (person) {
      setEditingPersonal(person);
      setFormData({
        nombre_completo: person.nombre_completo || '',
        dni: person.dni || '',
        modalidad: person.modalidad || '',
        area: person.area || '',
        cargo: person.cargo || '',
        estado: person.estado || 'Activo'
      });
    } else {
      setEditingPersonal(null);
      setFormData({
        nombre_completo: '',
        dni: '',
        modalidad: '',
        area: '',
        cargo: '',
        estado: 'Activo'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingPersonal) {
        await api.updatePersonal(editingPersonal.id, formData);
      } else {
        await api.createPersonal(formData);
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      alert('Error guardando los datos del personal: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro?')) {
      try {
        await api.deletePersonal(id);
        loadData();
      } catch (error) {
        alert('Error eliminando: ' + error.message);
      }
    }
  };

  const filteredPersonal = personal.filter(p => 
    p?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p?.dni?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p?.cargo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p?.area?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="erp-module-page erp-personal-page">
      {/* Contenido Principal */}
      <div className="personal-main-content">
      <div className="module-page-header personal-page-header">
        <div>
          <h1>Directorio de personal</h1>
          <p>
            Gestión centralizada de colaboradores de la empresa.
          </p>
        </div>
        {(!permisos || permisos.editar !== false) && (
          <button 
            onClick={() => handleOpenModal()}
            className="ui-button ui-button-primary"
          >
            <UiIcon name="plus" size={17} /> Añadir colaborador
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="personal-search-card">
        <label className="ui-search-field personal-search-field">
          <UiIcon name="search" size={18} />
        <input 
          type="text" 
          placeholder="Buscar por nombre, DNI, cargo o área..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reset page on search
          }}
        />
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Cargando directorio...</div>
      ) : (
        <div className="table-container personal-table-card">
          <div className="personal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DNI</th>
                  <th>Nombres y apellidos</th>
                  <th>Cargo</th>
                  <th>Área</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const itemsPerPage = 8;
                  const indexOfLastItem = currentPage * itemsPerPage;
                  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                  const currentItems = filteredPersonal.slice(indexOfFirstItem, indexOfLastItem);
                  
                  return currentItems.map((p) => (
                  <tr 
                    key={p.id} 
                    onClick={() => setSelectedItem(p)}
                    className="personal-table-row"
                  >
                    <td className="personal-dni">{p.dni}</td>
                    <td className="personal-name">{p.nombre_completo}</td>
                    <td>{p.cargo || '-'}</td>
                    <td>{p.area || '-'}</td>
                    <td>
                      <span className={`directory-status ${p.estado === 'Activo' ? 'is-active' : 'is-inactive'}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="personal-actions-cell">
                      {(!permisos || permisos.editar !== false) && (
                        <div className="personal-row-actions">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenModal(p); }}
                            className="ui-icon-button"
                            title="Editar"
                            aria-label={`Editar ${p.nombre_completo}`}
                          >
                            <UiIcon name="edit" size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            className="ui-icon-button ui-icon-button-danger"
                            title="Eliminar"
                            aria-label={`Eliminar ${p.nombre_completo}`}
                          >
                            <UiIcon name="trash" size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ));
              })()}
                {filteredPersonal.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No se encontraron resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Controles de Paginación */}
          {(() => {
            const itemsPerPage = 8;
            const totalPages = Math.ceil(filteredPersonal.length / itemsPerPage);
            const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
            const indexOfLastItem = Math.min(currentPage * itemsPerPage, filteredPersonal.length);
            
            return (
              <div className="personal-pagination">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Mostrando {filteredPersonal.length > 0 ? indexOfFirstItem + 1 : 0} a {indexOfLastItem} de {filteredPersonal.length} registros
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="ui-button ui-button-secondary ui-button-compact"
                    disabled={currentPage === 1} 
                    onClick={() => setCurrentPage(prev => prev - 1)} 
                  >
                    Anterior
                  </button>
                  <button
                    className="ui-button ui-button-secondary ui-button-compact"
                    disabled={currentPage >= totalPages} 
                    onClick={() => setCurrentPage(prev => prev + 1)} 
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      </div>

      {/* Ficha Técnica Panel Lateral */}
      {selectedItem && (
        <div style={{
          width: '380px',
          backgroundColor: 'var(--bg-color)',
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.05)',
          animation: 'slideIn 0.3s ease-out forwards',
          zIndex: 10,
          margin: '-2rem -2rem -2rem 0'
        }}>
          <style>
            {`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}
          </style>
          
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)' }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>
              Ficha Técnica: Personal
            </h2>
            <button
              onClick={() => setSelectedItem(null)}
              className="ui-icon-button"
              aria-label="Cerrar ficha"
            >
              <UiIcon name="close" size={18} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '2rem', textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 1rem', fontWeight: 'bold' }}>
                {selectedItem.nombre_completo.charAt(0).toUpperCase()}
              </div>
              <h1 style={{ fontSize: '1.5rem', margin: 0, color: '#60a5fa' }}>
                {selectedItem.nombre_completo}
              </h1>
              <p style={{ color: '#9ca3af', margin: '0.5rem 0 0', fontWeight: 'bold' }}>
                DNI: {selectedItem.dni}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CARGO</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {selectedItem.cargo || 'Sin Cargo'}
                </div>
              </div>
              
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ÁREA / OPERACIÓN</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {selectedItem.area || 'Sin Área'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MODALIDAD</span>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {selectedItem.modalidad || 'N/A'}
                  </div>
                </div>
              </div>
              
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ESTADO ACTUAL</span>
                <div style={{ marginTop: '0.5rem' }}>
                  <span style={{ 
                    padding: '0.5rem 1rem', 
                    borderRadius: '9999px', 
                    fontSize: '0.875rem', 
                    fontWeight: 'bold',
                    backgroundColor: selectedItem.estado === 'Activo' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: selectedItem.estado === 'Activo' ? '#10b981' : '#ef4444'
                  }}>
                    {selectedItem.estado || 'N/A'}
                  </span>
                </div>
              </div>
              
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>INVENTARIO TI ASIGNADO</span>
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {inventarioTI.filter(item => item.dni === selectedItem.dni).length > 0 ? (
                    inventarioTI.filter(item => item.dni === selectedItem.dni).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>{item.equipo_tipo} {item.marca}</strong>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Serie: {item.serie || 'N/A'}</div>
                        </div>
                        <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {item.condicion || 'N/A'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      No tiene equipos asignados.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Formulario */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '600px', border: '1px solid var(--border-color)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>
                {editingPersonal ? 'Editar Personal' : 'Nuevo Personal'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="ui-icon-button"
                aria-label="Cerrar formulario"
              >
                <UiIcon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Nombres y Apellidos *</label>
                <input 
                  type="text" 
                  value={formData.nombre_completo}
                  onChange={e => setFormData({...formData, nombre_completo: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>DNI *</label>
                <input 
                  type="text" 
                  value={formData.dni}
                  onChange={e => setFormData({...formData, dni: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Cargo</label>
                <input 
                  type="text" 
                  value={formData.cargo}
                  onChange={e => setFormData({...formData, cargo: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Área / Operación</label>
                <input 
                  type="text" 
                  value={formData.area}
                  onChange={e => setFormData({...formData, area: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Modalidad</label>
                <input 
                  type="text" 
                  value={formData.modalidad}
                  onChange={e => setFormData({...formData, modalidad: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Estado</label>
                <select 
                  value={formData.estado}
                  onChange={e => setFormData({...formData, estado: e.target.value})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="ui-button ui-button-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ui-button ui-button-primary"
                >
                  Guardar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
