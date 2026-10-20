import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { formatearPlaca } from '../utils/formatos';
import { CATALOGO_EQUIPOS, crearEquiposFormulario, limpiarObservacionesEquipo } from '../utils/equiposVehiculo';
import { EquiposVehiculoFields } from './EquiposVehiculoFields';

const ESTADOS = { INSTALADO: 'Instalado', NO_APLICA: 'No aplica', POR_VALIDAR: 'Por confirmar' };
const valor = dato => dato || 'Sin registrar';
const fecha = iso => iso ? iso.split('-').reverse().join('/') : 'Sin registrar';

export function InventarioVehiculo({ placa, puedeEditar = false }) {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null });
  const [revision, setRevision] = useState(0);
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    const cargar = async () => {
      try {
        const datos = await api.getEquiposVehiculo(placa, { signal: abort.signal });
        if (!abort.signal.aborted) setEstado({ cargando: false, error: '', datos });
      } catch (error) {
        if (!abort.signal.aborted) setEstado({ cargando: false, error: error.message, datos: null });
      }
    };
    cargar();
    return () => abort.abort();
  }, [placa, revision]);

  const guardar = async event => {
    event.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      await api.actualizarEquiposVehiculo(placa, edicion);
      setEdicion(null);
      setEstado({ cargando: true, error: '', datos: null });
      setRevision(r => r + 1);
      toast.success('Dispositivos actualizados');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGuardando(false);
    }
  };

  const equipos = estado.datos?.equipos || [];
  const camarasConfirmadas = estado.datos?.familias_confirmadas?.includes('CAMARAS') &&
    !equipos.some(e => ['CAMARA_INTERNA', 'CAMARA_EXTERNA'].includes(e.tipo_equipo) && e.estado_inventario === 'INSTALADO');

  return (
    <section className="inventario-unidad" aria-label="Dispositivos de la unidad">
      <div className="inventario-encabezado">
        <h3>Dispositivos de la unidad</h3>
        {puedeEditar && estado.datos && !estado.cargando && (
          <button type="button" className="ui-button ui-button-secondary"
            onClick={() => setEdicion(crearEquiposFormulario(equipos))}>Editar dispositivos</button>
        )}
      </div>
      {estado.cargando && <p role="status">Cargando dispositivos…</p>}
      {estado.error && <div role="alert">
        <p>{estado.error}</p>
        <button type="button" className="ui-button ui-button-secondary" onClick={() => {
          setEstado({ cargando: true, error: '', datos: null });
          setRevision(r => r + 1);
        }}>Reintentar</button>
      </div>}
      {!estado.cargando && estado.datos && (
        <>
          {!equipos.length && <p>No hay dispositivos registrados para esta unidad.</p>}
          {camarasConfirmadas && <p className="inventario-nota">
            La unidad tiene cámaras confirmadas. Falta completar su identificación y sus datos técnicos.
          </p>}
          <div className="inventario-tarjetas">
            {CATALOGO_EQUIPOS.map(([tipo, nombre]) => {
              const equipo = equipos.find(e => e.tipo_equipo === tipo);
              if (!equipo) return null;
              const observaciones = limpiarObservacionesEquipo(equipo.observaciones);
              return (
                <article className="inventario-tarjeta" key={equipo.id || tipo}>
                  <div className="inventario-equipo-titulo">
                    <h4>{nombre}</h4>
                    <span className={`inventario-estado estado-${equipo.estado_inventario.toLowerCase()}`}>
                      {ESTADOS[equipo.estado_inventario] || 'Por confirmar'}
                    </span>
                  </div>
                  {equipo.estado_inventario === 'INSTALADO' && <dl className="inventario-datos">
                    <div><dt>Marca</dt><dd>{valor(equipo.marca)}</dd></div>
                    <div><dt>Modelo</dt><dd>{valor(equipo.modelo)}</dd></div>
                    <div><dt>Número de serie</dt><dd>{valor(equipo.numero_serie)}</dd></div>
                    <div><dt>Instalación</dt><dd>{fecha(equipo.fecha_instalacion)}</dd></div>
                  </dl>}
                  {observaciones && <p className="inventario-observacion">{observaciones}</p>}
                </article>
              );
            })}
          </div>
        </>
      )}
      {edicion && (
        <div className="inventario-overlay">
          <div className="inventario-modal" role="dialog" aria-modal="true" aria-labelledby="inventario-editar-titulo">
            <header><h3 id="inventario-editar-titulo">Dispositivos de {formatearPlaca(placa)}</h3></header>
            <form onSubmit={guardar}>
              <div className="inventario-modal-cuerpo">
                <EquiposVehiculoFields equipos={edicion} onChange={setEdicion} disabled={guardando} />
              </div>
              <footer>
                <button type="button" className="ui-button ui-button-secondary" disabled={guardando}
                  onClick={() => setEdicion(null)}>Cancelar</button>
                <button type="submit" className="ui-button ui-button-success" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar dispositivos'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
