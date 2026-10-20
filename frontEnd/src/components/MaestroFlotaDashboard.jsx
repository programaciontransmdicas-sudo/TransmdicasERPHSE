import { InventarioVehiculo } from './InventarioVehiculo';
import { crearEquiposFormulario } from '../utils/equiposVehiculo';
import { EquiposVehiculoFields } from './EquiposVehiculoFields';
import { formatearPlaca } from '../utils/formatos';
import { ClienteOperacionFields } from './ClienteOperacionFields';
import { useState, useEffect } from 'react';
import { api } from '../services/api';

function describirQuincena(fecha) {
  const periodo = new Intl.DateTimeFormat('es-PE', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${fecha}T00:00:00Z`));
  return `${fecha.slice(8) === '01' ? 'primera' : 'segunda'} quincena de ${periodo}`;
}

export function MaestroFlotaDashboard({ permisos, usuario }) {
  const rol = String(usuario?.rol || '').trim().toLowerCase();
  const isAdmin = ['admin', 'administrador'].includes(rol);
  const isTI = rol === 'ti';
  const [tractos, setTractos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItem, setEditItem] = useState(null); // Item being edited
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [altaCreada, setAltaCreada] = useState(null);

  const loadData = async () => {
    try {
      const tData = await api.getTractos();
      setTractos(Array.isArray(tData) ? tData : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let vigente = true;
    const cargar = async () => {
      try {
        const datos = await api.getTractos();
        if (vigente) setTractos(Array.isArray(datos) ? datos : []);
      } catch (error) {
        console.error(error);
      } finally {
        if (vigente) setLoading(false);
      }
    };
    cargar();
    return () => { vigente = false; };
  }, []);

  const filteredTractos = tractos.filter(t =>
    [
      t?.placa,
      t?.tipo_vehiculo,
      t?.marca_tracto,
      t?.modelo_tracto,
      t?.operacion,
      t?.cliente,
      t?.anio_fabricacion
    ].some(valor =>
      String(valor ?? '')
        .toLowerCase()
        .replace(/-/g, '').includes(searchTerm.toLowerCase().replace(/-/g, ''))
    )
  );


  return (
    <div className="erp-module-page erp-fleet-page" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Maestro de Flotas
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0' }}>
            Información general y dispositivos de las unidades.
          </p>
        </div>
        {permisos?.editar === true && (isAdmin || isTI) && (
          <button type="button" className="ui-button ui-button-success"
            onClick={() => { setEditItem(null); setIsEditModalOpen(true); }}>
            Nueva unidad
          </button>
        )}
      </div>

      {altaCreada?.mantenimiento && <div className="inventario-nuevo" role="status">
        <strong>Unidad {formatearPlaca(altaCreada.placa)} incorporada a {altaCreada.mantenimiento.codigo}.</strong>
        <p>{altaCreada.mantenimiento.primera_regular
          ? `Su mantenimiento regular comienza en M1 en la ${describirQuincena(altaCreada.mantenimiento.quincena_incorporacion)}.`
          : 'La unidad quedó registrada; la programación depende de los dispositivos y sus fechas de referencia.'}</p>
        {altaCreada.mantenimiento.pendientes?.length > 0 && <ul>
          {altaCreada.mantenimiento.pendientes.map(pendiente => <li key={pendiente}>{pendiente}</li>)}
        </ul>}
        <button className="ui-button ui-button-secondary" type="button" onClick={() => setAltaCreada(null)}>Entendido</button>
      </div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setCurrentPage(1)}
          style={{
            padding: '1rem 2rem',
            background: 'none',
            border: 'none',
            borderBottom: '2px solid #2458e8',
            color: '#2458e8',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Unidades ({tractos.length})
        </button>

      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Buscar por placa, marca, cliente..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Cargando maestro de flotas...</div>
      ) : (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
              <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Placa</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Operación</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Cliente</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Marca / Modelo</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Año</th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const itemsPerPage = 8;
                  const targetList = filteredTractos;
                  const indexOfLastItem = currentPage * itemsPerPage;
                  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
                  const currentItems = targetList.slice(indexOfFirstItem, indexOfLastItem);

                  return currentItems.map((t, i) => (
                    <tr
                      key={t.placa}
                      onClick={() => setSelectedItem({ type: 'tracto', data: t })}
                      style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)', cursor: 'pointer', transition: 'background 0.2s' }}
                    >
                      <td style={{ padding: '1rem', fontWeight: 'bold' }}>{formatearPlaca(t.placa)}</td>
                      <td style={{ padding: '1rem' }}>{t.operacion || '-'}</td>
                      <td style={{ padding: '1rem' }}>{t.cliente || '-'}{t.activo === false && <small style={{ display: 'block' }}>Inactiva</small>}</td>
                      <td style={{ padding: '1rem' }}>{t.marca_tracto || '-'} {t.modelo_tracto ? `/ ${t.modelo_tracto}` : ''}</td>
                      <td style={{ padding: '1rem' }}>
                        {t.anio_fabricacion ? String(t.anio_fabricacion).slice(0, 4) : '-'}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {(permisos?.editar === true) && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setEditItem({ type: 'tracto', data: t }); setIsEditModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#2458e8', cursor: 'pointer', marginRight: '0.5rem' }}>✏️</button>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if (window.confirm(`¿Desea dejar inactiva la unidad ${t.placa}? Se conservará su historial.`)) {
                                try { await api.cambiarEstadoVehiculo(t.placa, false); loadData(); }
                                catch (err) { alert(err.message); }
                              }
                            }} style={{ background: 'none', border: 'none', color: '#dc3b2a', cursor: 'pointer' }} disabled={t.activo === false} title="Dejar inactivo">Desactivar</button>
                            {isAdmin && t.activo === false && <button onClick={async e => { e.stopPropagation(); try { await api.cambiarEstadoVehiculo(t.placa, true); loadData(); } catch (error) { alert(error.message); } }}>Activar</button>}
                          </>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          {/* Controles de Paginación */}
          {(() => {
            const itemsPerPage = 8;
            const targetList = filteredTractos;
            const totalPages = Math.ceil(targetList.length / itemsPerPage);
            const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
            const indexOfLastItem = Math.min(currentPage * itemsPerPage, targetList.length);

            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Mostrando {targetList.length > 0 ? indexOfFirstItem + 1 : 0} a {indexOfLastItem} de {targetList.length} registros
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
      )}

      {/* Modal Lateral (Drawer) de Detalles */}
      {selectedItem && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '450px', maxWidth: '100vw', backgroundColor: 'var(--card-bg)', borderLeft: '1px solid var(--border-color)', boxShadow: '-16px 0 40px rgba(16,27,51,0.16)', zIndex: 100, display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s ease-out' }}>
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
              Ficha técnica de la unidad
            </h2>
            <button
              onClick={() => setSelectedItem(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ backgroundColor: 'var(--blue-bg)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(36,88,232,0.18)', marginBottom: '2rem', textAlign: 'center' }}>
              <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--accent-color)' }}>
                {formatearPlaca(selectedItem.data.placa)}
              </h1>
              <p style={{ color: '#9ca3af', margin: '0.5rem 0 0' }}>
                {selectedItem.data.marca_tracto || '-'} - {selectedItem.data.anio_fabricacion
                  ? String(selectedItem.data.anio_fabricacion).slice(0, 4)
                  : '-'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DetailBox label="Operación" value={selectedItem.data.operacion} />
              <DetailBox label="Cliente" value={selectedItem.data.cliente} />
              <DetailBox label="Tipo de vehículo" value={selectedItem.data.tipo_vehiculo} />
              <DetailBox label="Marca" value={selectedItem.data.marca_tracto} />
              <DetailBox label="Modelo" value={selectedItem.data.modelo_tracto} />
              <DetailBox
                label="Año de fabricación"
                value={
                  selectedItem.data.anio_fabricacion
                    ? String(selectedItem.data.anio_fabricacion).slice(0, 4)
                    : null
                }
              />
            </div>
            <InventarioVehiculo key={selectedItem.data.placa}
              placa={selectedItem.data.placa} puedeEditar={isAdmin && permisos?.editar === true} />
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <EditModal
            isTI={isTI}
          item={editItem}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={creada => { setIsEditModalOpen(false); if (creada) setAltaCreada(creada); loadData(); }}
        />
      )}
    </div>
  );
}

function DetailBox({ label, value, full }) {
  if (!value) return null;
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', gridColumn: full ? 'span 2' : 'span 1' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontWeight: '500', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function EditModal({ item, onClose, onSaved, isTI }) {
  const esNuevo = !item;
  const [equipos, setEquipos] = useState(() => crearEquiposFormulario([], true));
  const [opciones, setOpciones] = useState([]);
  useEffect(() => { api.getOpcionesFlota().then(data => setOpciones(data.clientesOperaciones || [])).catch(error => alert(error.message)); }, []);
  const [formData, setFormData] = useState({
    placa: item?.data?.placa || '',
    tipo_vehiculo: item?.data?.tipo_vehiculo || '',
    marca_tracto: item?.data?.marca_tracto || '',
    modelo_tracto: item?.data?.modelo_tracto || '',
    anio_fabricacion:
      item?.data?.anio_fabricacion
        ? String(
          item.data.anio_fabricacion
        ).slice(0, 4)
        : '',
    cliente: item?.data?.cliente || '',
    operacion: item?.data?.operacion || '',
    cliente_operacion_id: item?.data?.cliente_operacion_id || ''
  });

  const [saving, setSaving] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!formData.operacion) {
      alert('Seleccione una operación');
      return;
    }

    if (!formData.cliente) {
      alert('Seleccione un cliente');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        tipo_vehiculo:
          formData.tipo_vehiculo.trim() || null,

        marca_tracto:
          formData.marca_tracto.trim() || null,

        modelo_tracto:
          formData.modelo_tracto.trim() || null,

        anio_fabricacion:
          formData.anio_fabricacion
            ? `${formData.anio_fabricacion}-01-01`
            : null,

        cliente:
          formData.cliente.trim(),

        operacion:
          formData.operacion.trim()
      };

      let creada;
      if (esNuevo) {
        creada = await api.createVehiculo({
          ...payload,
          placa: formData.placa,
          cliente_operacion_id: Number(formData.cliente_operacion_id),
          equipos
        });
      } else {
        await api.updateVehiculo(
          formData.placa,
          isTI ? { cliente_operacion_id: Number(formData.cliente_operacion_id) }
            : { ...payload, cliente_operacion_id: Number(formData.cliente_operacion_id) }
        );
      }

      onSaved(creada);

    } catch (err) {
      alert(
        err.message ||
        'Error al actualizar el vehículo'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(16,27,51,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '1rem'
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          borderRadius: '1rem',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h2
            style={{
              margin: 0,
              color: 'var(--text-primary)'
            }}
          >
            {esNuevo ? 'Nueva unidad' : `Editar unidad - ${formatearPlaca(formData.placa)}`}
          </h2>

          <button
            onClick={onClose}
            disabled={saving}
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto'
          }}
        >
          <form
            id="edit-form"
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem'
            }}
          >
            {esNuevo && <label style={{ gridColumn: '1 / -1' }}>Placa
              <input aria-label="Placa de la nueva unidad" required maxLength={7}
                placeholder="XXX-XXX" value={formData.placa} disabled={saving}
                onChange={e => setFormData(actual => ({ ...actual, placa: e.target.value.toUpperCase() }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '.65rem', borderRadius: '.4rem',
                  border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            </label>}
            <Field
              label="Tipo de vehículo"
              name="tipo_vehiculo"
              disabled={saving || (isTI && !esNuevo)}
              value={formData.tipo_vehiculo}
              onChange={handleChange}
            />

            <Field
              label="Marca"
              name="marca_tracto"
              disabled={saving || (isTI && !esNuevo)}
              value={formData.marca_tracto}
              onChange={handleChange}
            />

            <Field
              label="Modelo"
              name="modelo_tracto"
              disabled={saving || (isTI && !esNuevo)}
              value={formData.modelo_tracto}
              onChange={handleChange}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}
            >
              <label
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)'
                }}
              >
                Año de fabricación
              </label>

              <input
                type="number"
                name="anio_fabricacion"
              disabled={saving || (isTI && !esNuevo)}
                value={formData.anio_fabricacion}
                onChange={handleChange}
                min="1900"
                max="2100"
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <ClienteOperacionFields opciones={opciones} cliente={formData.cliente} relacionId={formData.cliente_operacion_id}
              onChange={cambios => setFormData(actual => ({ ...actual, ...cambios }))} />
            {esNuevo && <section className="inventario-nuevo" aria-label="Dispositivos de la nueva unidad">
              <h3>Dispositivos de la unidad</h3>
              <p>Indique si cada dispositivo está instalado, no aplica o está por confirmar.</p>
              <p>Los equipos instalados se incorporarán a TI-PR-01. El mantenimiento regular comenzará en M1 en la quincena actual. Para calcular los mantenimientos anuales se necesita la fecha de instalación.</p>
              <EquiposVehiculoFields equipos={equipos} onChange={setEquipos} disabled={saving} />
            </section>}
          </form>
        </div>

        <div
          style={{
            padding: '1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem'
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            type="button"
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>

          <button
            form="edit-form"
            type="submit"
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: '#2458e8',
              color: 'white',
              fontWeight: 'bold',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving
              ? 'Guardando...'
              : esNuevo ? 'Crear unidad' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</label>
      <input disabled={disabled} type="text" name={name} value={value || ''} onChange={onChange} style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
    </div>
  );
}
