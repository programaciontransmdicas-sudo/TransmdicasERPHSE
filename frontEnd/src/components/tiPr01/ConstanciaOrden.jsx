import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarConstancia, codigoOrden, fechaConstancia } from './constanciaOt';
import { ETIQUETA_EQUIPO, etiquetaEstado, quincenaDe } from './dominio';

function Documento({ datos, programa, onCerrar }) {
  const { orden, visita, evidencias, consultada } = datos;
  const nodo = useRef(null);
  const cerrada = orden.estado === 'CERRADA';
  const anulada = orden.estado === 'ANULADA';
  const codigo = codigoOrden(orden);
  useEffect(() => {
    const anterior = document.activeElement;
    const titulo = document.title;
    const overflow = document.body.style.overflow;
    document.title = `${codigo} · ${orden.unidad?.placa || 'Orden de trabajo'}`;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('ti-constancia-activa');
    nodo.current?.focus();
    const teclado = event => {
      if (event.key === 'Escape') onCerrar();
      if (event.key !== 'Tab') return;
      const controles = [...nodo.current.querySelectorAll('button')];
      const primero = controles[0], ultimo = controles.at(-1);
      if (event.shiftKey && (document.activeElement === primero || document.activeElement === nodo.current)) {
        event.preventDefault(); ultimo.focus();
      } else if (!event.shiftKey && (document.activeElement === ultimo || document.activeElement === nodo.current)) {
        event.preventDefault(); primero.focus();
      }
    };
    document.addEventListener('keydown', teclado);
    return () => {
      document.removeEventListener('keydown', teclado);
      document.title = titulo;
      document.body.style.overflow = overflow;
      document.body.classList.remove('ti-constancia-activa');
      anterior?.focus();
    };
  }, [codigo, orden.unidad?.placa, onCerrar]);
  const detalle = orden.detalles?.items || [];
  return createPortal(
    <div className="ti-constancia-overlay">
      <style media="print">{'@page { size: A4; margin: 18mm; }'}</style>
      <article ref={nodo} tabIndex={-1} className="ti-constancia" role="dialog" aria-modal="true" aria-labelledby="constancia-titulo">
        <div className="ti-constancia-controls">
          <button type="button" onClick={() => window.print()}>Imprimir</button>
          <button type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        <header>
          <div><strong>TRANSMDICAS S.R.L.</strong><p>{programa.codigo || 'Programa de mantenimiento'}</p></div>
          <div className="ti-constancia-codigo"><strong>{codigo}</strong><p>{etiquetaEstado(orden.estado)}</p></div>
        </header>
        <h1 id="constancia-titulo">{cerrada ? 'Constancia de orden de trabajo' : 'Reporte de orden de trabajo'}</h1>
        {!cerrada && <p className="ti-constancia-aviso">
          {anulada ? 'ORDEN ANULADA · Este documento no acredita la ejecución del mantenimiento.' : 'ORDEN ABIERTA · Reporte provisional de resultados registrados; no acredita el cierre.'}
        </p>}
        <dl className="ti-constancia-datos">
          <div><dt>Unidad</dt><dd>{orden.unidad?.placa || 'No registrada'}</dd></div>
          <div><dt>Técnico ejecutor</dt><dd>{orden.tecnico?.nombre || (orden.tecnico ? `Personal #${orden.tecnico.id}` : 'Sin asignar')}</dd></div>
          <div><dt>Apertura</dt><dd>{fechaConstancia(orden.fecha_apertura)}</dd></div>
          <div><dt>Cierre</dt><dd>{fechaConstancia(orden.fecha_cierre)}</dd></div>
          <div><dt>Fecha de ejecución</dt><dd>{fechaConstancia(visita.fecha_ejecucion)}</dd></div>
          <div><dt>Tiempo registrado</dt><dd>{orden.minutos == null ? 'No registrado' : `${orden.minutos} minutos`}</dd></div>
          <div><dt>Quincena de la visita</dt><dd>{quincenaDe(visita.quincena_efectiva)?.labelLargo || 'No registrada'}</dd></div>
          <div><dt>Cierre registrado por</dt><dd>{orden.cerrada_por?.nombre || orden.cerrada_por?.username || 'No registrado'}</dd></div>
        </dl>
        <h2>Resultados por equipo</h2>
        <table>
          <thead><tr><th>Equipo</th><th>Previsto</th><th>Completado</th><th>Resultado</th><th>Fotos activas</th></tr></thead>
          <tbody>{detalle.map(item => {
            const apartado = evidencias.apartados?.find(a => a.detalle_id === item.id);
            return <tr key={item.id}>
              <td>{ETIQUETA_EQUIPO[item.tipo_equipo] || item.tipo_equipo}</td>
              <td>{item.nivel_programado || '—'}</td><td>{item.nivel_completado || '—'}</td>
              <td>{etiquetaEstado(item.estado)}</td>
              <td>{!apartado ? 'No disponible' : apartado.admite_evidencia ? `${apartado.activas}/${apartado.maximo}` : 'No corresponde'}</td>
            </tr>;
          })}</tbody>
        </table>
        {!detalle.length && <p>La orden no tiene resultados por equipo registrados.</p>}
        <h2>Observaciones</h2>
        <p className="ti-constancia-texto">{orden.observaciones || 'Sin observaciones generales.'}</p>
        {detalle.filter(item => item.observaciones).map(item => <section className="ti-constancia-observacion" key={item.id}>
          <h3>{ETIQUETA_EQUIPO[item.tipo_equipo] || item.tipo_equipo}</h3>
          <p className="ti-constancia-texto">{item.observaciones}</p>
        </section>)}
        {anulada && <section><h2>Motivo de anulación</h2><p className="ti-constancia-texto">{orden.motivo_anulacion || 'No registrado'}</p></section>}
        <footer>
          <p>Consulta del ERP: {fechaConstancia(consultada)} · Hora de Perú.</p>
          <p>Referencia {codigo} · Programa #{programa.id} · Visita #{orden.programacion_id} · OT #{orden.id}.</p>
          <p>Las fotografías se consultan en la galería de la orden. Este documento no incorpora firma digital.</p>
        </footer>
      </article>
    </div>, document.body
  );
}

export function ConstanciaOrden({ programa, orden, bloqueado }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const vivo = useRef(true);
  const ocupado = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const generar = async () => {
    if (ocupado.current || bloqueado) return;
    ocupado.current = true; setCargando(true); setError(null);
    try {
      const respuesta = await cargarConstancia(programa.id, orden);
      if (vivo.current) setDatos(respuesta);
    } catch (e) {
      if (vivo.current) setError(e.message);
    } finally {
      ocupado.current = false;
      if (vivo.current) setCargando(false);
    }
  };
  return <>
    <button type="button" className="ti-btn" disabled={bloqueado || cargando} onClick={generar}>
      {cargando ? 'Preparando constancia…' : orden.estado === 'CERRADA' ? 'Ver constancia / imprimir' : 'Ver reporte / imprimir'}
    </button>
    {error && <span role="alert" className="ti-error">{error}</span>}
    {datos && <Documento datos={datos} programa={programa} onCerrar={() => setDatos(null)} />}
  </>;
}
