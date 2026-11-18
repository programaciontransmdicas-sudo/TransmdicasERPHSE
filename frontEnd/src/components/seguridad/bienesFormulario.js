export function nuevoId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const nuevaLinea = () => ({ id: nuevoId(), descripcion: '', cantidad: 1, seriesTexto: '' });
export const separarSeries = texto => String(texto || '').split(/[\r\n\t;]+/).map(s => s.trim()).filter(Boolean);
export function validarBienes(lineas) {
  if (!lineas.length) throw new Error('Agrega al menos un bien.');
  const seriesVistas = new Set();
  return lineas.map((b, i) => {
    const series = separarSeries(b.seriesTexto), cantidad = Number(b.cantidad), descripcion = b.descripcion.trim();
    if (!descripcion) throw new Error(`Completa la descripción del bien ${i + 1}.`);
    if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 1000000) throw new Error('Las cantidades deben ser enteros entre 1 y 1000000.');
    if (series.length > 10000 || series.some(s => s.length > 200)) throw new Error('Revisa las series: máximo 10000 por bien y 200 caracteres por serie.');
    if (series.length && series.length !== cantidad) throw new Error(`El bien ${i + 1} debe tener una serie por unidad o el campo de series vacío.`);
    for (const serie of series) {
      const clave = serie.toUpperCase();
      if (seriesVistas.has(clave)) throw new Error(`La serie ${serie} está repetida.`);
      seriesVistas.add(clave);
    }
    return { id: b.id, descripcion, cantidad, series };
  });
}
export function devueltos(registro, bien) {
  return (registro.retornos || []).flatMap(r => r.bienes || []).filter(b => b.bienId === bien.id).reduce((n, b) => n + Number(b.cantidad), 0);
}
export function seriesDevueltas(registro, bien) {
  return new Set((registro.retornos || []).flatMap(r => r.bienes || []).filter(b => b.bienId === bien.id).flatMap(b => b.series || []));
}
export function recogerRetorno(registro, seleccion) {
  const resultado = {};
  for (const bien of registro.bienes || []) {
    const elegido = seleccion[bien.id];
    if (!elegido) continue;
    const saldo = Number(bien.cantidad) - devueltos(registro, bien);
    if (bien.series?.length) {
      const series = elegido.series || [], usadas = seriesDevueltas(registro, bien);
      if (new Set(series).size !== series.length || series.some(s => !bien.series.includes(s) || usadas.has(s))) throw new Error('Revisa las series seleccionadas.');
      if (series.length) resultado[bien.id] = { series };
    } else {
      const cantidad = Number(elegido.cantidad || 0);
      if (!Number.isSafeInteger(cantidad) || cantidad < 0 || cantidad > saldo) throw new Error('La cantidad recibida supera el saldo pendiente o no es válida.');
      if (cantidad) resultado[bien.id] = { cantidad };
    }
  }
  if (!Object.keys(resultado).length) throw new Error('Selecciona al menos una unidad recibida.');
  return resultado;
}
export const ahoraPeru = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 16);
