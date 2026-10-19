// Solo presentación. Las claves enviadas a la API conservan su valor original.
export function formatearPlaca(valor) {
  const original = String(valor ?? '').trim().toUpperCase();
  const compacta = original.replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6}$/.test(compacta)
    ? `${compacta.slice(0, 3)}-${compacta.slice(3)}`
    : original;
}
