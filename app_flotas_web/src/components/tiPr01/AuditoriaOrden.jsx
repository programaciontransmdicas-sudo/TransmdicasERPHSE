import { useEffect, useState } from 'react';
import { apiTiPr01 } from '../../services/api';
import { fechaConstancia } from './constanciaOt';

const CATEGORIAS = {
  ordenes_trabajo: 'Orden de trabajo',
  ordenes_trabajo_detalle: 'Resultado por equipo',
  ordenes_trabajo_evidencias: 'Fotografías',
  programacion_mantenimiento: 'Programación de la visita'
};

export function AuditoriaOrden({ programaId, orden }) {
  const [visible, setVisible] = useState(false);
  const [borrador, setBorrador] = useState({ busqueda: '', desde: '', hasta: '' });
  const [filtros, setFiltros] = useState({ busqueda: '', desde: '', hasta: '', desplazamiento: 0 });
  const [respuesta, setRespuesta] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let activo = true;
    const controller = new AbortController();
    // La carga se programa fuera del montaje para poder cancelar al cerrar el panel.
    Promise.resolve().then(async () => {
      if (!activo) return;
      setCargando(true); setError(null); setRespuesta(null);
      try {
        const datos = await apiTiPr01.listarAuditoriaOrden(programaId, orden.programacion_id, orden.id, { ...filtros, limite: 25 }, controller.signal);
        if (activo) setRespuesta(datos);
      } catch (e) {
        if (activo && e.name !== 'AbortError') setError(e.message);
      } finally {
        if (activo) setCargando(false);
      }
    });
    return () => { activo = false; controller.abort(); };
  }, [visible, programaId, orden.id, orden.programacion_id, filtros, revision]);
  const aplicar = event => {
    event.preventDefault();
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setError('La fecha inicial no puede ser posterior a la final.'); return;
    }
    setFiltros({ ...borrador, busqueda: borrador.busqueda.trim(), desplazamiento: 0 });
  };
  const inicio = respuesta?.total ? filtros.desplazamiento + 1 : 0;
  return <section className="ti-card" style={{ marginTop: 12 }}>
    <h3>Auditoría de la OT y su visita</h3>
    <div className="ti-pad">
      <button type="button" className="ti-btn" aria-expanded={visible} onClick={() => setVisible(v => !v)}>
        {visible ? 'Ocultar movimientos' : 'Ver movimientos'}
      </button>
      {visible && <>
        <p className="ti-smalltxt">Movimientos registrados, del más reciente al más antiguo. Fechas en hora de Perú.</p>
        <form className="ti-audit-filters" onSubmit={aplicar}>
          <label className="ti-field"><span>Acción o usuario</span><input value={borrador.busqueda} maxLength={120} onChange={e => setBorrador({ ...borrador, busqueda: e.target.value })} /></label>
          <label className="ti-field"><span>Desde</span><input type="date" value={borrador.desde} onChange={e => setBorrador({ ...borrador, desde: e.target.value })} /></label>
          <label className="ti-field"><span>Hasta</span><input type="date" value={borrador.hasta} onChange={e => setBorrador({ ...borrador, hasta: e.target.value })} /></label>
          <button className="ti-btn primary" disabled={cargando} type="submit">Buscar</button>
          <button className="ti-btn" disabled={cargando} type="button" onClick={() => setRevision(r => r + 1)}>Actualizar</button>
        </form>
        {cargando && <p role="status">Cargando movimientos…</p>}
        {error && <div className="ti-badbox" role="alert">{error}</div>}
        {!cargando && respuesta && <>
          {!respuesta.movimientos.length ? <p className="ti-empty">No hay movimientos registrados para estos filtros.</p> : <div className="ti-audit-table">
            <table className="ti-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Área del movimiento</th><th>Acción registrada</th></tr></thead>
              <tbody>{respuesta.movimientos.map(item => <tr key={item.id}>
                <td>{fechaConstancia(item.fecha)}</td>
                <td>{item.nombre || item.username || (item.user_id ? `Usuario #${item.user_id}` : 'Sistema / usuario no registrado')}</td>
                <td>{CATEGORIAS[item.tabla_afectada] || 'Mantenimiento'}</td>
                <td className="ti-audit-action">{item.accion || 'Sin descripción'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="ti-bar" style={{ marginTop: 12 }}>
            <span>{inicio}–{Math.min(filtros.desplazamiento + respuesta.movimientos.length, respuesta.total)} de {respuesta.total}</span>
            <button type="button" className="ti-btn" disabled={cargando || !filtros.desplazamiento} onClick={() => setFiltros({ ...filtros, desplazamiento: Math.max(0, filtros.desplazamiento - 25) })}>Anterior</button>
            <button type="button" className="ti-btn" disabled={cargando || filtros.desplazamiento + 25 >= respuesta.total} onClick={() => setFiltros({ ...filtros, desplazamiento: filtros.desplazamiento + 25 })}>Siguiente</button>
          </div>
        </>}
      </>}
    </div>
  </section>;
}
