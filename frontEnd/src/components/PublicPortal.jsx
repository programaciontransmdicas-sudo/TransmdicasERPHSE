import React, { useState, useEffect } from 'react';
import { BASE_API_URL } from '../services/api';
import toast from 'react-hot-toast';

const TICKET_CATEGORIES = {
  "Equipos en Cabina (Mantenimiento)": [
    "Falla en Tablet (Piloto/Copiloto)",
    "Cambio/Reposición de Pulsera de Fatiga",
    "Falla en Radio Base / Intercomunicador",
    "Problemas con Cámaras (Internas/Externas)"
  ],
  "Apoyo Técnico - TELCOM (Instalaciones)": [
    "Instalación de Radio Base nueva",
    "Instalación de circuito de Cámaras",
    "Desinstalación / Retiro de equipos"
  ],
  "Sistemas de Terceros (Software/Sensores)": [
    "Mix Telematics: Soporte/Revisión ADAS"
  ],
  "Otros": ["Otro requerimiento técnico"]
};

export function PublicPortal({ onAdminClick, openSupportOnLoad = false }) {
  const [placa, setPlaca] = useState('');
  const [placasDisponibles, setPlacasDisponibles] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResultModal, setShowResultModal] = useState(false);

  const [stats, setStats] = useState({ totalFlota: 0, inspeccionesHoy: 0, ticker: [], trabajosTI: [] });
  const [recentSearches, setRecentSearches] = useState([]);

  // Estados del Formulario de Soporte
  const [showSupportModal, setShowSupportModal] = useState(openSupportOnLoad);
  const [supportData, setSupportData] = useState({
    placa: '',
    categoria: 'Equipos en Cabina (Mantenimiento)',
    tipo_solicitud: 'Falla en Tablet (Piloto/Copiloto)',
    prioridad: 'Media',
    descripcion: '',
    operador: ''
  });
  const [supportLoading, setSupportLoading] = useState(false);

  const closeSupportForm = () => {
    setShowSupportModal(false);
    if (openSupportOnLoad) onAdminClick?.();
  };

  useEffect(() => {
    // Cargar historial de busquedas
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch (e) { }
    }

    // Fetch Stats
    fetch(`${BASE_API_URL}/api/public/stats`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) setStats(data);
      })
      .catch(err => console.error('Error fetching public stats:', err));

    // Fetch Placas disponibles para el buscador
    fetch(`${BASE_API_URL}/api/public/placas`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPlacasDisponibles(data);
      })
      .catch(err => console.error('Error fetching placas:', err));
  }, []);

  const consultarPlaca = async (placaABuscar, guardarReciente = true) => {
    const placaNormalizada = String(placaABuscar || '').trim().toUpperCase();
    if (!placaNormalizada) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(
        `${BASE_API_URL}/api/public/consulta/${encodeURIComponent(placaNormalizada)}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Unidad no encontrada en nuestros registros.');
        }
        throw new Error('Error al consultar el estado de la unidad.');
      }

      const data = await res.json();
      setPlaca(placaNormalizada);
      setResult(data);
      setShowResultModal(true);

      if (guardarReciente) {
        setRecentSearches(prev => {
          const nuevos = [
            placaNormalizada,
            ...prev.filter(item => item !== placaNormalizada)
          ].slice(0, 5);

          localStorage.setItem('recentSearches', JSON.stringify(nuevos));
          return nuevos;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await consultarPlaca(placa);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const placaDesdeQR = params.get('placa');

    if (placaDesdeQR) {
      consultarPlaca(placaDesdeQR, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeSearch = (placaABuscar) => {
    setPlaca(placaABuscar);
    // Simular el submit del form
    const pseudoEvent = { preventDefault: () => { } };
    // Usar un timeout pequeño para que el estado se actualice antes del fetch (o pasarlo directo)
    setTimeout(() => {
      document.getElementById('btn-buscar-publico').click();
    }, 50);
  };

  const submitSupportForm = async (e) => {
    e.preventDefault();
    setSupportLoading(true);
    try {
      const res = await fetch(`${BASE_API_URL}/api/public/incidentes-soporte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supportData)
      });
      if (res.ok) {
        toast.success("Solicitud enviada correctamente a Base Zero.", { id: 'support-ticket' });
        closeSupportForm();
        setSupportData({
          placa: '',
          categoria: 'Equipos en Cabina (Mantenimiento)',
          tipo_solicitud: 'Falla en Tablet (Piloto/Copiloto)',
          prioridad: 'Media',
          descripcion: '',
          operador: ''
        });
      } else {
        toast.error("Error al enviar solicitud.", { id: 'support-ticket' });
      }
    } catch (error) {
      toast.error("Falla de red al enviar la solicitud.", { id: 'support-ticket' });
    } finally {
      setSupportLoading(false);
    }
  };

  const DynamicTruckBackground = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, overflow: 'hidden', pointerEvents: 'none', backgroundColor: '#101b33' }}>
      {/* Panning Background Image */}
      <div style={{
        position: 'absolute', top: '-5%', left: '-5%', width: '110vw', height: '110vh',
        backgroundImage: 'url(/bg-trucks.png)', backgroundSize: 'cover', backgroundPosition: 'center',
        animation: 'bg-pan 30s linear infinite alternate', opacity: 0.7
      }} />
      {/* Overlay Oscuro para legibilidad */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to bottom, rgba(16,27,51,0.55) 0%, rgba(16,27,51,0.92) 100%)' }} />

      {/* Glowing accents */}
      <div style={{ position: 'absolute', top: '10%', left: '10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(36,88,232,0.08) 0%, rgba(16,27,51,0) 60%)', borderRadius: '50%', animation: 'blob 15s infinite alternate' }} />
      <style>{`
        @keyframes bg-pan {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-2vw, -1vh) scale(1.05); }
        }
        @keyframes blob {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -50px) scale(1.1); }
          100% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes radar-pulse {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @media print {
          body * { visibility: hidden; }
          #carnet-digital, #carnet-digital * { visibility: visible; }
          #carnet-digital { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <DynamicTruckBackground />
      {/* BANDA FIESTAS PATRIAS */}
      <div style={{ width: '100%', height: '5px', background: 'linear-gradient(90deg, #101b33 0%, #2458e8 55%, #5b9bff 100%)', zIndex: 20 }}></div>
      {/* HEADER PÚBLICO */}
      <header style={{ backgroundColor: 'rgba(16, 27, 51, 0.45)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '1rem 1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 10, gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #2458e8 0%, #1a46c4 100%)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '1.4rem', boxShadow: '0 0 15px rgba(36, 88, 232, 0.4)' }}>J</div>
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: '1.2rem', letterSpacing: '0.05em', fontWeight: '700' }}>ERPHSE</h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600' }}>Sistema de Control de Flotas / HSE-TI</p>
          </div>
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(220, 38, 38, 0.4)', padding: '0.4rem 1.5rem', borderRadius: '20px', backdropFilter: 'blur(5px)', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.1)' }} className="fiestas-patrias-badge">
          <span style={{ fontSize: '1.2rem', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.5))' }}>🇵🇪</span>
          <span style={{ color: 'white', fontWeight: 'bold', letterSpacing: '0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>¡Felices Fiestas Patrias!</span>
          <span style={{ fontSize: '1.2rem', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.5))' }}>🇵🇪</span>
          <style>{`
            @media (max-width: 768px) {
              .fiestas-patrias-badge { display: none !important; }
            }
          `}</style>
        </div>
        {/* EN MÓVILES MOSTRAMOS EL TEXTO DEBAJO DEL HEADER O INTEGRADO */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onAdminClick}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.3s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(36, 88, 232, 0.15)'; e.currentTarget.style.borderColor = 'rgba(36, 88, 232, 0.4)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(36, 88, 232, 0.2)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <span></span> Acceso Corporativo
          </button>
        </div>
      </header>

      {/* MENSAJE MÓVIL FIESTAS PATRIAS */}
      <div className="mobile-fiestas-patrias" style={{ display: 'none', width: '100%', background: 'linear-gradient(90deg, rgba(220,38,38,0.8) 0%, rgba(255,255,255,0.1) 50%, rgba(220,38,38,0.8) 100%)', padding: '0.4rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', zIndex: 9 }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>🇵🇪 ¡Felices Fiestas Patrias Perú! 🇵🇪</span>
        <style>{`
          @media (max-width: 768px) {
            .mobile-fiestas-patrias { display: block !important; }
          }
        `}</style>
      </div>

      {/* ÁREA PRINCIPAL SIMPLIFICADA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 10 }}>
        <h2 style={{ fontSize: '3rem', fontWeight: '700', color: 'white', margin: '0 0 1rem 0', textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.35)', letterSpacing: '-0.02em' }}>ERPHSE</h2>
        <p style={{ color: '#cbd5e1', fontSize: '1.2rem', marginBottom: '2rem', textAlign: 'center', maxWidth: '600px', lineHeight: '1.6' }}>
          Sistema de Control de Flotas y Gestión HSE-TI. <br /> Por favor inicie sesión para acceder al sistema interno.
        </p>
        <button
          onClick={onAdminClick}
          style={{ background: 'linear-gradient(135deg, #2458e8 0%, #1a46c4 100%)', border: 'none', color: 'white', padding: '1rem 2rem', borderRadius: '1rem', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'transform 0.2s', boxShadow: '0 10px 25px rgba(36, 88, 232, 0.35)' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span></span> Iniciar Sesión Segura
        </button>
      </main>

      {/* FLOATING SOS BUTTON */}
      <button
        onClick={() => setShowSupportModal(true)}
        style={{ position: 'fixed', bottom: '3rem', left: '1.5rem', zIndex: 50, backgroundColor: '#dc3b2a', color: 'white', border: 'none', borderRadius: '3rem', padding: '1rem 1.5rem', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 10px 25px rgba(220, 59, 42, 0.35)', transition: 'transform 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05) translateY(-5px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
      >
        <span style={{ fontSize: '1.5rem' }}>🚨</span> Reportar Falla en mi Unidad
      </button>

      {/* MODAL RESULTADO (CARNET DIGITAL) */}
      {showResultModal && result && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div id="carnet-digital" style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '500px', borderRadius: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden', border: '2px solid #2458e8', animation: 'blob 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', position: 'relative' }}>

            {/* Cerrar modal */}
            <button className="no-print" onClick={() => setShowResultModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>X</button>

            {/* Cabecera del Carnet */}
            <div style={{ backgroundColor: result.estado_general === 'APROBADO' ? '#0e9f6e' : '#dc3b2a', color: 'white', padding: '2rem 1.5rem 1.5rem 1.5rem', textAlign: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '1rem', left: '1rem', fontSize: '0.7rem', opacity: 0.8, letterSpacing: '2px', fontFamily: 'monospace' }}>ERPHSE</div>
              <h3 style={{ fontSize: '2.5rem', margin: 0, fontWeight: '900', letterSpacing: '2px', textShadow: '0 2px 5px rgba(0,0,0,0.3)' }}>{result.placa}</h3>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.25rem', fontWeight: '800', textTransform: 'uppercase', background: 'rgba(0,0,0,0.2)', display: 'inline-block', padding: '0.2rem 1rem', borderRadius: '2rem' }}>
                ESTADO: {result.estado_general}
              </p>
            </div>

            <div style={{ padding: '1.5rem' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Última Inspección</p>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{result.fecha} {result.hora}</p>
                </div>
                {/* QR Mockup */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${window.location.origin}/?placa=${encodeURIComponent(result.placa)}`)}&color=0f172a&bgcolor=ffffff`}
                  alt={`QR de la unidad ${result.placa}`}
                  title={`Abrir ficha de ${result.placa}`}
                  style={{
                    borderRadius: '0.5rem',
                    border: '2px solid #e2e8f0',
                    padding: '2px',
                    width: '80px',
                    height: '80px'
                  }}
                />
              </div>

              {/* Componentes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <div style={{ textAlign: 'center', padding: '0.75rem 0.25rem', backgroundColor: 'var(--bg-color)', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 'bold', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cámaras</p>
                  <span style={{ color: result.camaras === 'OK' || result.camaras === 'NO APLICA' || result.camaras === 'N/A' ? '#0e9f6e' : '#dc3b2a', fontWeight: 'bold', fontSize: '0.9rem' }}>{result.camaras}</span>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem 0.25rem', backgroundColor: 'var(--bg-color)', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 'bold', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Radio</p>
                  <span style={{ color: result.radio === 'OK' || result.radio === 'NO APLICA' || result.radio === 'N/A' ? '#0e9f6e' : '#dc3b2a', fontWeight: 'bold', fontSize: '0.9rem' }}>{result.radio}</span>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem 0.25rem', backgroundColor: 'var(--bg-color)', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 'bold', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Tablet</p>
                  <span style={{ color: result.tablet === 'OK' || result.tablet === 'NO APLICA' || result.tablet === 'N/A' ? '#0e9f6e' : '#dc3b2a', fontWeight: 'bold', fontSize: '0.9rem' }}>{result.tablet}</span>
                </div>
              </div>

              {/* TIMELINE */}
              {result.timeline && result.timeline.length > 0 && (
                <div style={{ marginBottom: '1.5rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', margin: '0 0 0.75rem 0', textTransform: 'uppercase' }}>Historial Reciente</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {result.timeline.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155' }}>
                        <span style={{ color: item.estado === 'APROBADO' ? '#0e9f6e' : '#ef4444', fontSize: '1rem' }}>{item.estado === 'APROBADO' ? '🟢' : '🔴'}</span>
                        <strong>{item.fecha}</strong> ({item.hora}) - {item.estado}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TICKET ACTIVO */}
              {result.incidente_pendiente && result.incidente_pendiente.estado !== 'Resuelto' && (
                <div style={{ marginBottom: '1.5rem', backgroundColor: '#fff6e4', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #f5deac' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#db8b0b', margin: 0, textTransform: 'uppercase' }}>
                      Ticket de Soporte Activo
                    </h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: '#a8650a' }}>
                    <div><strong>Estado:</strong> <span style={{ backgroundColor: '#f5deac', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>{result.incidente_pendiente.estado}</span></div>
                    <div><strong>Requerimiento:</strong> {result.incidente_pendiente.tipo_solicitud}</div>
                    <div><strong>Registrado el:</strong> {String(result.incidente_pendiente.fecha).split('T')[0]}</div>
                  </div>
                </div>
              )}

              {/* Evidencias Fotográficas */}
              <h4 className="no-print" style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>Evidencia Fotográfica</h4>
              <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {result.fotos.map((foto, idx) => (
                  foto.url ? (
                    <div key={idx} style={{ textAlign: 'center' }}>
                      <a href={foto.url} target="_blank" rel="noreferrer">
                        <img src={foto.url} alt={foto.tipo} style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }} />
                      </a>
                    </div>
                  ) : (
                    <div key={idx} style={{ textAlign: 'center', height: '70px', backgroundColor: '#f1f5f9', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.7rem', border: '1px dashed #cbd5e1' }}>
                      Sin Foto
                    </div>
                  )
                ))}
              </div>

              {/* Botones de Acción */}
              <div className="no-print" style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => window.print()}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
                  <span>🖨️</span> Imprimir
                </button>
                <button
                  onClick={() => { setShowResultModal(false); setSupportData({ ...supportData, placa: result.placa }); setShowSupportModal(true); }}
                  style={{ flex: 2, backgroundColor: '#2458e8', color: '#ffffff', border: 'none', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
                  <span>🔧</span> Solicitar Soporte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SOPORTE */}
      {showSupportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '2rem', borderRadius: '1rem', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Solicitud de Soporte TI</h3>
            <form onSubmit={submitSupportForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Placa de la Unidad</label>
                <input required type="text" value={supportData.placa} onChange={e => setSupportData({ ...supportData, placa: e.target.value.toUpperCase() })} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', textTransform: 'uppercase' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Categoría Principal</label>
                <select
                  value={supportData.categoria}
                  onChange={e => {
                    const newCat = e.target.value;
                    setSupportData({ ...supportData, categoria: newCat, tipo_solicitud: TICKET_CATEGORIES[newCat][0] });
                  }}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                >
                  {Object.keys(TICKET_CATEGORIES).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Requerimiento Específico</label>
                  <select
                    value={supportData.tipo_solicitud}
                    onChange={e => setSupportData({ ...supportData, tipo_solicitud: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                  >
                    {TICKET_CATEGORIES[supportData.categoria]?.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Prioridad</label>
                  <select
                    value={supportData.prioridad}
                    onChange={e => setSupportData({ ...supportData, prioridad: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                  >
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Descripción / Detalles</label>
                <textarea required rows="3" value={supportData.descripcion} onChange={e => setSupportData({ ...supportData, descripcion: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', resize: 'none' }} placeholder="Detalle su requerimiento..."></textarea>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#374151' }}>Nombre del Operador (Opcional)</label>
                <input type="text" value={supportData.operador} onChange={e => setSupportData({ ...supportData, operador: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} placeholder="Ej. Juan Pérez" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={closeSupportForm} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Cancelar</button>
                <button type="submit" disabled={supportLoading} style={{ padding: '0.75rem 1.5rem', background: '#2458e8', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: supportLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{supportLoading ? 'Enviando...' : 'Enviar Solicitud'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
