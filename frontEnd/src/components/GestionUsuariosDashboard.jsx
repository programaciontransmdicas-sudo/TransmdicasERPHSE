import React, { useState, useEffect } from 'react';
import { BASE_API_URL } from '../services/api';

const MODULES = [
  { id: 'resumen', label: 'Centro de Control (Resumen)' },
  { id: 'flota', label: 'Maestros Generales - Flota' },
  { id: 'personal', label: 'Maestros Generales - Personal' },
  { id: 'dashboard', label: 'Registro de Inspecciones' },
  { id: 'tickets', label: 'Tickets de Soporte' },
  { id: 'entregas', label: 'Entregas TI' },
  { id: 'devoluciones', label: 'Devoluciones TI' },
  { id: 'mantenimiento', label: 'Mantenimiento Técnico' },
  { id: 'reportes', label: 'Reportes Gerenciales' },
  { id: 'usuarios', label: 'Gestión de Usuarios' }
];

const TEMPLATES = {
  admin: {
    ...MODULES.reduce(
      (acc, modulo) => ({
        ...acc,
        [modulo.id]: { ver: true, editar: true }
      }),
      {}
    ),
    tickets: {
      ver: true,
      editar: true,
      crear: true,
      gestionar: true
    }
  },

  supervisor: {
    resumen: { ver: true, editar: false },
    flota: { ver: true, editar: false },
    personal: { ver: false, editar: false },
    dashboard: { ver: true, editar: true },
    tickets: {
      ver: true,
      editar: false,
      crear: true,
      gestionar: false
    },
    entregas: { ver: true, editar: true },
    devoluciones: { ver: false, editar: false },
    mantenimiento: { ver: false, editar: false },
    reportes: { ver: false, editar: false },
    usuarios: { ver: false, editar: false }
  },

  ti: {
    resumen: { ver: true, editar: false },
    flota: { ver: true, editar: true },
    personal: { ver: true, editar: true },
    dashboard: { ver: true, editar: true },
    tickets: {
      ver: true,
      editar: true,
      crear: false,
      gestionar: true
    },
    entregas: { ver: true, editar: true },
    devoluciones: { ver: true, editar: true },
    mantenimiento: { ver: true, editar: true },
    reportes: { ver: false, editar: false },
    usuarios: { ver: false, editar: false }
  }
};
const generarUsernamePreview = nombreCompleto => {
  const partes = String(nombreCompleto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(parte => parte.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (partes.length < 3) {
    return '';
  }

  const primerApellido = partes[0];
  const primerNombre = partes[2];

  return `${primerNombre.charAt(0)}${primerApellido}`;
};
export function GestionUsuariosDashboard() {
  const [usuarios, setUsuarios] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [clientesOperaciones, setClientesOperaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busquedaPersonal, setBusquedaPersonal] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rol: 'supervisor',
    clienteOperacionIds: [],
    estado: 'activo',
    permisos: TEMPLATES.supervisor
  });

  const [selectedPersonalId, setSelectedPersonalId] = useState('');

  useEffect(() => {
    fetchData();
    fetchPersonal();
    fetchClientesOperaciones();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('nexus_token');
      const res = await fetch(`${BASE_API_URL}/api/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonal = async () => {
    try {
      const token = localStorage.getItem('nexus_token');
      const res = await fetch(`${BASE_API_URL}/api/usuarios/personal-administrativo`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPersonal(data);
      }
    } catch (err) {
      console.error(err);
    }
  };
  const fetchClientesOperaciones = async () => {
    try {
      const token = localStorage.getItem('nexus_token');
      const res = await fetch(`${BASE_API_URL}/api/usuarios/clientes-operaciones`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClientesOperaciones(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenModal = (user = null) => {
    setBusquedaPersonal('');
    if (user) {
      setEditingId(user.id);
      setFormData({
        username: user.username,
        password: '',
        rol: user.rol,
        clienteOperacionIds: Array.isArray(user.asignaciones)
          ? user.asignaciones.map(asignacion => Number(asignacion.cliente_operacion_id))
          : [],
        estado: user.estado,
        permisos: TEMPLATES[user.rol] || TEMPLATES.supervisor
      });
      setSelectedPersonalId('');
    } else {
      setEditingId(null);
      setFormData({
        username: '',
        password: '',
        rol: 'supervisor',
        clienteOperacionIds: [],
        estado: 'activo',
        permisos: TEMPLATES.supervisor
      });
      setSelectedPersonalId('');
    }
    setModalOpen(true);
  };

  const handlePersonalChange = (e) => {
    const texto = e.target.value;
    setBusquedaPersonal(texto);

    const persona = personal.find(p =>
      texto === String(p.dni)
      || texto === p.dni + ' - ' + p.nombre_completo
    );

    setSelectedPersonalId(persona ? String(persona.id) : '');

    setFormData(actual => ({
      ...actual,
      username: persona?.dni || ''
    }));
  };

  const handleRolChange = (e) => {
    const newRol = e.target.value;
    setFormData({
      ...formData,
      rol: newRol,
      clienteOperacionIds:
        newRol === 'supervisor'
          ? formData.clienteOperacionIds
          : [],
      permisos: TEMPLATES[newRol] || TEMPLATES.supervisor
    });
  };

  const handleOperacionToggle = operacionId => {
    const id = Number(operacionId);

    setFormData(actual => {
      const seleccionadas = Array.isArray(actual.clienteOperacionIds)
        ? actual.clienteOperacionIds
        : [];

      const yaSeleccionada = seleccionadas.includes(id);

      return {
        ...actual,
        clienteOperacionIds: yaSeleccionada
          ? seleccionadas.filter(item => item !== id)
          : [...seleccionadas, id]
      };
    });
  };

  const handleClienteToggle = operacionesCliente => {
    const idsCliente = operacionesCliente.map(operacion => Number(operacion.id));

    setFormData(actual => {
      const seleccionadas = Array.isArray(actual.clienteOperacionIds)
        ? actual.clienteOperacionIds
        : [];

      const todasSeleccionadas = idsCliente.every(id => seleccionadas.includes(id));

      return {
        ...actual,
        clienteOperacionIds: todasSeleccionadas
          ? seleccionadas.filter(id => !idsCliente.includes(id))
          : [...new Set([...seleccionadas, ...idsCliente])]
      };
    });
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingId && !selectedPersonalId) {
      alert('Seleccione un trabajador de las sugerencias');
      return;
    }

    if (
      formData.rol === 'supervisor' &&
      formData.clienteOperacionIds.length === 0
    ) {
      alert('Seleccione por lo menos una operación para el supervisor');
      return;
    }
    const token = localStorage.getItem('nexus_token');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${BASE_API_URL}/api/usuarios/${editingId}` : `${BASE_API_URL}/api/usuarios`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setModalOpen(false);
        fetchData();
      } else {
        const error = await res.json();
        alert('Error: ' + error.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    }
  };

  const handleChangeStatus = async (usuario) => {
    const estadoActual = String(usuario.estado || 'activo').toLowerCase();
    const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
    const accion = nuevoEstado === 'inactivo' ? 'desactivar' : 'activar';

    if (!window.confirm(`¿Seguro que deseas ${accion} al usuario ${usuario.username}?`)) {
      return;
    }

    const token = localStorage.getItem('nexus_token');

    try {
      const res = await fetch(
        `${BASE_API_URL}/api/usuarios/${usuario.id}/estado`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ estado: nuevoEstado })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo cambiar el estado');
      }

      await fetchData();
    } catch (error) {
      console.error(error);
      alert(`Error: ${error.message}`);
    }
  };

  const personaSeleccionada =
    personal.find(
      persona =>
        String(persona.id) ===
        String(selectedPersonalId)
    );

  const usernamePreview =
    editingId
      ? formData.username
      : generarUsernamePreview(
        personaSeleccionada?.nombre_completo
      );

  return (
    <div className="erp-module-page erp-users-page" style={{ color: 'var(--text-primary)', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Gestión de Usuarios (RBAC)</h1>
        <button
          onClick={() => handleOpenModal()}
          style={{ background: '#2458e8', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
        >
          + Crear Usuario
        </button>
      </div>

      <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,27,51,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Username</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Rol Base</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Alcance</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Módulos Asignados</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Estado</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</td></tr>
            ) : (() => {
              const itemsPerPage = 8;
              const indexOfLastItem = currentPage * itemsPerPage;
              const indexOfFirstItem = indexOfLastItem - itemsPerPage;
              const currentItems = usuarios.slice(indexOfFirstItem, indexOfLastItem);

              return currentItems.map(u => {
                const activeModules = u.permisos ? Object.entries(u.permisos).filter(([k, v]) => v?.ver).length : 0;
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{u.username}</td>
                    <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '1rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        backgroundColor:
                          u.rol === 'admin'
                            ? '#101b33'
                            : u.rol === 'supervisor'
                              ? '#6d5cd1'
                              : '#0e9384'
                      }}>
                        {u.rol}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {u.rol === 'supervisor'
                        ? `${Array.isArray(u.asignaciones) ? new Set(u.asignaciones.map(asignacion => asignacion.cliente)).size : 0} cliente(s) · ${Array.isArray(u.asignaciones) ? u.asignaciones.length : 0} operación(es)`
                        : 'Acceso general'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>{activeModules} módulos</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ color: u.estado === 'activo' ? '#0e9f6e' : '#dc3b2a' }}>●</span> {u.estado}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>

                      <button onClick={() => handleOpenModal(u)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.25rem', cursor: 'pointer', marginRight: '0.5rem' }}>✏️</button>

                      <button
                        type="button"
                        onClick={() => handleChangeStatus(u)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${u.estado === 'activo' ? '#dc3b2a' : '#0e9f6e'}`,
                          color: u.estado === 'activo' ? '#dc3b2a' : '#0e9f6e',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              });
            })()}
          </tbody>
        </table>
      </div>

      {!loading && usuarios.length > 0 && (() => {
        const itemsPerPage = 8;
        const totalPages = Math.ceil(usuarios.length / itemsPerPage);
        const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
        const indexOfLastItem = Math.min(currentPage * itemsPerPage, usuarios.length);

        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Mostrando {usuarios.length > 0 ? indexOfFirstItem + 1 : 0} a {indexOfLastItem} de {usuarios.length} registros
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

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(16,27,51,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)' }}>

            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{editingId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              <form id="user-form" onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

                {/* COLUMNA IZQUIERDA: DATOS BÁSICOS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {!editingId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Seleccionar trabajador administrativo</label>
                      <input
                        type="text"
                        required
                        autoComplete="off"
                        list="personal-administrativo"
                        value={busquedaPersonal}
                        onChange={handlePersonalChange}
                        placeholder="Busque por nombre o DNI y seleccione"
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          background: '#1F2937',
                          color: 'white',
                          border: '1px solid #374151'
                        }}
                      />

                      <datalist id="personal-administrativo">
                        {personal.map(p => (
                          <option
                            key={p.id}
                            value={p.dni + ' - ' + p.nombre_completo}
                          />
                        ))}
                      </datalist>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <label
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Username generado
                    </label>

                    <input
                      type="text"
                      value={usernamePreview}
                      readOnly
                      placeholder="Se generará al seleccionar al trabajador"
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        outline: 'none',
                        cursor: 'default'
                      }}
                    />

                    {!editingId && personaSeleccionada && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        Generado automáticamente a partir del nombre del trabajador.
                      </span>
                    )}
                  </div>

                  {editingId ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      <label
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        Nueva contraseña (dejar en blanco para no cambiar)
                      </label>

                      <input
                        type="password"
                        value={formData.password}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            password: e.target.value
                          })
                        }
                        minLength={15}
                        autoComplete="new-password"
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          outline: 'none'
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '0.875rem 1rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(36, 88, 232, 0.08)',
                        border: '1px solid rgba(36, 88, 232, 0.25)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <strong>Contraseña inicial:</strong>{' '}
                      será automáticamente el DNI del trabajador.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Rol Base (Plantilla)</label>
                      <select
                        value={formData.rol}
                        onChange={handleRolChange}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#ffffff', color: 'var(--text-primary)', border: '1px solid #e2e5ed', outline: 'none' }}
                      >
                        <option value="admin">Administrador</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="ti">TI</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Estado</label>
                      <select
                        value={formData.estado}
                        onChange={e => setFormData({ ...formData, estado: e.target.value })}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#ffffff', color: 'var(--text-primary)', border: '1px solid #e2e5ed', outline: 'none' }}
                      >
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </div>
                  </div>
                  {formData.rol === 'supervisor' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          Clientes y operaciones asignadas
                        </label>

                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {formData.clienteOperacionIds.length} seleccionada(s)
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '0.75rem'
                        }}
                      >
                        {clientesOperaciones.map(cliente => {
                          const idsCliente = cliente.operaciones.map(
                            operacion => Number(operacion.id)
                          );

                          const todasSeleccionadas =
                            idsCliente.length > 0 &&
                            idsCliente.every(id =>
                              formData.clienteOperacionIds.includes(id)
                            );

                          return (
                            <div
                              key={cliente.id}
                              style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.75rem',
                                background: 'var(--bg-secondary)',
                                overflow: 'hidden'
                              }}
                            >
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.75rem',
                                  borderBottom: '1px solid var(--border-color)',
                                  fontWeight: '700',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={todasSeleccionadas}
                                  onChange={() => handleClienteToggle(cliente.operaciones)}
                                />
                                {cliente.nombre}
                              </label>

                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem',
                                  padding: '0.75rem'
                                }}
                              >
                                {cliente.operaciones.map(operacion => {
                                  const operacionId = Number(operacion.id);

                                  return (
                                    <label
                                      key={operacion.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={formData.clienteOperacionIds.includes(operacionId)}
                                        onChange={() => handleOperacionToggle(operacionId)}
                                      />
                                      {operacion.nombre}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        El supervisor únicamente podrá consultar información de las combinaciones seleccionadas. La flota interna no está disponible para este rol.
                      </span>
                    </div>
                  )}


                </div>
              </form>
            </div>

            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: 'rgba(16,27,51,0.03)' }}>
              <button onClick={() => setModalOpen(false)} type="button" style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button form="user-form" type="submit" style={{ background: '#2458e8', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                {editingId ? 'Guardar Cambios' : 'Crear Usuario'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
