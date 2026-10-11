import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { api, BASE_API_URL } from '../services/api';
import { Document, Page, pdfjs } from 'react-pdf';
import { UiIcon } from './UiIcon';

// Configurar el worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function EntregasTIDashboard({ vista, permisos, usuario }) {
  const rolUsuario = String(usuario?.rol || '').toLowerCase();
  const isAdmin = rolUsuario === 'admin' || rolUsuario === 'administrador';
  const canEdit = permisos?.editar === true;
  const canBulkUpload = isAdmin;
  const canCrearPersonal =
    isAdmin || usuario?.permisos?.personal?.editar === true;
  const [entregas, setEntregas] = useState([]);
  const [personalList, setPersonalList] = useState([]);
  const [clientesOperaciones, setClientesOperaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewPersonal, setIsNewPersonal] = useState(false);
  const [dniSearchStatus, setDniSearchStatus] = useState(null); // null | 'loading' | 'found' | 'not_found'
  const [formData, setFormData] = useState({
    fecha: '', encargado: '', nombre: '', dni: '', cargo: '', operacion: '', cliente_operacion_id: '', condicion: 'NUEVO', equipo_tipo: '', marca: '', modelo: '', serie: '', laptop: '', mouse: '', cargador: '', motivo: '', observaciones: '', precio: '', tipo_movimiento: vista || 'Entrega'
  });
  const [actaFile, setActaFile] = useState(null);
  const [docUrlViewer, setDocUrlViewer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'fecha', direction: 'desc' });
  const fileInputRef = useRef(null);

  const itemsPerPage = 8;

  const encargadoAutomatico = (() => {
    const username = String(usuario?.username || '').trim();

    const personaSesion = personalList.find(
      persona =>
        String(persona?.dni || '').trim() === username
    );

    return (
      personaSesion?.nombre_completo ||
      usuario?.nombre_completo ||
      username
    );
  })();

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getEntregas();
      setEntregas(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonal = async () => {
    if (!isAdmin && usuario?.permisos?.personal?.ver !== true) return;

    try {
      const data = await api.getPersonal();
      setPersonalList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando personal', error);
    }
  };

  const loadOpciones = async () => {
    try {
      const data =
        await api.getOpcionesEntregas();

      setClientesOperaciones(
        Array.isArray(data?.clientesOperaciones)
          ? data.clientesOperaciones
          : []
      );
    } catch (error) {
      console.error(
        'Error cargando clientes y operaciones',
        error
      );
      toast.error(
        error.message ||
        'No se pudieron cargar los clientes y operaciones'
      );
    }
  };

  useEffect(() => {
    loadData();
    loadPersonal();
    loadOpciones();
  }, []);

  const handleFileUpload = async (e) => {
    if (!canBulkUpload) { toast.error('Solo el administrador puede cargar archivos Excel'); e.target.value = ''; return; }
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      toast.loading('Revisando Excel sin guardar...', { id: 'upload-excel' });
      const revision = await api.uploadEntregasExcel(file, vista);
      toast.dismiss('upload-excel');

      if (revision.nuevos === 0) { toast.success('Todos los registros ya están reconocidos. No se agregó nada.'); return; }

      const aceptar = window.confirm(`Se revisaron ${revision.total} registros.\nYa reconocidos: ${revision.omitidos}.\nPor agregar: ${revision.nuevos}.\n\n¿Confirmas la importación de ${vista}?`);
      if (!aceptar) return;

      toast.loading('Importando Excel...', { id: 'upload-excel' });
      const resultado = await api.uploadEntregasExcel(file, vista, true, revision.firma);
      toast.success(resultado.message, { id: 'upload-excel' });
      await loadData();
    } catch (error) {
      toast.error('Error al importar Excel: ' + error.message, { id: 'upload-excel' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sortedData = [...entregas].sort((a, b) => {
    let aValue = a[sortConfig.key] || '';
    let bValue = b[sortConfig.key] || '';

    if (sortConfig.key === 'fecha') {
      aValue = a.fecha ? new Date(a.fecha).getTime() : 0;
      bValue = b.fecha ? new Date(b.fecha).getTime() : 0;
    } else {
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredData = sortedData.filter(e => {
    const matchesSearch = (e.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.dni || '').includes(searchTerm) ||
      (e.equipo_tipo || '').toLowerCase().includes(searchTerm.toLowerCase());
    const itemTipo = e.tipo_movimiento || 'Entrega';
    const matchesVista = !vista || itemTipo === vista;
    const matchesCategoria = !categoriaFilter || (e.equipo_tipo || '').toUpperCase().includes(categoriaFilter.toUpperCase());

    return matchesSearch && matchesVista && matchesCategoria;
  });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getLocalDateString = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
  };

  const openCreateModal = () => {
    setFormData({
      fecha: getLocalDateString(), encargado: encargadoAutomatico, nombre: '', dni: '', cargo: '', operacion: '', cliente_operacion_id: '', condicion: 'NUEVO', equipo_tipo: '', marca: '', modelo: '', serie: '', laptop: '', mouse: '', cargador: '', motivo: '', observaciones: '', precio: '', tipo_movimiento: vista || 'Entrega'
    });
    setActaFile(null);
    setIsEditing(false);
    setIsNewPersonal(false);
    setDniSearchStatus(null);
    setShowFormModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      ...item,
      fecha:
        item.fecha
          ? item.fecha.split('T')[0]
          : '',
      cliente_operacion_id:
        item.cliente_operacion_id
          ? String(item.cliente_operacion_id)
          : '',
      tipo_movimiento:
        item.tipo_movimiento || 'Entrega'
    });
    setActaFile(null);
    setIsEditing(true);
    setIsNewPersonal(false);
    setDniSearchStatus('found'); // Assuming existing records have valid personnel
    setShowFormModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSearchDNI = async () => {
    const dni = String(formData.dni || '').trim();

    if (!/^[0-9]{1,20}$/.test(dni)) {
      toast.error('Ingrese el DNI, solo con números');
      return;
    }

    setDniSearchStatus('loading');
    setIsNewPersonal(false);

    try {
      const person = await api.getPersonalParaEntrega(
        dni,
        vista || formData.tipo_movimiento || 'Entrega'
      );

      setFormData(prev => {
        const area =
          String(person?.area || '')
            .trim()
            .toLowerCase();

        const coincidencias =
          clientesOperaciones.filter(
            opcion =>
              String(opcion.operacion || '')
                .trim()
                .toLowerCase() === area
          );

        const opcion =
          coincidencias.length === 1
            ? coincidencias[0]
            : null;

        return {
          ...prev,
          dni,
          nombre:
            person?.nombre_completo || '',
          cargo:
            person?.cargo || '',
          operacion:
            opcion?.operacion || '',
          cliente_operacion_id:
            opcion
              ? String(opcion.id)
              : ''
        };
      });

      if (person) {
        setDniSearchStatus('found');
        toast.success('¡Personal encontrado!');
      } else {
        setIsNewPersonal(canCrearPersonal);
        setDniSearchStatus('not_found');

        toast.error(
          canCrearPersonal
            ? 'DNI no registrado. Complete los datos para agregarlo.'
            : 'El trabajador no está registrado. Solicita su registro a TI o al administrador.'
        );
      }
    } catch (error) {
      setDniSearchStatus('error');
      toast.error(error.message || 'No se pudo buscar al trabajador');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.dni || !formData.nombre) {
      toast.error('El DNI y Nombre del receptor son obligatorios');
      return;
    }

    if (!formData.cliente_operacion_id) {
      toast.error(
        'Seleccione el cliente y la operación'
      );
      return;
    }

    try {
      toast.loading('Guardando...', { id: 'save-entrega' });
      if (!canCrearPersonal) {
        const persona = await api.getPersonalParaEntrega(
          String(formData.dni || '').trim(),
          vista || formData.tipo_movimiento || 'Entrega'
        );

        if (!persona) {
          throw new Error(
            'El trabajador debe estar registrado en Personal. Solicita su registro a TI o al administrador.'
          );
        }
      }

      // Auto-create personnel if it's new
      if (isNewPersonal && canCrearPersonal) {
        try {
          await api.createPersonal({
            dni: formData.dni,
            nombre_completo: formData.nombre,
            cargo: formData.cargo || '',
            area: formData.operacion || '',
            estado: 'Activo'
          });
          // Refresh personal list quietly
          loadPersonal();
        } catch (perErr) {
          console.warn('El personal ya existía o hubo error al auto-crearlo', perErr);
        }
      }

      const dataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
          dataToSend.append(key, formData[key]);
        }
      });

      if (!isEditing) {
        dataToSend.set('encargado', encargadoAutomatico);
      }

      dataToSend.set('dni', String(formData.dni || '').trim());
      if (actaFile) dataToSend.append('acta', actaFile);

      if (isEditing) {
        await api.updateEntrega(formData.id, dataToSend);
        toast.success('Registro actualizado correctamente', { id: 'save-entrega' });
      } else {
        await api.createEntrega(dataToSend);
        toast.success('Registro guardado correctamente', { id: 'save-entrega' });
      }
      setShowFormModal(false);
      loadData();
    } catch (error) {
      toast.error('Error guardando los datos: ' + error.message, { id: 'save-entrega' });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) { toast.error('Solo el Administrador puede eliminar registros'); return; }
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) {
      toast.loading('Eliminando...', { id: 'delete' });
      try {
        await api.deleteEntrega(id);
        toast.success('Registro eliminado', { id: 'delete' });
        loadData();
      } catch (error) {
        toast.error('Error eliminando: ' + error.message, { id: 'delete' });
      }
    }
  };

  const handleDownloadViewer = async (e) => {
    e.preventDefault();
    try {
      toast.loading('Preparando descarga...', { id: 'download' });
      const response = await fetch(docUrlViewer);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (docUrlViewer.toLowerCase().includes('.pdf') || docUrlViewer.includes('/raw/')) ? 'Acta_Documento.pdf' : 'Acta_Documento.jpg';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Descarga iniciada', { id: 'download' });
    } catch (error) {
      toast.dismiss('download');
      window.open(docUrlViewer, '_blank');
    }
  };

  return (
    <div className="erp-module-page erp-inventory-page">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {vista === 'Devolución' ? 'Devoluciones TI' : 'Entregas TI'}
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {vista === 'Devolución' ? 'Control de equipos retornados por los usuarios.' : 'Control de inventario y actas de equipos entregados.'}
          </p>
        </div>
        <div className="ui-toolbar-actions">
          <button
            onClick={() => setShowExportModal(true)}
            className="ui-button ui-button-secondary">
            <UiIcon name="download" /> Exportar Excel
          </button>
          {canBulkUpload && (
            <>
              <input
                type="file"
                accept=".xlsx, .xls"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="ui-button ui-button-secondary">
                <UiIcon name="upload" /> {uploading ? 'Subiendo...' : 'Cargar Excel'}
              </button>
            </>
          )}
          {canEdit && (
            <button
              onClick={openCreateModal}
              className="ui-button ui-button-primary">
              <UiIcon name="plus" /> {vista === 'Devolución' ? 'Registrar Devolución' : 'Nueva Entrega'}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 250px', position: 'relative' }}>
          <span className="ui-search-icon"><UiIcon name="search" /></span>
          <input
            type="text"
            placeholder="Buscar por DNI, Nombre o Tipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
          />
        </div>
        <div style={{ flex: '0 1 200px' }}>
          <select
            value={categoriaFilter}
            onChange={(e) => setCategoriaFilter(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
          >
            <option value="">Todas las categorías</option>
            <option value="PULSERA">Solo Pulseras</option>
            <option value="LAPTOP">Laptops</option>
            <option value="CELULAR">Celulares</option>
            <option value="TABLET">Tablets</option>
            <option value="MONITOR">Monitores</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando datos...</p>
        ) : filteredData.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay registros para mostrar. Usa "Cargar Excel" para importar tu base de datos.</p>
        ) : (
          <div className="table-responsive-wrapper">
            <table>
              <thead>
                <tr>
                  <th onClick={() => requestSort('fecha')} style={{ cursor: 'pointer', userSelect: 'none' }}>Fecha {sortConfig.key === 'fecha' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => requestSort('nombre')} style={{ cursor: 'pointer', userSelect: 'none' }}>Receptor {sortConfig.key === 'nombre' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => requestSort('operacion')} style={{ cursor: 'pointer', userSelect: 'none' }}>Cliente / Operación {sortConfig.key === 'operacion' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onClick={() => requestSort('tipo_movimiento')}>
                    Tipo {sortConfig.key === 'tipo_movimiento' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onClick={() => requestSort('equipo_tipo')}>
                    Equipo {sortConfig.key === 'equipo_tipo' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => requestSort('marca')} style={{ cursor: 'pointer', userSelect: 'none' }}>Marca/Modelo {sortConfig.key === 'marca' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => requestSort('serie')} style={{ cursor: 'pointer', userSelect: 'none' }}>Serie {sortConfig.key === 'serie' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => requestSort('condicion')} style={{ cursor: 'pointer', userSelect: 'none' }}>Estado {sortConfig.key === 'condicion' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const itemsPerPage = 8;
                  const indexOfLastItem = currentPage * itemsPerPage;
                  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);

                  return currentItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        {item.fecha ? (() => {
                          const [year, month, day] = item.fecha.split('T')[0].split('-');
                          return `${day}-${month}-${year}`;
                        })() : '-'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold' }}>{item.nombre}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DNI: {item.dni}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{item.cliente || 'Sin cliente asignado'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.operacion || '-'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ backgroundColor: item.tipo_movimiento === 'Devolución' ? 'var(--purple-bg)' : 'var(--blue-bg)', color: item.tipo_movimiento === 'Devolución' ? 'var(--purple-text)' : 'var(--blue-text)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {item.tipo_movimiento === 'Devolución' ? 'Devolución' : 'Entrega'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: '500' }}>{item.equipo_tipo}</div>
                        {item.laptop && <div className="ui-inline-detail"><UiIcon name="laptop" size={13} /> {item.laptop}</div>}
                        {item.mouse && <div className="ui-inline-detail"><UiIcon name="mouse" size={13} /> {item.mouse}</div>}
                      </td>
                      <td>
                        <div>{item.marca}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.modelo}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.serie}</td>
                      <td>
                        <span className={`badge ${item.condicion === 'NUEVO' ? 'badge-success' : 'badge-warning'}`}>
                          {item.condicion}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => { setSelectedEntrega(item); setShowDetailModal(true); }}
                            className="ui-icon-button"
                            title="Ver Detalles"
                          >
                            <UiIcon name="eye" />
                          </button>
                          {item.documento_url && (
                            <button onClick={(e) => { e.stopPropagation(); setDocUrlViewer(item.documento_url); }} title="Ver Acta" className="ui-icon-button">
                              <UiIcon name="file" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                              className="ui-icon-button"
                              title="Editar"
                            >
                              <UiIcon name="edit" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="ui-icon-button ui-icon-button-danger"
                              title="Eliminar"
                            >
                              <UiIcon name="trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredData.length > 0 && (() => {
          const itemsPerPage = 8;
          const totalPages = Math.ceil(filteredData.length / itemsPerPage);
          const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
          const indexOfLastItem = Math.min(currentPage * itemsPerPage, filteredData.length);

          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Mostrando {filteredData.length > 0 ? indexOfFirstItem + 1 : 0} a {indexOfLastItem} de {filteredData.length} registros
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', backgroundColor: currentPage === 1 ? 'var(--bg-color)' : 'var(--bg-secondary)', color: currentPage === 1 ? '#9ca3af' : 'var(--text-primary)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Anterior
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', backgroundColor: currentPage >= totalPages ? 'var(--bg-color)' : 'var(--bg-secondary)', color: currentPage >= totalPages ? '#9ca3af' : 'var(--text-primary)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {showExportModal && (
        <InventoryExportModal
          vista={vista}
          categoria={categoriaFilter}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* MODAL DE DETALLE */}
      {showDetailModal && selectedEntrega && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="responsive-modal" style={{ backgroundColor: 'var(--card-bg)', padding: '2rem', borderRadius: '0.5rem', width: '500px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.18)' }}>
            <button onClick={() => setShowDetailModal(false)} className="ui-icon-button" style={{ position: 'absolute', top: '1rem', right: '1rem' }} aria-label="Cerrar"><UiIcon name="close" /></button>

            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Detalles de Entrega TI</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem', color: '#374151' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <p style={{ margin: 0 }}><strong>Fecha:</strong> {selectedEntrega.fecha ? (() => {
                  const d = new Date(selectedEntrega.fecha);
                  return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
                })() : '-'}</p>
                <p style={{ margin: 0 }}><strong>Encargado:</strong> {selectedEntrega.encargado || '-'}</p>
              </div>
              <p style={{ margin: 0 }}><strong>Receptor:</strong> {selectedEntrega.nombre} <span style={{ color: 'var(--text-secondary)' }}>(DNI: {selectedEntrega.dni})</span></p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <p style={{ margin: 0 }}><strong>Cargo:</strong> {selectedEntrega.cargo || '-'}</p>
                <p style={{ margin: 0 }}><strong>Cliente / Operación:</strong> {selectedEntrega.cliente ? `${selectedEntrega.cliente} - ` : ''}{selectedEntrega.operacion || '-'}</p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />

              <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Información del Equipo</h4>
              <p style={{ margin: 0 }}><strong>Tipo:</strong> {selectedEntrega.equipo_tipo}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <p style={{ margin: 0 }}><strong>Marca:</strong> {selectedEntrega.marca || '-'}</p>
                <p style={{ margin: 0 }}><strong>Modelo:</strong> {selectedEntrega.modelo || '-'}</p>
              </div>
              <p style={{ margin: 0 }}><strong>N° Serie:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEntrega.serie || '-'}</span></p>
              <p style={{ margin: 0 }}><strong>Condición:</strong> <span className={`badge ${selectedEntrega.condicion === 'NUEVO' ? 'badge-success' : 'badge-warning'}`}>{selectedEntrega.condicion}</span></p>

              {(selectedEntrega.laptop || selectedEntrega.mouse || selectedEntrega.cargador) && (
                <div style={{ backgroundColor: 'var(--bg-color)', padding: '0.75rem', borderRadius: '0.5rem', marginTop: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>Accesorios / Periféricos:</p>
                  <ul style={{ margin: '0 0 0 1.5rem', padding: 0 }}>
                    {selectedEntrega.laptop && <li>Laptop: {selectedEntrega.laptop}</li>}
                    {selectedEntrega.mouse && <li>Mouse: {selectedEntrega.mouse}</li>}
                    {selectedEntrega.cargador && <li>Cargador: {selectedEntrega.cargador}</li>}
                  </ul>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0.5rem 0' }} />

              <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Datos Finales</h4>
              <p style={{ margin: 0 }}><strong>Motivo:</strong> {selectedEntrega.motivo || '-'}</p>
              <p style={{ margin: 0 }}><strong>Precio:</strong> {selectedEntrega.precio ? `$${selectedEntrega.precio}` : '-'}</p>
              <div style={{ backgroundColor: '#fff6e4', padding: '0.75rem', borderRadius: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ margin: 0 }}><strong>Observaciones:</strong></p>
                <p style={{ margin: '0.25rem 0 0 0', color: '#a8650a' }}>{selectedEntrega.observaciones || 'Ninguna.'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL FORMULARIO CRUD */}
      {showFormModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="responsive-modal" style={{ backgroundColor: 'var(--card-bg)', padding: '2rem', borderRadius: '0.5rem', width: '800px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setShowFormModal(false)} className="ui-icon-button" style={{ position: 'absolute', top: '1rem', right: '1rem' }} aria-label="Cerrar"><UiIcon name="close" /></button>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
              {isEditing ? `Editar ${vista || 'Registro'}` : `Nuevo Registro de ${vista || 'Entrega'}`}
            </h3>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {!vista && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Tipo Movimiento</label>
                    <select name="tipo_movimiento" value={formData.tipo_movimiento} onChange={handleFormChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'var(--bg-color)', fontWeight: 'bold' }}>
                      <option value="Entrega">Entrega</option>
                      <option value="Devolución">Devolución</option>
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Fecha</label>
                  <input type="date" name="fecha" value={formData.fecha} onChange={handleFormChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Encargado TI</label>
                  <input
                    type="text"
                    name="encargado"
                    value={formData.encargado}
                    onChange={handleFormChange}
                    placeholder="Quien entrega"
                    required
                    readOnly={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: !isEditing ? '#f3f4f6' : 'var(--bg-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              {/* 2. RECEPTOR */}
              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                  Receptor (Usuario)
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 'bold' }}>DNI *</label>
                    <div style={{ display: 'flex' }}>
                      <input
                        type="text"
                        name="dni"
                        disabled={dniSearchStatus === 'loading'}
                        value={formData.dni}
                        onChange={(e) => {
                          handleFormChange(e);
                          setDniSearchStatus(null); // Reset status if user changes DNI
                        }}
                        placeholder="Buscar DNI"
                        required
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem 0 0 0.375rem', border: '1px solid #d1d5db', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
                      />
                      <button
                        type="button"
                        onClick={handleSearchDNI}
                        disabled={dniSearchStatus === 'loading'}
                        style={{ padding: '0 1rem', backgroundColor: '#2458e8', color: 'white', border: 'none', borderRadius: '0 0.375rem 0.375rem 0', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        {dniSearchStatus === 'loading' ? <span className="ui-spinner" /> : <UiIcon name="search" />}
                      </button>
                    </div>
                    {dniSearchStatus === 'found' && <span style={{ fontSize: '0.75rem', color: '#0e9f6e', display: 'block', marginTop: '0.25rem' }}>✓ Personal encontrado</span>}
                    {dniSearchStatus === 'not_found' && (
                      <span style={{
                        fontSize: '0.75rem',
                        color: '#dc3b2a',
                        display: 'block',
                        marginTop: '0.25rem'
                      }}>
                        {canCrearPersonal
                          ? 'DNI nuevo. Llene los datos.'
                          : 'Solicita el registro del trabajador a TI o al administrador.'}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 'bold' }}>Nombre Completo *</label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleFormChange}
                      placeholder="Nombre del trabajador"
                      required
                      disabled={dniSearchStatus === 'found' && !isEditing}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: dniSearchStatus === 'found' && !isEditing ? '#f3f4f6' : 'var(--bg-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cargo</label>
                    <input
                      type="text"
                      name="cargo"
                      value={formData.cargo}
                      onChange={handleFormChange}
                      placeholder="Ej. Conductor, Administrador"
                      disabled={dniSearchStatus === 'found' && !isEditing}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: dniSearchStatus === 'found' && !isEditing ? '#f3f4f6' : 'var(--bg-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cliente / Operación</label>
                    <select
                      name="cliente_operacion_id"
                      value={formData.cliente_operacion_id || ''}
                      onChange={e => {
                        const opcion =
                          clientesOperaciones.find(
                            item =>
                              String(item.id) ===
                              e.target.value
                          );

                        setFormData(prev => ({
                          ...prev,
                          cliente_operacion_id:
                            e.target.value,
                          operacion:
                            opcion?.operacion || ''
                        }));
                      }}
                      required
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="">-- Seleccionar --</option>
                      {clientesOperaciones.map(opcion => (
                        <option
                          key={opcion.id}
                          value={opcion.id}
                        >
                          {opcion.cliente} - {opcion.operacion}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '0.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#374151' }}>Información del Equipo Principal</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Tipo Equipo</label>
                    <input type="text" name="equipo_tipo" value={formData.equipo_tipo} onChange={handleFormChange} placeholder="Laptop, Radio, etc." required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Condición</label>
                    <select name="condicion" value={formData.condicion} onChange={handleFormChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}>
                      <option value="NUEVO">NUEVO</option>
                      <option value="USADO">USADO</option>
                      <option value="PARA REPARAR">PARA REPARAR</option>
                    </select>
                  </div>
                  <div><input type="text" name="marca" value={formData.marca} onChange={handleFormChange} placeholder="Marca" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '1.25rem' }} /></div>
                  <div><input type="text" name="modelo" value={formData.modelo} onChange={handleFormChange} placeholder="Modelo" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '1.25rem' }} /></div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <input type="text" name="serie" value={formData.serie} onChange={handleFormChange} placeholder="N° de Serie Principal" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-color)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#374151' }}>Periféricos y Accesorios (Opcional)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <input type="text" name="laptop" value={formData.laptop} onChange={handleFormChange} placeholder="S/N Laptop extra" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                  <input type="text" name="mouse" value={formData.mouse} onChange={handleFormChange} placeholder="S/N Mouse" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                  <input type="text" name="cargador" value={formData.cargador} onChange={handleFormChange} placeholder="S/N Cargador" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Motivo</label>
                  <input type="text" name="motivo" value={formData.motivo} onChange={handleFormChange} placeholder="Renovación, Nuevo Ingreso, etc." style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Costo ($/S/)</label>
                  <input type="number" step="0.01" name="precio" value={formData.precio} onChange={handleFormChange} placeholder="0.00" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Observaciones</label>
                <textarea name="observaciones" value={formData.observaciones} onChange={handleFormChange} rows="2" placeholder="Detalles extra, rayones, teclado roto..." style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', resize: 'vertical' }}></textarea>
              </div>

              <div style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '0.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#374151' }}>Adjuntar Documento (Opcional)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Puedes subir el acta escaneada (PDF o Imagen JPG/PNG).</label>
                  <input type="file" accept=".pdf,image/*" onChange={(e) => setActaFile(e.target.files[0])} style={{ padding: '0.5rem', border: '1px dashed #d1d5db', borderRadius: '0.375rem', backgroundColor: 'var(--bg-color)' }} />
                  {formData.documento_url && !actaFile && (
                    <div className="ui-inline-detail" style={{ color: '#0e9f6e', marginTop: '0.35rem' }}><UiIcon name="file" size={15} /> Ya existe un documento adjunto en este registro. Si subes uno nuevo, se reemplazará.</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'var(--card-bg)', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', backgroundColor: '#0e9f6e', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                  {isEditing ? 'Guardar Cambios' : 'Registrar Entrega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL VISOR DE DOCUMENTOS */}
      {docUrlViewer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '0.5rem', width: '800px', maxWidth: '95%', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '.5rem' }}><UiIcon name="file" /> Visor de Acta</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleDownloadViewer} className="ui-button ui-button-primary"><UiIcon name="download" /> Descargar</button>
                <button onClick={() => setDocUrlViewer(null)} className="ui-button ui-button-secondary">Cerrar</button>
              </div>
            </div>
            <div style={{ flex: 1, backgroundColor: 'var(--bg-color)', borderRadius: '0.25rem', overflow: 'hidden' }}>
              {(docUrlViewer.toLowerCase().includes('.pdf') || docUrlViewer.includes('/raw/')) ? (
                <div style={{ height: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', backgroundColor: '#525659', padding: '1rem' }}>
                  <Document
                    file={docUrlViewer}
                    loading={<p style={{ color: 'white' }}>Cargando documento PDF...</p>}
                    error={<p style={{ color: 'white' }}>Error al cargar el PDF. Intenta descargarlo directamente.</p>}
                  >
                    <Page pageNumber={1} renderTextLayer={false} renderAnnotationLayer={false} width={700} />
                  </Document>
                </div>
              ) : (
                <img src={docUrlViewer} alt="Acta" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryExportModal({ vista, categoria, onClose }) {
  const hoy = new Date().toISOString().split('T')[0];
  const haceTreintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState(haceTreintaDias);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [exportando, setExportando] = useState(false);

  const handleExport = async () => {
    if (!fechaInicio || !fechaFin) {
      toast.error('Seleccione la fecha de inicio y la fecha de fin');
      return;
    }
    if (fechaInicio > fechaFin) {
      toast.error('La fecha de inicio no puede ser posterior a la fecha de fin');
      return;
    }

    setExportando(true);
    const aviso = toast.loading(`Generando Excel de ${vista === 'Devolución' ? 'devoluciones' : 'entregas'}...`);
    try {
      await api.exportExcelEntregas(vista, categoria, fechaInicio, fechaFin);
      toast.success('Descarga iniciada correctamente', { id: aviso });
      onClose();
    } catch (error) {
      toast.error(error.message || 'No se pudo generar el Excel', { id: aviso });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="ui-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="inventory-export-title">
      <div className="ui-modal-card inventory-export-modal">
        <div className="ui-modal-heading">
          <div>
            <h3 id="inventory-export-title">Exportar {vista === 'Devolución' ? 'devoluciones' : 'entregas'} TI</h3>
            <p>El archivo Excel incluirá únicamente los registros del período seleccionado.</p>
          </div>
          <button type="button" className="ui-icon-button" onClick={onClose} disabled={exportando} aria-label="Cerrar">
            <UiIcon name="close" />
          </button>
        </div>

        <div className="report-date-grid inventory-export-dates">
          <label>
            <span>Fecha de inicio</span>
            <input type="date" value={fechaInicio} max={fechaFin || undefined} onChange={event => setFechaInicio(event.target.value)} />
          </label>
          <label>
            <span>Fecha de fin</span>
            <input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={event => setFechaFin(event.target.value)} />
          </label>
        </div>

        {categoria && (
          <div className="report-period-summary">
            <span>Categoría aplicada</span>
            <strong>{categoria}</strong>
          </div>
        )}

        <div className="ui-modal-actions">
          <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={exportando}>Cancelar</button>
          <button type="button" className="ui-button ui-button-primary" onClick={handleExport} disabled={exportando}>
            {exportando ? <span className="ui-spinner" /> : <UiIcon name="download" />}
            {exportando ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
