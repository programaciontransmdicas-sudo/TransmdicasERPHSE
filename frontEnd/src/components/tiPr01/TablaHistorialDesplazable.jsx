import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function TablaHistorialDesplazable({ children }) {
  const flotante = useRef(null);
  const contenido = useRef(null);
  const espacio = useRef(null);

  useLayoutEffect(() => {
    const barra = flotante.current;
    const tabla = contenido.current;
    const relleno = espacio.current;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const rect = tabla.getBoundingClientRect();
      const limites = { left: 0, right: document.documentElement.clientWidth,
        top: 0, bottom: window.innerHeight };
      // El ERP desplaza su panel principal, no necesariamente la ventana.
      for (let padre = tabla.parentElement; padre; padre = padre.parentElement) {
        const estilo = getComputedStyle(padre);
        const borde = padre.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowX)) {
          limites.left = Math.max(limites.left, borde.left);
          limites.right = Math.min(limites.right, borde.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(estilo.overflowY)) {
          limites.top = Math.max(limites.top, borde.top);
          limites.bottom = Math.min(limites.bottom, borde.bottom);
        }
      }
      const izquierda = Math.max(rect.left, limites.left);
      const derecha = Math.min(rect.right, limites.right);
      const alto = 23;
      const seVeTabla = Math.min(rect.bottom, limites.bottom) - Math.max(rect.top, limites.top) > alto + 8;
      const desborda = tabla.scrollWidth > tabla.clientWidth;
      // Cuando el borde inferior ya está a mano, se usa la barra original de la tabla.
      barra.hidden = !desborda || !seVeTabla || derecha <= izquierda || rect.bottom <= limites.bottom;
      if (barra.hidden) return;
      barra.style.left = `${izquierda}px`;
      barra.style.top = `${limites.bottom - alto - 6}px`;
      barra.style.width = `${derecha - izquierda}px`;
      // Conserva el mismo recorrido incluso si un padre recorta parte de la tabla.
      relleno.style.width = `${tabla.scrollWidth - tabla.clientWidth + barra.clientWidth}px`;
      barra.scrollLeft = tabla.scrollLeft;
    };
    const programar = () => { if (!cuadro) cuadro = requestAnimationFrame(medir); };
    medir();
    const observador = new ResizeObserver(programar);
    observador.observe(tabla);
    if (tabla.firstElementChild) observador.observe(tabla.firstElementChild);
    document.addEventListener('scroll', programar, { capture: true, passive: true });
    window.addEventListener('resize', programar);
    return () => {
      observador.disconnect();
      document.removeEventListener('scroll', programar, true);
      window.removeEventListener('resize', programar);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);

  const sincronizar = (evento, destino) => {
    if (flotante.current.hidden) return;
    const posicion = evento.currentTarget.scrollLeft;
    if (destino.current.scrollLeft !== posicion) destino.current.scrollLeft = posicion;
  };

  return <>
    <div ref={contenido} className="ti-scroll" tabIndex={0}
      role="region" aria-label="Tabla del historial"
      onScroll={evento => sincronizar(evento, flotante)}>
      {children}
    </div>
    {createPortal(
      <div ref={flotante} className="ti ti-historial-scroll-flotante" tabIndex={0}
        role="region" aria-label="Desplazar horizontalmente el historial"
        title="Mover las columnas del historial"
        onScroll={evento => sincronizar(evento, contenido)}>
        <div ref={espacio} aria-hidden="true" />
      </div>, document.body
    )}
  </>;
}
