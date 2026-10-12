import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import toast from 'react-hot-toast';
import { UiIcon } from './UiIcon';
import {
  SolicitudDescargaVideosModal
} from './SolicitudDescargaVideosModal';
import {
  SolicitudesDescargaVideosPanel
} from './SolicitudesDescargaVideosPanel';
import {
  ReportesPulserasPanel
} from './ReportesPulserasPanel';

export function SoporteTicketsDashboard({ permisos, usuario }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [activeTab, setActiveTab] = useState('KANBAN'); // 'KANBAN' o 'HISTORIAL'
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [draggedTicketId, setDraggedTicketId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [
    showVideoDownloadModal,
    setShowVideoDownloadModal
  ] = useState(false);

  // Estados para Modal de Resolución con Evidencia
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingTicketId, setResolvingTicketId] = useState(null);
  const [resolveFormData, setResolveFormData] = useState({ resolucion_desc: '', evidencia: null });
  const [ticketEvidencias, setTicketEvidencias] = useState([]);
  const [showPulseraModal, setShowPulseraModal] = useState(false);
  const [savingPulsera, setSavingPulsera] = useState(false);
  const [pulseraEvidencia, setPulseraEvidencia] = useState(null);
  const [
    pulseraClientesOperaciones,
    setPulseraClientesOperaciones
  ] = useState([]);
  const [pulseraPersonal, setPulseraPersonal] = useState([]);
  const [loadingPulseraOptions, setLoadingPulseraOptions] = useState(false);
  const [showDniSuggestions, setShowDniSuggestions] = useState(false);

  const [pulseraForm, setPulseraForm] = useState({
    solicitante_persona_id: '',
    cliente_operacion_id: '',
    receptor_persona_id: '',
    persona_pulsera: '',
    dni_persona_pulsera: '',
    motivo_renovacion: '',
    fecha_llegada_personal: '',
    hora_llegada_personal: ''
  });
  const [formData, setFormData] = useState({
    placa: '',
    persona_id: '',
    tipo_solicitud: 'Soporte Técnico',
    implemento: '',
    descripcion: '',
    fecha_llegada_unidad: '',
    hora_llegada_unidad: ''
  });
  const canCreate = permisos?.crear === true;

  const rolActual = String(usuario?.rol || '').toLowerCase();

  const canCreatePulsera =
    canCreate &&
    ['admin', 'administrador', 'supervisor'].includes(rolActual);

  const [opcionesTicket, setOpcionesTicket] = useState(null);

  useEffect(() => {
    if (!showModal || !canCreate) return;

    let vigente = true;
    setOpcionesTicket(null);

    api.getOpcionesTickets()
      .then(datos => {
        if (vigente) setOpcionesTicket(datos);
      })
      .catch(() => {
        if (vigente) {
          toast.error('No se pudieron cargar las opciones del ticket');
        }
      });

    return () => { vigente = false; };
  }, [showModal, canCreate]);
  useEffect(() => {
    if (!showPulseraModal || !canCreatePulsera) return;

    let vigente = true;

    setLoadingPulseraOptions(true);

    api.getOpcionesPulseras()
      .then(data => {
        if (!vigente) return;

        setPulseraClientesOperaciones(
          Array.isArray(data?.clientesOperaciones)
            ? data.clientesOperaciones
            : []
        );

        setPulseraPersonal(
          Array.isArray(data?.personal) ? data.personal : []
        );
      })
      .catch(error => {
        if (vigente) {
          toast.error(
            error.message || 'No se pudieron cargar las opciones de pulseras'
          );
        }
      })
      .finally(() => {
        if (vigente) {
          setLoadingPulseraOptions(false);
        }
      });

    return () => {
      vigente = false;
    };
  }, [showPulseraModal, canCreatePulsera]);

  const renderDestinoTicket = () => {
    const estilo = {
      width: '100%',
      padding: '0.75rem',
      borderRadius: '0.5rem',
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      color: 'var(--text-primary)'
    };

    return (
      <>
        <input
          type="text"
          list="placas-ticket"
          autoComplete="off"
          maxLength={20}
          required
          value={formData.placa}
          onChange={e =>
            setFormData(actual => ({
              ...actual,
              placa: e.target.value.toUpperCase()
            }))
          }
          placeholder="Seleccione una placa"
          style={estilo}
        />

        <datalist id="placas-ticket">
          {opcionesTicket?.vehiculos?.map(v => (
            <option
              key={v.placa}
              value={v.placa}
              label={v.operacion}
            />
          ))}
        </datalist>
      </>
    );
  };
  const handleTicketEvidenceChange = (event) => {
    const archivos = Array.from(event.target.files || []);

    if (archivos.length > 5) {
      event.target.value = '';
      setTicketEvidencias([]);
      return toast.error('Puede adjuntar como máximo 5 imágenes');
    }

    const archivoMuyGrande = archivos.find(
      archivo => archivo.size > 5 * 1024 * 1024
    );

    if (archivoMuyGrande) {
      event.target.value = '';
      setTicketEvidencias([]);
      return toast.error('Cada imagen debe pesar como máximo 5 MB');
    }

    setTicketEvidencias(archivos);
  };

  const renderImplementoField = () =>
    formData.tipo_solicitud === 'Soporte Técnico' && (
      <div>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: '600'
          }}
        >
          Implemento que presenta la falla
        </label>

        <select
          value={formData.implemento}
          onChange={e =>
            setFormData({
              ...formData,
              implemento: e.target.value
            })
          }
          required
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)'
          }}
        >
          <option value="">Seleccione un implemento</option>
          <option value="Tablet">Tablet</option>
          <option value="Radio Base">Radio Base</option>
          <option value="Copiloto">Copiloto</option>
          <option value="Handy">Handy</option>
          <option value="Otros">Otros</option>
        </select>
      </div>
    );

  const renderTicketEvidenceField = () => (
    <div>
      <label
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          fontWeight: '600'
        }}
      >
        Evidencia fotográfica (opcional)
      </label>

      <label
        style={{
          display: 'block',
          padding: '1rem',
          borderRadius: '0.65rem',
          border: '1.5px dashed var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          cursor: 'pointer'
        }}
      >
        <UiIcon name="camera" size={22} />

        <span
          style={{
            display: 'block',
            marginTop: '0.35rem',
            fontWeight: '600'
          }}
        >
          Seleccionar imágenes
        </span>

        <small>Máximo 5 imágenes de 5 MB cada una</small>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleTicketEvidenceChange}
          style={{ display: 'none' }}
        />
      </label>

      {ticketEvidencias.length > 0 && (
        <div
          style={{
            marginTop: '0.55rem',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem'
          }}
        >
          {ticketEvidencias.length}{' '}
          imagen{ticketEvidencias.length === 1 ? '' : 'es'} seleccionada
          {ticketEvidencias.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );

  const getInitialEvidenceUrls = ticket => {
    const evidencias =
      Array.isArray(ticket?.evidencias)
        ? ticket.evidencias
        : [];

    return evidencias
      .filter(
        evidencia =>
          evidencia?.tipo ===
          'inicial'
      )
      .map(
        evidencia =>
          evidencia?.url
      )
      .filter(Boolean);
  };
  const getClosingEvidenceUrls = ticket => {
    const evidencias =
      Array.isArray(ticket?.evidencias)
        ? ticket.evidencias
        : [];

    return evidencias
      .filter(
        evidencia =>
          evidencia?.tipo ===
          'cierre'
      )
      .map(
        evidencia =>
          evidencia?.url
      )
      .filter(Boolean);
  };
  const canManage = permisos?.gestionar === true;
  const isAdmin = ['admin', 'administrador'].includes(String(usuario?.rol || '').toLowerCase());

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await api.getIncidentes();
      setTickets(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('No se pudieron cargar los tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (!canManage) {
      toast.error('No tienes permiso para gestionar tickets');
      return;
    }
    if (newStatus === 'Resuelto') {
      setResolvingTicketId(id);
      setResolveFormData({ resolucion_desc: '', evidencia: null });
      setShowResolveModal(true);
      return;
    }

    try {
      await api.updateIncidente(id, { estado: newStatus });
      toast.success(`Ticket actualizado a ${newStatus}`);
      fetchTickets(); // Recargar datos
    } catch (error) {
      toast.error('Error al actualizar ticket');
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) {
      toast.error('No tienes permiso para resolver tickets');
      return;
    }
    if (!resolveFormData.evidencia) {
      return toast.error(
        'Debe adjuntar una evidencia para resolver el ticket'
      );
    }
    try {
      toast.loading('Resolviendo ticket...', { id: 'resolve-ticket' });
      const formData = new FormData();
      formData.append(
        'estado',
        'Resuelto'
      );
      if (resolveFormData.resolucion_desc) {
        formData.append('resolucion_desc', resolveFormData.resolucion_desc);
      }
      if (resolveFormData.evidencia) {
        formData.append('evidencia', resolveFormData.evidencia);
      }

      await api.updateIncidenteConEvidencia(resolvingTicketId, formData);
      toast.success('Ticket resuelto exitosamente', { id: 'resolve-ticket' });
      setShowResolveModal(false);
      fetchTickets();
      if (selectedTicket && String(selectedTicket.id) === String(resolvingTicketId)) {
        setSelectedTicket({
          ...selectedTicket,
          estado: 'Resuelto'
        });
      }
    } catch (error) {
      console.error("Error Front-end al resolver ticket:", error);
      toast.error(`Error al resolver ticket: ${error.message}`, { id: 'resolve-ticket' });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      toast.error('Solo el administrador puede eliminar tickets');
      return;
    }
    if (!window.confirm('¿Está seguro de eliminar permanentemente este ticket?')) return;
    try {
      await api.deleteIncidente(id);
      toast.success('Ticket eliminado');
      fetchTickets();
    } catch (error) {
      toast.error(error.message || 'Error al eliminar');
    }
  };

  const handleSaveTicket = async (e) => {
    e.preventDefault();

    if (!canCreate) {
      return toast.error(
        'No tienes permiso para crear tickets'
      );
    }

    if (!opcionesTicket) {
      return toast.error(
        'Espere a que se carguen las opciones'
      );
    }

    const placa =
      formData.placa
        .trim()
        .toUpperCase();

    if (
      !placa ||
      !opcionesTicket.vehiculos?.some(
        v => v.placa === placa
      )
    ) {
      return toast.error(
        'Seleccione una placa válida'
      );
    }



    if (!formData.descripcion.trim()) {
      return toast.error(
        'La descripción es obligatoria'
      );
    }

    if (
      formData.tipo_solicitud ===
      'Soporte Técnico' &&
      !formData.implemento
    ) {
      return toast.error(
        'Seleccione el implemento que presenta la falla'
      );
    }
    if (!formData.fecha_llegada_unidad ||
      !formData.hora_llegada_unidad
    ) {
      return toast.error(
        'Indique la fecha y hora de llegada de la unidad'
      );
    }
    try {
      await api.createIncidente(
        {
          placa,

          persona_id:
            formData.persona_id,

          tipo_solicitud:
            formData.tipo_solicitud,

          implemento:
            formData.implemento,

          descripcion:
            formData.descripcion,

          fecha_llegada_unidad:
            formData.fecha_llegada_unidad,

          hora_llegada_unidad:
            formData.hora_llegada_unidad,
        },

        ticketEvidencias
      );

      toast.success(
        'Ticket creado exitosamente'
      );

      setShowModal(false);

      setFormData({
        placa: '',
        persona_id: '',
        tipo_solicitud:
          'Soporte Técnico',
        implemento: '',
        descripcion: '',
        fecha_llegada_unidad: '',
        hora_llegada_unidad: ''
      });

      setTicketEvidencias([]);

      fetchTickets();

    } catch (error) {
      toast.error(
        error.message ||
        'Error al crear el ticket'
      );
    }
  };

  const handleSavePulsera = async (event) => {
    event.preventDefault();

    if (!canCreatePulsera) {
      return toast.error('No tienes permiso para registrar pulseras');
    }

    const solicitantePersonaId = Number(
      pulseraForm.solicitante_persona_id
    );

    const receptorPersonaId = Number(
      pulseraForm.receptor_persona_id
    );

    const clienteOperacionId = Number(
      pulseraForm.cliente_operacion_id
    );
    const motivoRenovacion = pulseraForm.motivo_renovacion.trim();

    if (
      !Number.isInteger(solicitantePersonaId) ||
      !Number.isInteger(receptorPersonaId) ||
      !Number.isInteger(clienteOperacionId) ||
      !motivoRenovacion
    ) {
      return toast.error('Complete todos los campos del reporte');
    }

    if (!pulseraEvidencia) {
      return toast.error('Adjunte una imagen como evidencia');
    }

    if (pulseraEvidencia.size > 5 * 1024 * 1024) {
      return toast.error('La evidencia debe pesar como máximo 5 MB');
    }
    if (
      !pulseraForm.fecha_llegada_personal ||
      !pulseraForm.hora_llegada_personal
    ) {
      return toast.error(
        'Indique la fecha y hora de llegada del personal'
      );
    }
    try {
      setSavingPulsera(true);

      await api.createPulsera(
        {
          solicitante_persona_id: solicitantePersonaId,
          receptor_persona_id: receptorPersonaId,
          cliente_operacion_id: clienteOperacionId,
          motivo_renovacion: motivoRenovacion,
          fecha_llegada_personal:
            pulseraForm.fecha_llegada_personal,
          hora_llegada_personal:
            pulseraForm.hora_llegada_personal,
        },
        pulseraEvidencia
      );

      toast.success('Reporte de pulsera registrado');

      setShowPulseraModal(false);
      setPulseraEvidencia(null);
      setShowDniSuggestions(false);

      setPulseraForm({
        solicitante_persona_id: '',
        cliente_operacion_id: '',
        receptor_persona_id: '',
        persona_pulsera: '',
        dni_persona_pulsera: '',
        motivo_renovacion: '',
        fecha_llegada_personal: '',
        hora_llegada_personal: ''
      });
    } catch (error) {
      toast.error(
        error.message ||
        'Error al registrar el reporte de pulsera'
      );
    } finally {
      setSavingPulsera(false);
    }
  };

  const renderPulseraButton = () => canCreatePulsera && (
    <button onClick={() => setShowPulseraModal(true)} className="ui-button ui-button-secondary">
      <UiIcon name="file" /> Reporte de Pulseras
    </button>
  );
  const renderVideoDownloadButton = () =>
    canCreatePulsera && (
      <button
        type="button"
        onClick={() =>
          setShowVideoDownloadModal(true)
        }
        className="ui-button ui-button-secondary"
      >
        <UiIcon name="download" />
        Solicitud de descarga de videos
      </button>
    );
  const renderPulseraModal = () => canCreatePulsera && showPulseraModal && (
    <div onClick={() => setShowPulseraModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(5px)', padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>

      <div onClick={event => event.stopPropagation()} style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)', animation: 'scaleUp 0.2s ease-out' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>Reporte de Pulseras</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Registre la renovación y la evidencia correspondiente.</p>
          </div>

          <button type="button" onClick={() => setShowPulseraModal(false)} className="ui-icon-button" aria-label="Cerrar">
            <UiIcon name="close" />
          </button>
        </div>

        <form onSubmit={handleSavePulsera} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Nombre del Solicitante</label>

            <select
              value={pulseraForm.solicitante_persona_id}
              onChange={event =>
                setPulseraForm({
                  ...pulseraForm,
                  solicitante_persona_id: event.target.value
                })
              }
              required
              disabled={loadingPulseraOptions}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outlineColor: 'var(--accent-color)'
              }}
            >
              <option value="">
                {loadingPulseraOptions
                  ? 'Cargando personal...'
                  : 'Seleccione una persona'}
              </option>

              {pulseraPersonal.map(persona => (
                <option key={persona.id} value={persona.id}>
                  {persona.nombre_completo}
                  {persona.dni ? ` - ${persona.dni}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              Cliente / Operación
            </label>

            <select
              value={pulseraForm.cliente_operacion_id}
              onChange={event =>
                setPulseraForm({
                  ...pulseraForm,
                  cliente_operacion_id: event.target.value
                })
              }
              required
              disabled={loadingPulseraOptions}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)'
              }}
            >
              <option value="">
                {loadingPulseraOptions
                  ? 'Cargando operaciones...'
                  : 'Seleccione un cliente y una operación'}
              </option>

              {pulseraClientesOperaciones.map(opcion => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.etiqueta || `${opcion.cliente} - ${opcion.operacion}`}
                </option>
              ))}
            </select>
          </div>


          <div style={{ position: 'relative' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              DNI de la persona que recibirá la pulsera
            </label>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pulseraForm.dni_persona_pulsera}
              onFocus={() => setShowDniSuggestions(true)}
              onChange={event => {
                const dni = event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 8);

                setPulseraForm(actual => ({
                  ...actual,
                  receptor_persona_id: '',
                  dni_persona_pulsera: dni,
                  persona_pulsera: ''
                }));

                setShowDniSuggestions(true);
              }}
              placeholder="Escriba el DNI para buscar"
              required
              maxLength={8}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outlineColor: 'var(--accent-color)'
              }}
            />

            {showDniSuggestions
              && pulseraForm.dni_persona_pulsera
              && !pulseraForm.persona_pulsera && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    marginTop: '0.25rem',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    backgroundColor: 'var(--bg-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.12)'
                  }}
                >
                  {pulseraPersonal
                    .filter(persona =>
                      String(persona.dni || '').startsWith(
                        pulseraForm.dni_persona_pulsera
                      )
                    )
                    .slice(0, 8)
                    .map(persona => (
                      <button
                        key={persona.dni}
                        type="button"
                        onClick={() => {
                          setPulseraForm(actual => ({
                            ...actual,
                            receptor_persona_id: String(persona.id),
                            dni_persona_pulsera: String(persona.dni),
                            persona_pulsera: persona.nombre_completo
                          }));

                          setShowDniSuggestions(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: 'none',
                          borderBottom: '1px solid var(--border-color)',
                          backgroundColor: 'transparent',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                      >
                        <strong>{persona.dni}</strong>
                        {' — '}
                        {persona.nombre_completo}
                      </button>
                    ))}
                </div>
              )}
          </div>

          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              Persona que recibirá la pulsera
            </label>

            <input
              type="text"
              value={pulseraForm.persona_pulsera}
              readOnly
              placeholder="Seleccione un DNI de la lista"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'default'
              }}
            />
          </div>
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem'
              }}
            >
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: '600'
                }}>
                  Fecha de llegada del personal
                </label>

                <input
                  type="date"
                  required
                  value={pulseraForm.fecha_llegada_personal}
                  onChange={event => setPulseraForm({
                    ...pulseraForm,
                    fecha_llegada_personal: event.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: '600'
                }}>
                  Hora de llegada del personal
                </label>

                <input
                  type="time"
                  required
                  value={pulseraForm.hora_llegada_personal}
                  onChange={event => setPulseraForm({
                    ...pulseraForm,
                    hora_llegada_personal: event.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Motivo de la renovación</label>

            <textarea value={pulseraForm.motivo_renovacion} onChange={event => setPulseraForm({ ...pulseraForm, motivo_renovacion: event.target.value })} rows="4" placeholder="Explique por qué se renovará la pulsera..." required maxLength={1000} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical', outlineColor: 'var(--accent-color)' }}></textarea>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Evidencia</label>

            <label style={{ display: 'block', padding: '1rem', borderRadius: '0.65rem', border: '1.5px dashed var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer' }}>

              <UiIcon name="camera" size={22} />

              <span style={{ display: 'block', marginTop: '0.35rem', fontWeight: '600' }}>
                {pulseraEvidencia ? pulseraEvidencia.name : 'Seleccionar imagen'}
              </span>

              <small>Una imagen de máximo 5 MB</small>

              <input type="file" accept="image/*" onChange={event => setPulseraEvidencia(event.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => setShowPulseraModal(false)} className="ui-button ui-button-secondary">
              Cancelar
            </button>

            <button type="submit" disabled={savingPulsera} className="ui-button ui-button-primary">
              {savingPulsera ? 'Guardando...' : 'Guardar Reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const pendientes =
    tickets.filter(
      t => t.estado === 'Pendiente'
    );

  const enProceso =
    tickets.filter(
      t => t.estado === 'En Proceso'
    );

  const resueltos =
    tickets.filter(
      t => t.estado === 'Resuelto'
    );
  const getFilteredList = (list) => {
    return list.filter(t => {
      const p = t.placa ? String(t.placa).toLowerCase() : '';
      const id = t.id ? String(t.id).toLowerCase() : '';
      const s = searchTerm ? String(searchTerm).toLowerCase() : '';
      return p.includes(s) || `tkt-${id}`.includes(s);
    });
  };

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('ticketId', id);
    // Usamos setTimeout para que la tarjeta no desaparezca mientras se arrastra (truco de Chrome)
    setTimeout(() => setDraggedTicketId(id), 0);
  };

  const handleDragEnd = () => {
    setDraggedTicketId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault(); // Permite que se pueda soltar aquí
    if (dragOverColumn !== columnStatus) {
      setDragOverColumn(columnStatus);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e, columnStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!canManage) return; // Bloquear si es solo lectura
    const id = e.dataTransfer.getData('ticketId');
    if (id) {
      const ticket = tickets.find(t => String(t.id) === String(id));
      if (ticket && ticket.estado !== columnStatus) {
        handleStatusChange(id, columnStatus);
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    let isoString = String(dateString);
    if (isoString.includes('T') && !isoString.endsWith('Z')) {
      isoString += 'Z'; // Forzar que sea reconocido como UTC si no trae la Z
    } else if (!isoString.includes('T')) {
      isoString = isoString.replace(' ', 'T') + 'Z';
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(dateString).split(' ')[0]; // Fallback si es invalida
    return d.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');
  };

  const renderKanbanColumn = (title, status, ticketsList, colorHex) => {
    if (statusFilter !== 'Todos' && statusFilter !== status) return null;

    const list = getFilteredList(ticketsList);

    return (
      <div
        className="kanban-column"
        style={{
          borderTop: `4px solid ${colorHex}`,
          backgroundColor: dragOverColumn === status ? '#F3F4F6' : 'var(--card-bg)',
          transition: 'background-color 0.2s ease',
          minHeight: '200px'
        }}
        onDragOver={(e) => handleDragOver(e, status)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>
            <span className="ui-status-dot" style={{ backgroundColor: colorHex }} /> {title}
          </h3>
          <span style={{ backgroundColor: '#E5E7EB', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold', color: '#4B5563' }}>{list.length}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {list.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', backgroundColor: 'var(--bg-color)', borderRadius: '0.5rem', border: '2px dashed #E5E7EB', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Soltar aquí
            </div>
          ) : (
            list.map(ticket => (
              <div
                key={ticket.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, ticket.id)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedTicket(ticket)}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  cursor: 'grab',
                  opacity: draggedTicketId === ticket.id ? 0.4 : 1,
                  transform: draggedTicketId === ticket.id ? 'scale(0.98)' : 'scale(1)',
                  transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s'
                }}
                onMouseEnter={(e) => { if (draggedTicketId !== ticket.id) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; } }}
                onMouseLeave={(e) => { if (draggedTicketId !== ticket.id) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)'; } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: '800', color: '#101b33', fontSize: '0.9rem' }}>#TKT-{ticket.id}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{formatDate(ticket.fecha_creacion).split(' ')[0]}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#eef3ff', color: '#2458e8', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontWeight: 'bold', fontSize: '0.75rem', border: '1px solid rgba(36,88,232,0.25)' }}>{ticket.placa || ('Sin placa · ' + ticket.operacion)}</span>


                </div>
                <div style={{ fontWeight: '700', color: '#101b33', fontSize: '0.9rem', marginBottom: '0.5rem', lineHeight: '1.2' }}>
                  {ticket.tipo_solicitud}
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                  {ticket.descripcion}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F4F6', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#4B5563', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '500' }}>
                    <div className="ui-avatar-mini"><UiIcon name="user" size={12} /></div>
                    {ticket.nombre_completo ? (ticket.nombre_completo.split(' ')[0]) : 'S/N'}
                  </div>

                  {/* Select Inline para cambio rápido de estado */}
                  <select
                    value={ticket.estado}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                    disabled={!canManage}
                    style={{
                      padding: '0.25rem 0.5rem', borderRadius: '1rem', border: '1px solid transparent', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', outline: 'none',
                      backgroundColor: ticket.estado === 'Pendiente' ? '#fdeae8' : ticket.estado === 'En Proceso' ? '#fff6e4' : '#e7f9f1',
                      color: ticket.estado === 'Pendiente' ? '#dc3b2a' : ticket.estado === 'En Proceso' ? '#db8b0b' : '#0e9f6e'
                    }}>
                    <option value="Pendiente">Pendiente</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Resuelto">Resuelto</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const isReadOnly = !canManage;

  if (isReadOnly) {
    return (
      <div className="erp-module-page erp-tickets-page" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}
            >
              Tickets de Soporte de mi Operación
            </h1>

            <p
              style={{
                color: 'var(--text-secondary)',
                margin: '0.5rem 0 0'
              }}
            >
              Consulta el estado de los requerimientos pertenecientes a tu operación.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            {canCreate && (
              <button
                onClick={() => setShowModal(true)}
                className="ui-button ui-button-primary"
              >
                <UiIcon name="plus" />
                Nueva Solicitud
              </button>
            )}

            {renderPulseraButton()}
            {renderVideoDownloadButton()}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: '2px solid var(--border-color)',
            marginBottom: '1.5rem',
            gap: '1rem',
            overflowX: 'auto'
          }}
        >
          <button
            onClick={() => setActiveTab('KANBAN')}
            className={`ui-tab-button ${activeTab === 'KANBAN' ? 'active' : ''
              }`}
          >
            <UiIcon name="clipboard" />
            Mis tickets
          </button>
          <button
            onClick={() => setActiveTab('PULSERAS')}
            className={`ui-tab-button ${activeTab === 'PULSERAS'
                ? 'active'
                : ''
              }`}
          >
            <UiIcon name="clipboard" />
            Reportes de pulseras
          </button>
          <button
            onClick={() => setActiveTab('VIDEOS')}
            className={`ui-tab-button ${activeTab === 'VIDEOS' ? 'active' : ''
              }`}
          >
            <UiIcon name="download" />
            Descarga de videos
          </button>
        </div>

        <div
          style={{
            display:
              activeTab === 'VIDEOS' ||
              activeTab === 'PULSERAS'
                ? 'none'
                : 'grid',
            gap: '1rem'
          }}
        >
          {tickets.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
              No tienes solicitudes registradas.
            </div>
          ) : (
            tickets.map(ticket => (
              <div key={ticket.id} style={{ padding: '1.5rem', backgroundColor: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{ticket.tipo_solicitud} {ticket.placa ? `- ${ticket.placa}` : ''}</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{ticket.descripcion}</p>
                  <div className="ui-ticket-meta"><span>{formatDate(ticket.fecha_creacion)}</span><span><UiIcon name="user" size={13} /> {ticket.nombre_completo}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '2rem',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    backgroundColor: ticket.estado === 'Pendiente' ? '#fdeae8' : ticket.estado === 'En Proceso' ? '#fff6e4' : '#e7f9f1',
                    color: ticket.estado === 'Pendiente' ? '#dc3b2a' : ticket.estado === 'En Proceso' ? '#db8b0b' : '#0e9f6e'
                  }}>
                    {ticket.estado}
                  </span>
                  {ticket.resolucion_desc && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#0e9f6e' }}>✓ {ticket.resolucion_desc}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {activeTab === 'VIDEOS' && (
          <SolicitudesDescargaVideosPanel
            canManage={false}
          />
        )}

        {activeTab === 'PULSERAS' && (
          <ReportesPulserasPanel
            canManage={false}
          />
        )}

        {/* Modal Nuevo Ticket */}
        {canCreate && showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', animation: 'fadeIn 0.2s ease-out' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '500px', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)', animation: 'scaleUp 0.2s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>Nuevo Ticket de Ayuda</h2>
                <button onClick={() => setShowModal(false)} className="ui-icon-button" aria-label="Cerrar"><UiIcon name="close" /></button>
              </div>

              <form onSubmit={handleSaveTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Placa de Vehículo</label>
                    {renderDestinoTicket()}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Solicitante</label>

                    <input
                      type="text"
                      value={usuario?.nombre_completo || usuario?.username || 'Usuario actual'}
                      readOnly
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'default' }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}
                  >
                    Categoría del Problema
                  </label>

                  <select
                    value={formData.tipo_solicitud}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        tipo_solicitud: e.target.value,
                        implemento: ''
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      outlineColor: 'var(--accent-color)'
                    }}
                  >
                    <option value="Soporte Técnico">
                      Soporte Técnico (General)
                    </option>
                    <option value="GPS No Reporta">
                      GPS No Reporta
                    </option>
                    <option value="Cámaras Desconectadas">
                      Cámaras Desconectadas
                    </option>
                    <option value="Mantenimiento de Equipo">
                      Mantenimiento de Equipo
                    </option>
                    <option value="Instalación de Software">
                      Instalación de Software
                    </option>
                    <option value="Otro">
                      Otro
                    </option>
                  </select>
                </div>

                {renderImplementoField()}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem'
                  }}>
                  <div>
                    <label style={{
                      display: 'block'
                      ,
                      marginBottom: '0.5rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}>
                      Fecha de llegada de la unidad
                    </label>
                    <input type="date"
                      required
                      value={formData.fecha_llegada_unidad}
                      onChange={event => setFormData({
                        ...formData,
                        fecha_llegada_unidad: event.target.value
                      })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1ox solid var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}>Hora de llegada de la unidad</label>

                    <input type="time"
                      required
                      value={formData.hora_llegada_unidad}
                      onChange={event => setFormData({
                        ...formData,
                        hora_llegada_unidad: event.target.value
                      })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Descripción Detallada</label>
                  <textarea value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} rows="4" placeholder="Describa el problema reportado de manera clara..." required style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical', outlineColor: 'var(--accent-color)' }}></textarea>
                </div>

                {renderTicketEvidenceField()}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #D1D5DB', color: '#374151', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
                  <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2458e8', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(36,88,232,0.2)' }}>Guardar Ticket</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {renderPulseraModal()}
        <SolicitudDescargaVideosModal
          open={showVideoDownloadModal}
          onClose={() =>
            setShowVideoDownloadModal(false)
          }
          usuario={usuario}
        />

      </div>
    );
  }

  return (
    <div className="erp-module-page erp-tickets-page" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#101b33' }}>Mesa de Ayuda de Tickets</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Gestión centralizada de incidentes y requerimientos tecnológicos.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

          {canCreate && (
            <button onClick={() => setShowModal(true)} className="ui-button ui-button-primary">
              <UiIcon name="plus" /> Crear Nuevo Ticket
            </button>
          )}
          {renderPulseraButton()}
          {renderVideoDownloadButton()}
        </div>
      </div>

      {/* Pestañas (Tabs) KANBAN vs HISTORIAL */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E5E7EB', marginBottom: '1.5rem', gap: '1rem' }}>
        <button onClick={() => setActiveTab('KANBAN')} className={`ui-tab-button ${activeTab === 'KANBAN' ? 'active' : ''}`}>
          <UiIcon name="clipboard" /> Tablero de Tickets
        </button>
        <button onClick={() => setActiveTab('HISTORIAL')} className={`ui-tab-button ${activeTab === 'HISTORIAL' ? 'active' : ''}`}>
          <UiIcon name="history" /> Historial de Trabajos Técnicos
        </button>
        <button
          onClick={() => setActiveTab('PULSERAS')}
          className={`ui-tab-button ${
            activeTab === 'PULSERAS'
              ? 'active'
              : ''
          }`}
        >
          <UiIcon name="clipboard" />
          Reportes de pulseras
        </button>
        <button
          onClick={() => setActiveTab('VIDEOS')}
          className={`ui-tab-button ${
            activeTab === 'VIDEOS'
              ? 'active'
              : ''
          }`}
        >
          <UiIcon name="download" />
          Descarga de videos
        </button>
      </div>

      {activeTab === 'KANBAN' && (
        <>
          {/* Controles de Filtrado y Stats */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <label className="ui-search-field">
              <UiIcon name="search" />
              <input type="text" placeholder="Buscar placa o #TKT..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setStatusFilter('Todos')} style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem', backgroundColor: statusFilter === 'Todos' ? '#101b33' : '#E5E7EB', color: statusFilter === 'Todos' ? 'white' : '#374151', transition: 'all 0.2s' }}>
                Todos ({pendientes.length + enProceso.length})
              </button>
              <button onClick={() => setStatusFilter('Pendiente')} style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem', backgroundColor: statusFilter === 'Pendiente' ? '#dc3b2a' : '#fdeae8', color: statusFilter === 'Pendiente' ? 'white' : '#dc3b2a', transition: 'all 0.2s' }}>
                <span className="ui-status-dot is-danger" /> Pendientes ({pendientes.length})
              </button>
              <button onClick={() => setStatusFilter('En Proceso')} style={{ padding: '0.5rem 1rem', borderRadius: '2rem', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem', backgroundColor: statusFilter === 'En Proceso' ? '#db8b0b' : '#fff6e4', color: statusFilter === 'En Proceso' ? 'white' : '#db8b0b', transition: 'all 0.2s' }}>
                <span className="ui-status-dot is-warning" /> En Proceso ({enProceso.length})
              </button>
            </div>

            <button onClick={fetchTickets} className="ui-icon-button ui-refresh-button" title="Recargar">
              <UiIcon name="refresh" />
            </button>
          </div>

          {/* Tablero Kanban */}
          <div className="kanban-container" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {renderKanbanColumn('Pendientes', 'Pendiente', pendientes, '#EF4444')}
            {renderKanbanColumn('En Proceso', 'En Proceso', enProceso, '#F59E0B')}
          </div>
        </>
      )}


      {activeTab === 'HISTORIAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
            <label className="ui-search-field ui-search-field-compact">
              <UiIcon name="search" />
              <input type="text" placeholder="Buscar placa o #TKT en historial..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </label>
            <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>Total Resueltos: {resueltos.length}</span>
          </div>

          <div className="table-container" style={{ backgroundColor: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>TKT</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>Fecha</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>Placa</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>Técnico / Tipo</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>Problema / Solución</th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#4B5563', fontSize: '0.85rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredList(resueltos).length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No hay tickets resueltos.</td></tr>
                ) : (
                  getFilteredList(resueltos).map(ticket => (
                    <tr key={ticket.id} style={{ borderBottom: '1px solid #E5E7EB', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '1rem', fontWeight: 'bold', color: '#101b33' }}>#{ticket.id}</td>
                      <td style={{ padding: '1rem', color: '#4B5563', fontSize: '0.9rem' }}>{formatDate(ticket.fecha_creacion)}</td>
                      <td style={{ padding: '1rem' }}><span className="badge" style={{ backgroundColor: '#eef3ff', color: '#2458e8', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontWeight: 'bold', fontSize: '0.75rem' }}>{ticket.placa || ('Sin placa · ' + ticket.operacion)}</span></td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: '600', color: '#101b33', fontSize: '0.9rem' }}>{ticket.tipo_solicitud}</div>
                        <div className="ui-inline-detail"><UiIcon name="user" size={13} /> {ticket.nombre_completo || 'S/N'}</div>
                      </td>
                      <td style={{ padding: '1rem', maxWidth: '300px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ticket.descripcion}><strong>Prob:</strong> {ticket.descripcion}</div>
                        {ticket.resolucion_desc && <div style={{ fontSize: '0.85rem', color: '#0e9f6e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ticket.resolucion_desc}><strong>Sol:</strong> {ticket.resolucion_desc}</div>}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        {getClosingEvidenceUrls(ticket).length > 0 && (
                          <button
                            onClick={() => window.open(getClosingEvidenceUrls(ticket)[0], '_blank')}
                            className="ui-icon-button"
                            title="Ver evidencia"
                          >
                            <UiIcon name="eye" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(ticket.id)} className="ui-icon-button ui-icon-button-danger" title="Eliminar permanente">
                            <UiIcon name="trash" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'VIDEOS' && (
        <SolicitudesDescargaVideosPanel
          canManage={canManage}
        />
      )}

      {activeTab === 'PULSERAS' && (
        <ReportesPulserasPanel
          canManage={canManage}
        />
      )}

      {/* Modal Nuevo Ticket */}
      {canCreate && showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '500px', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)', animation: 'scaleUp 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>Nuevo Ticket de Ayuda</h2>
              <button onClick={() => setShowModal(false)} className="ui-icon-button" aria-label="Cerrar"><UiIcon name="close" /></button>
            </div>

            <form onSubmit={handleSaveTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Placa de Vehículo</label>
                  {renderDestinoTicket()}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Solicitante</label>

                  <input
                    type="text"
                    value={usuario?.nombre_completo || usuario?.username || 'Usuario actual'}
                    readOnly
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'default' }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}
                >
                  Categoría del Problema
                </label>

                <select
                  value={formData.tipo_solicitud}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      tipo_solicitud: e.target.value,
                      implemento: ''
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    outlineColor: 'var(--accent-color)'
                  }}
                >
                  <option value="Soporte Técnico">
                    Soporte Técnico (General)
                  </option>

                  <option value="GPS No Reporta">
                    GPS No Reporta
                  </option>

                  <option value="Cámaras Desconectadas">
                    Cámaras Desconectadas
                  </option>

                  <option value="Mantenimiento de Equipo">
                    Mantenimiento de Equipo
                  </option>

                  <option value="Instalación de Software">
                    Instalación de Software
                  </option>

                  <option value="Otro">
                    Otro
                  </option>
                </select>
              </div>

              {renderImplementoField()}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem'
                }}
              >
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}>
                    Fecha de llegada de la unidad
                  </label>

                  <input
                    type="date"
                    required
                    value={formData.fecha_llegada_unidad}
                    onChange={event => setFormData({
                      ...formData,
                      fecha_llegada_unidad: event.target.value
                    })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}>
                    Hora de llegada de la unidad
                  </label>

                  <input
                    type="time"
                    required
                    value={formData.hora_llegada_unidad}
                    onChange={event => setFormData({
                      ...formData,
                      hora_llegada_unidad: event.target.value
                    })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Descripción Detallada</label>
                <textarea value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })} rows="4" placeholder="Describa el problema reportado de manera clara..." required style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical', outlineColor: 'var(--accent-color)' }}></textarea>
              </div>
              {renderTicketEvidenceField()}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #D1D5DB', color: '#374151', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
                <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2458e8', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(36,88,232,0.2)' }}>Guardar Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renderPulseraModal()}
      <SolicitudDescargaVideosModal
        open={showVideoDownloadModal}
        onClose={() =>
          setShowVideoDownloadModal(false)
        }
        usuario={usuario}
      />




      {/* Modal Ver Detalle de Ticket */}
      {selectedTicket && (
        <div onClick={() => setSelectedTicket(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '600px', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)', maxHeight: '90vh', overflowY: 'auto', animation: 'scaleUp 0.2s ease-out' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  <UiIcon name="clipboard" /> Ticket #TKT-{selectedTicket.id}
                </h2>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Creado el: {formatDate(selectedTicket.fecha_creacion)}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="ui-icon-button" aria-label="Cerrar"><UiIcon name="close" /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #E5E7EB' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Placa Asociada</span>
                  <span style={{ backgroundColor: '#eef3ff', color: '#2458e8', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem', display: 'inline-block' }}>
                    {selectedTicket.placa || 'No Registra'}
                  </span>
                </div>
                <div style={{ flex: 1, backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #E5E7EB' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Estado Actual</span>
                  <select
                    value={selectedTicket.estado}
                    onChange={(e) => { handleStatusChange(selectedTicket.id, e.target.value); setSelectedTicket({ ...selectedTicket, estado: e.target.value }); }}
                    disabled={!canManage}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1px solid transparent', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', outline: 'none', width: '100%',
                      backgroundColor: selectedTicket.estado === 'Pendiente' ? '#fdeae8' : selectedTicket.estado === 'En Proceso' ? '#fff6e4' : '#e7f9f1',
                      color: selectedTicket.estado === 'Pendiente' ? '#dc3b2a' : selectedTicket.estado === 'En Proceso' ? '#db8b0b' : '#0e9f6e'
                    }}>
                    <option value="Pendiente">Pendiente</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Resuelto">Resuelto</option>
                  </select>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--card-bg)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E5E7EB' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Detalles de la Solicitud</span>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Categoría: </span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{selectedTicket.tipo_solicitud}</span>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Solicitante: </span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>
                    {selectedTicket.nombre_completo || 'No especificado'}
                  </span>
                </div>
                {selectedTicket.implemento && (
                  <div style={{ marginBottom: '1rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Implemento: </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>{selectedTicket.implemento}</span>
                  </div>
                )}
                {getInitialEvidenceUrls(selectedTicket).length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #E5E7EB' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Evidencia adjunta al crear el ticket</span>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                      {getInitialEvidenceUrls(selectedTicket).map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" title={`Abrir evidencia ${index + 1}`}>
                          <img src={url} alt={`Evidencia ${index + 1}`} style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Descripción: </span>
                  <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '0.5rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontSize: '0.9rem' }}>
                    {selectedTicket.descripcion}
                  </div>
                </div>

                {getClosingEvidenceUrls(selectedTicket).length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #E5E7EB' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                      Evidencia Fotográfica de Resolución
                    </span>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                      {getClosingEvidenceUrls(selectedTicket).map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt={`Evidencia de resolución ${index + 1}`}
                            style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
              {isAdmin ? (
                <button type="button" onClick={() => { setSelectedTicket(null); handleDelete(selectedTicket.id); }} className="ui-button ui-button-danger"><UiIcon name="trash" /> Eliminar Ticket</button>
              ) : (
                <div></div>
              )}
              <button type="button" onClick={() => setSelectedTicket(null)} style={{ padding: '0.75rem 2rem', backgroundColor: '#101b33', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resolución (Adjuntar Evidencia) */}
      {showResolveModal && (
        <div onClick={() => setShowResolveModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,51,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(5px)', padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-color)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px -14px rgba(16,27,51,0.28)', animation: 'scaleUp 0.2s ease-out' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '.55rem' }}><UiIcon name="check" /> Resolver Ticket</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Adjunte una foto del trabajo realizado y/o un comentario opcional para el cierre.</p>

            <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Evidencia Fotográfica (Obligatoria)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setResolveFormData({ ...resolveFormData, evidencia: e.target.files[0] })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', borderRadius: '0.5rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Nota de Resolución (Opcional)</label>
                <textarea
                  value={resolveFormData.resolucion_desc}
                  onChange={(e) => setResolveFormData({ ...resolveFormData, resolucion_desc: e.target.value })}
                  placeholder="Se reemplazó el equipo dañado por uno nuevo..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #D1D5DB', minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowResolveModal(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid #D1D5DB', color: '#374151', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
                <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#0e9f6e', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(14,159,110,0.25)' }}>Cerrar Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
