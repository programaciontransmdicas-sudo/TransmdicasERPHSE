import { BASE_API_URL, fetchWithAuth } from './api';

const RAIZ = `${BASE_API_URL}/api/seguridad-patrimonial`;

function consulta(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== null && valor !== undefined && valor !== '') parametros.set(clave, String(valor));
  }
  return parametros.size ? `?${parametros}` : '';
}

async function leer(ruta, signal) {
  const respuesta = await fetchWithAuth(`${RAIZ}${ruta}`, { signal });
  const contenido = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !contenido) throw new Error(contenido?.error || 'No se pudo consultar Seguridad Patrimonial. Revisa que el backend del ERP esté actualizado.');
  return contenido;
}

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const seguridadApi = {
  buscarCatalogo: (tipo, texto, signal) =>
    leer(`/catalogos/${encodeURIComponent(tipo)}${consulta({ q: texto })}`, signal),
  async crear(tipo, datos, archivo, clave) {
    const cuerpo = new FormData();
    cuerpo.append('datos', JSON.stringify(datos));
    if (archivo) cuerpo.append(tipo === 'terceros' ? 'sctr' : 'sustento', archivo);
    return enviar(`/registros/${encodeURIComponent(tipo)}`, cuerpo, clave);
  },
  cerrar: (tipo, id, datos, clave) => enviar(`/registros/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}/${tipo === 'terceros' ? 'salida' : tipo === 'llaves' ? 'devolucion' : 'retorno'}`, JSON.stringify(datos), clave),
  resumen: (filtros, signal) => leer(`/resumen${consulta(filtros)}`, signal),
  listado: (tipo, filtros, signal) => leer(`/registros/${encodeURIComponent(tipo)}${consulta(filtros)}`, signal),
  detalle: (tipo, id, signal) => leer(`/registros/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}`, signal),
  async archivo(tipo, id, archivoId, signal) {
    const respuesta = await fetchWithAuth(`${RAIZ}/registros/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}/archivos/${encodeURIComponent(archivoId)}`, { signal });
    if (!respuesta.ok) {
      const contenido = await respuesta.json().catch(() => ({}));
      throw new Error(contenido.error || 'No se pudo recuperar el archivo.');
    }
    return respuesta.blob();
  },
  async exportar(tipo, filtros) {
    const respuesta = await fetchWithAuth(`${RAIZ}/registros/${encodeURIComponent(tipo)}/exportar${consulta(filtros)}`);
    if (!respuesta.ok) {
      const contenido = await respuesta.json().catch(() => ({}));
      throw new Error(contenido.error || 'No se pudo exportar el reporte.');
    }
    if (!respuesta.headers.get('Content-Type')?.includes('spreadsheetml')) throw new Error('El servidor no devolvió un archivo Excel válido.');
    descargarBlob(await respuesta.blob(), `seguridad-${tipo}.xlsx`);
  },
  descargarBlob,
};

async function enviar(ruta, body, clave) {
  const respuesta = await fetchWithAuth(`${RAIZ}${ruta}`, { method: 'POST', headers: { 'Idempotency-Key': clave }, body });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos) throw Object.assign(new Error(datos?.error || 'No se pudo confirmar el registro. Reintenta el mismo envío.'), { status: respuesta.ok ? 503 : respuesta.status });
  return datos;
}
