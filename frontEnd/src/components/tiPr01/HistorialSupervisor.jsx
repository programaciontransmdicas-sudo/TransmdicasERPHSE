import { useEffect, useState } from 'react';
import { apiTiPr01 } from '../../services/api';
import { HistorialTiPr01 } from './HistorialTiPr01';
import { DetalleOrden } from './OrdenesTiPr01';

export function HistorialSupervisor() {
  const [destino, setDestino] = useState(null);
  const [orden, setOrden] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!destino) return;
    let activo = true;
    apiTiPr01.obtenerOrdenTrabajo(destino.programaId, destino.programacionId, destino.otId)
      .then(datos => { if (activo) setOrden(datos); })
      .catch(e => { if (activo) setError(e.message); });
    return () => { activo = false; };
  }, [destino]);
  const volver = () => { setDestino(null); setOrden(null); setError(''); };
  return <>
    <div hidden={Boolean(destino)}>
      <HistorialTiPr01 soloLectura onIrAOrden={setDestino} />
    </div>
    {destino && !orden && <div className="ti-card ti-pad">
      <button type="button" className="ti-btn" onClick={volver}>← Volver al historial</button>
      {error ? <p role="alert">{error}</p> : <p>Cargando orden de trabajo…</p>}
    </div>}
    {destino && orden && <DetalleOrden soloLectura programaId={destino.programaId}
      orden={orden} visita={destino.visita} onVolver={volver} />}
  </>;
}
