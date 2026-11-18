import { CONTROLES, fallo, validarFiltros, validarId, validarTipo } from './validaciones.js';

export function sanearDatos(valor) {
  if (Array.isArray(valor)) return valor.map(sanearDatos);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor)
      .filter(([clave]) => !/hash|token|public_?id|^url$|cloudinary|^_erp$/i.test(clave))
      .map(([clave, dato]) => [clave, sanearDatos(dato)]));
  }
  return valor;
}

export function crearServicio(repositorio) {
  return {
    async resumen(consulta) {
      const filtros = validarFiltros(consulta);
      const filas = await repositorio.resumen(filtros);
      const porTipo = new Map(filas.map(fila => [fila.tipo, fila]));
      const controles = CONTROLES.map(control => ({ ...control,
        total: Number(porTipo.get(control.id)?.total || 0),
        pendientes: Number(porTipo.get(control.id)?.pendientes || 0),
        anomalias: Number(porTipo.get(control.id)?.anomalias || 0),
      }));
      return { controles, total: controles.reduce((n, c) => n + c.total, 0), filtros };
    },
    async listar(tipo, consulta) {
      validarTipo(tipo);
      const filtros = validarFiltros(consulta);
      return { ...(await repositorio.listar(tipo, filtros)), pagina: filtros.pagina,
        limite: filtros.limite, tipo };
    },
    async detalle(tipo, id) {
      validarTipo(tipo);
      validarId(id);
      const [registro] = await repositorio.detalles(tipo, [id]);
      if (!registro) throw fallo('El registro no está disponible.', 404);
      const archivos = await repositorio.archivos(tipo, id, registro.base);
      return { id: registro.id, tipo, base: registro.base, creado_en: registro.creado_en,
        actualizado_en: registro.actualizado_en, revision: registro.revision,
        datos: sanearDatos(registro.datos), archivos };
    },
    async archivo(tipo, id, archivoId) {
      validarTipo(tipo);
      validarId(id);
      validarId(archivoId);
      const archivo = await repositorio.archivo(tipo, id, archivoId);
      if (!archivo) throw fallo('El archivo no pertenece a este registro o no está disponible.', 404);
      return archivo;
    },
    async exportar(tipo, consulta) {
      validarTipo(tipo);
      const filtros = validarFiltros(consulta);
      const listado = await repositorio.listar(tipo, filtros, { exportar: true });
      if (listado.total > 5000) throw fallo('La exportación admite hasta 5000 registros. Reduce el periodo o selecciona una base.', 413);
      const detalles = await repositorio.detalles(tipo, listado.registros.map(r => r.id));
      const datos = new Map(detalles.map(r => [r.id, sanearDatos(r.datos)]));
      return { tipo, filtros, registros: listado.registros.map(r => ({ ...r, datos: datos.get(r.id) || {} })) };
    },
  };
}
