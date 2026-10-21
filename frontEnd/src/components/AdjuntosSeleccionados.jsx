import { useEffect, useRef } from 'react';

function ImagenSeleccionada({ archivo }) {
  const imagen = useRef(null);

  useEffect(() => {
    const nodo = imagen.current;
    const url = URL.createObjectURL(archivo);
    if (nodo) nodo.src = url;
    return () => {
      if (nodo) nodo.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [archivo]);

  return (
    <img
      ref={imagen}
      alt={`Vista previa de ${archivo.name}`}
      style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 6 }}
    />
  );
}

export function AdjuntosSeleccionados({ archivos = [], onQuitar, disabled = false }) {
  if (!archivos.length) return null;

  return (
    <ul
      aria-label="Archivos seleccionados"
      style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.65rem' }}
    >
      {archivos.map((archivo, index) => (
        <li
          key={`${archivo.name}-${archivo.size}-${archivo.lastModified}-${index}`}
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.65rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        >
          {archivo.type.startsWith('image/')
            ? <ImagenSeleccionada archivo={archivo} />
            : <span aria-hidden="true" style={{ padding: '0.75rem', fontWeight: 600 }}>PDF</span>}
          <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.8rem' }}>
            {archivo.name}
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Quitar archivo ${archivo.name}`}
            onClick={() => onQuitar(index)}
            style={{ padding: '0.45rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}
