import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function TablaSeguridad({ children, nombre }) {
  const contenido = useRef(null), flotante = useRef(null), espacio = useRef(null);
  useLayoutEffect(() => {
    const tabla = contenido.current, barra = flotante.current;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const rect = tabla.getBoundingClientRect();
      const limites = { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: window.innerHeight };
      for (let padre = tabla.parentElement; padre; padre = padre.parentElement) {
        const estilo = getComputedStyle(padre), borde = padre.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowX)) {
          limites.left = Math.max(limites.left, borde.left); limites.right = Math.min(limites.right, borde.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowY)) {
          limites.top = Math.max(limites.top, borde.top); limites.bottom = Math.min(limites.bottom, borde.bottom);
        }
      }
      const izquierda = Math.max(rect.left, limites.left), derecha = Math.min(rect.right, limites.right);
      const visible = Math.min(rect.bottom, limites.bottom) - Math.max(rect.top, limites.top) > 31;
      barra.hidden = tabla.scrollWidth <= tabla.clientWidth || !visible || derecha <= izquierda || rect.bottom <= limites.bottom;
      if (barra.hidden) return;
      barra.style.left = `${izquierda}px`; barra.style.top = `${limites.bottom - 29}px`; barra.style.width = `${derecha - izquierda}px`;
      espacio.current.style.width = `${tabla.scrollWidth - tabla.clientWidth + barra.clientWidth}px`;
      barra.scrollLeft = tabla.scrollLeft;
    };
    const programar = () => { if (!cuadro) cuadro = requestAnimationFrame(medir); };
    medir();
    const observador = new ResizeObserver(programar);
    observador.observe(tabla);
    if (tabla.firstElementChild) observador.observe(tabla.firstElementChild);
    document.addEventListener('scroll', programar, { capture: true, passive: true });
    window.addEventListener('resize', programar);
    return () => { observador.disconnect(); document.removeEventListener('scroll', programar, true); window.removeEventListener('resize', programar); if (cuadro) cancelAnimationFrame(cuadro); };
  }, []);
  function sincronizar(evento, destino) {
    if (flotante.current.hidden) return;
    if (destino.current.scrollLeft !== evento.currentTarget.scrollLeft) destino.current.scrollLeft = evento.currentTarget.scrollLeft;
  }
  return <>
    <div ref={contenido} className="sp-table-scroll" role="region" aria-label={`Tabla de ${nombre}`} tabIndex={0} onScroll={e => sincronizar(e, flotante)}>{children}</div>
    {createPortal(<div ref={flotante} className="sp-floating-scroll" tabIndex={0} hidden role="region" aria-label="Mover columnas de Seguridad Patrimonial" onScroll={e => sincronizar(e, contenido)}><div ref={espacio} aria-hidden="true"/></div>, document.body)}
  </>;
}
