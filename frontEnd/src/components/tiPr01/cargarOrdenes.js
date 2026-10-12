// TI-PR-01 · CARGA DE PROGRAMA + ÓRDENES
// ============================================================================
// Extraído de la pantalla de Órdenes (F2.1) para que Historial (F3) no duplique la misma
// conversación con el backend. Es una función PURA de red: no toca estado de React, no
// conoce componentes y lanza su error para que cada pantalla lo pinte a su manera.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ HACEN FALTA DOS PASOS
// ─────────────────────────────────────────────────────────────────────────────
// No existe un listado global de órdenes: la ruta cuelga de una programación concreta. Lo
// que sí publica el listado de programación es, por visita,
// `ordenes_trabajo.{total,abiertas,cerradas,anuladas,no_anuladas}`. Así que se barre la
// programación una vez y solo se pide el histórico a las visitas que declaran al menos una
// orden.
//
// El número de peticiones lo marca entonces la cantidad real de ÓRDENES, no la de visitas:
//
//   886 visitas y 3 órdenes  ->  1 (programas) + 2 (páginas) + 3  =  6 peticiones
//     0 visitas              ->  1 peticion y ninguna extra
//
// No es un N+1 sobre la programación, que es lo que haría un bucle ciego por visita.
import { apiTiPr01 } from '../../services/api';

// Cuántas visitas se consultan a la vez. Ni una por una -serializaría la carga- ni todas de
// golpe, que abriría tantas conexiones como visitas con orden tenga el programa.
export const LOTE = 6;

// Mapea en lotes conservando el orden de entrada. Un fallo de una visita NO tumba la carga
// entera: se devuelve su error para contarlo y seguir, porque un historial incompleto que
// lo confiesa es mejor que una pantalla en blanco.
export const enLotes = async (elementos, tamano, trabajo) => {
  const salida = [];

  for (let i = 0; i < elementos.length; i += tamano) {
    const lote = elementos.slice(i, i + tamano);

    const hechos = await Promise.all(
      lote.map(async elemento => {
        try {
          return { elemento, datos: await trabajo(elemento), error: null };
        } catch (error) {
          return { elemento, datos: null, error };
        }
      })
    );

    salida.push(...hechos);
  }

  return salida;
};

// `filtros` viaja tal cual al listado de programación, que admite del lado del SERVIDOR:
// estado, placa, quincena_efectiva, desde, hasta, limite y desplazamiento. Lo vacío no
// viaja. Un rango desde/hasta y quincena_efectiva son excluyentes: lo rechaza el backend.
export const cargarProgramaConOrdenes = async (filtros = {}) => {
  const lista = await apiTiPr01.listarProgramas({ estado: 'ACTIVO' });
  const programa = (lista.programas ?? [])[0] ?? null;

  if (!programa) {
    return {
      programa: null,
      fechaNegocio: lista.fecha_negocio ?? null,
      visitas: [],
      ordenes: [],
      estadosOt: null,
      estadosDetalle: null,
      fallidas: 0,
      truncado: false,
      total: 0
    };
  }

  const data = await apiTiPr01.listarProgramacionCompleta(programa.id, filtros);
  const visitas = data.programacion ?? [];

  // Solo las visitas que el propio backend declara con al menos una orden.
  const conOrdenes = visitas.filter(v => (v.ordenes_trabajo?.total ?? 0) > 0);

  const base = {
    programa,
    fechaNegocio: lista.fecha_negocio ?? null,
    visitas,
    truncado: Boolean(data.truncado),
    total: data.total ?? visitas.length
  };

  if (conOrdenes.length === 0) {
    return {
      ...base,
      ordenes: [],
      estadosOt: null,
      estadosDetalle: null,
      fallidas: 0
    };
  }

  const resultados = await enLotes(conOrdenes, LOTE, visita =>
    apiTiPr01.listarOrdenesTrabajo(programa.id, visita.id)
  );

  const ordenes = [];
  let estadosOt = null;
  let estadosDetalle = null;
  let fallidas = 0;

  for (const { datos, error } of resultados) {
    if (error || !datos) {
      fallidas += 1;
      continue;
    }

    // Los catálogos de estados salen de la propia respuesta, no de una lista local.
    estadosOt = estadosOt ?? datos.estados ?? null;
    estadosDetalle = estadosDetalle ?? datos.estados_detalle ?? null;

    ordenes.push(...(datos.ordenes_trabajo ?? []));
  }

  // Mismo criterio que el backend dentro de cada visita: lo más reciente primero, con el id
  // como desempate estable.
  ordenes.sort((a, b) => {
    const fa = String(a.fecha_apertura ?? '');
    const fb = String(b.fecha_apertura ?? '');

    if (fa !== fb) return fb.localeCompare(fa);

    return b.id - a.id;
  });

  return { ...base, ordenes, estadosOt, estadosDetalle, fallidas };
};
