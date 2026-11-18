import { randomUUID } from "node:crypto";
import { exigir, fechaPosterior } from "./primitivas.js";
export function bienesValidados(bienes) {
  const ids = new Set(),
    series = new Set();
  return bienes.map((b) => {
    const id = b.id || randomUUID();
    exigir(!ids.has(id), "Hay identificadores de bienes repetidos.");
    ids.add(id);
    exigir(
      !b.series.length || b.series.length === b.cantidad,
      "Cada bien serializado requiere una serie por unidad.",
    );
    for (const serie of b.series) {
      const k = serie.toUpperCase();
      exigir(!series.has(k), `La serie ${serie} está repetida.`);
      series.add(k);
    }
    return { ...b, id };
  });
}
export function registrarRetorno(actual, datos) {
  exigir(
    actual.estado === "Pendiente de retorno",
    "Este movimiento ya está cerrado.",
    409,
  );
  fechaPosterior(datos.retorno, actual.fecha);
  for (const previo of actual.retornos || [])
    fechaPosterior(datos.retorno, previo.retorno);
  const bienes = [];
  for (const id of Object.keys(datos.seleccion))
    exigir(
      actual.bienes.some((b) => b.id === id),
      "La selección incluye un bien ajeno al movimiento.",
    );
  for (const b of actual.bienes) {
    const seleccion = datos.seleccion[b.id];
    if (!seleccion) continue;
    const recibidos = (actual.retornos || [])
      .flatMap((r) => r.bienes)
      .filter((r) => r.bienId === b.id);
    const saldo = b.cantidad - recibidos.reduce((n, r) => n + r.cantidad, 0);
    if (b.series.length) {
      const usadas = new Set(recibidos.flatMap((r) => r.series)),
        nuevas = seleccion.series || [];
      exigir(
        !seleccion.cantidad || seleccion.cantidad === nuevas.length,
        "Revise la cantidad y las series recibidas.",
      );
      exigir(
        new Set(nuevas).size === nuevas.length &&
          nuevas.every((s) => b.series.includes(s) && !usadas.has(s)),
        "Hay series desconocidas, repetidas o ya devueltas.",
      );
      if (nuevas.length)
        bienes.push({
          bienId: b.id,
          descripcion: b.descripcion,
          cantidad: nuevas.length,
          series: nuevas,
        });
    } else {
      exigir(!seleccion.series?.length, "Este bien se devuelve por cantidad.");
      const cantidad = seleccion.cantidad || 0;
      exigir(
        cantidad <= saldo,
        "La cantidad recibida supera el saldo pendiente.",
      );
      if (cantidad)
        bienes.push({
          bienId: b.id,
          descripcion: b.descripcion,
          cantidad,
          series: [],
        });
    }
  }
  exigir(bienes.length > 0, "Seleccione al menos una unidad recibida.");
  const { revision: _revision, seleccion: _seleccion, ...cabecera } = datos;
  const retornos = [...(actual.retornos || []), { ...cabecera, bienes }];
  const faltan = actual.bienes.reduce(
    (n, b) =>
      n +
      b.cantidad -
      retornos
        .flatMap((r) => r.bienes)
        .filter((v) => v.bienId === b.id)
        .reduce((m, v) => m + v.cantidad, 0),
    0,
  );
  return {
    ...actual,
    retorno: datos.retorno,
    retornos,
    estado: faltan === 0 ? "Retornado" : "Pendiente de retorno",
  };
}
