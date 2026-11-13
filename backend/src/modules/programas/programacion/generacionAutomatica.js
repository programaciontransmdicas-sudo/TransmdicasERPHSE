import { pool } from '../../../config/database.js';
import { CODIGO, idx, quin, cargarInsumos, generar, materializar, auditarCadencia, excepciones } from '../../../../scripts/ti-pr-01/generador-nucleo.mjs';

// Dos meses completos por delante; el día de referencia se consulta a PostgreSQL en hora de Perú.
export function horizonteMovil(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha de negocio inválida');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));
  if (comprobacion.toISOString().slice(0, 10) !== fecha) throw new Error('Fecha de negocio inválida');
  return { inicio: quin(idx(fecha)), fin: new Date(Date.UTC(anio, mes + 2, 0)).toISOString().slice(0, 10) };
}

// Los cerrojos de tabla impiden escrituras concurrentes durante cada lote corto. Se toman
// antes de leer y generar; no se cambian ni las reglas ni los datos históricos de las OT.
const TABLAS = `public.programas_mantenimiento, public.programas_mantenimiento_versiones,
  public.programa_mantenimiento_unidades, public.programa_mantenimiento_frecuencias,
  public.programa_mantenimiento_unidad_ciclos, public.programa_mantenimiento_unidad_anclas,
  public.vehiculo_equipos, public.programacion_mantenimiento,
  public.programacion_mantenimiento_equipos, public.ordenes_trabajo,
  public.programacion_mantenimiento_ajustes`;

let estadoEjecucion = { habilitado: false, ejecutando: false, ultimaEjecucion: null, resultado: null, error: null };
export const estadoGeneracionAutomatica = () => ({ ...estadoEjecucion });

export async function generarLote({ conexion = pool, unidades } = {}) {
  const client = await conexion.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2s'");
    // Dos generadores no pueden proyectar simultáneamente.
    const bloqueo = await client.query('SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS obtenido', [141409, 1]);
    if (!bloqueo.rows[0].obtenido) { await client.query('ROLLBACK'); return { omitido: true }; }
    await client.query(`LOCK TABLE ${TABLAS} IN EXCLUSIVE MODE NOWAIT`);
    const programas = await client.query('SELECT id FROM programas_mantenimiento WHERE codigo=$1 AND estado=$2', [CODIGO, 'ACTIVO']);
    if (programas.rows.length !== 1) throw new Error('Debe existir exactamente un programa de mantenimiento activo');
    const programaId = programas.rows[0].id;
    const ins = await cargarInsumos(client, programaId);
    const { inicio, fin } = horizonteMovil(ins.fechaNegocio);
    const versiones = await client.query(`SELECT id, version, vigencia_desde, vigencia_hasta FROM programas_mantenimiento_versiones
      WHERE programa_id=$1 AND estado IN ('VIGENTE','SUPERSEDIDA')`, [programaId]);
    ins.vers = versiones.rows;
    const p = generar(ins, inicio, fin);
    const grupo = new Set(unidades.map(Number));
    const fallas = auditarCadencia(ins, p.bruto).filter(o => grupo.has(Number(o.unidad)));
    const visitas = p.visitas.filter(v => grupo.has(Number(v.unidad)));
    const seguras = p.seguras.filter(v => grupo.has(Number(v.unidad)));
    const conflictos = p.colisiones.filter(v => grupo.has(Number(v.programa_unidad_id)));
    if (fallas.length) throw new Error(`Hay ${fallas.length} errores de cadencia en el lote`);
    if (visitas.some(v => v.version_id == null)) throw new Error('No hay una versión vigente única para todo el horizonte');
    if (conflictos.length) throw new Error(`Hay ${conflictos.length} colisiones en el lote`);
    if (visitas.flatMap(v => v.detalles).some(d => !ins.frecOk.has(`${d.familia}|${d.nivel}`))) throw new Error('Hay equipos sin frecuencia configurada');
    const faltantes = excepciones(ins).filter(x => grupo.has(Number(x.unidad)));
    const resultado = await materializar(client, seguras);
    if (resultado.red_de_seguridad.length) throw new Error('Cambió una programación durante la generación');
    await client.query('COMMIT');
    return { inicio, fin, creadas: resultado.programaciones, detalles: resultado.detalles, sinReferencia: faltantes.length };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* conserva el error original */ }
    throw error;
  } finally { client.release(); }
}

// Cada ejecución vuelve a consultar y recalcular antes de escribir cada grupo de unidades.
export async function generarHorizonteAutomatico({ conexion = pool, tamanoLote = 5 } = {}) {
  const consulta = await conexion.query(`SELECT u.id FROM programa_mantenimiento_unidades u
    JOIN programas_mantenimiento p ON p.id=u.programa_id WHERE p.codigo=$1 AND p.estado='ACTIVO' AND u.habilitado ORDER BY u.id`, [CODIGO]);
  const ids = consulta.rows.map(x => x.id);
  let creadas = 0, detalles = 0, sinReferencia = 0;
  const fallas = [];
  for (let i = 0; i < ids.length; i += tamanoLote) {
    const unidades = ids.slice(i, i + tamanoLote);
    try {
      const lote = await generarLote({ conexion, unidades });
      if (lote.omitido) { fallas.push('Otra generación se está ejecutando'); break; }
      creadas += lote.creadas; detalles += lote.detalles; sinReferencia += lote.sinReferencia;
    } catch (error) {
      fallas.push(`Unidades ${unidades.join(', ')}: ${error.message}`);
    }
    // Permite que otras operaciones atiendan la base entre lotes.
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { unidades: ids.length, creadas, detalles, sinReferencia, fallas };
}

export function iniciarGeneracionAutomatica({ habilitado = process.env.GENERADOR_AUTOMATICO_TI === 'true', intervaloMs = 6 * 60 * 60 * 1000 } = {}) {
  estadoEjecucion = { ...estadoEjecucion, habilitado };
  if (!habilitado) return () => {};
  let ocupado = false;
  const ejecutar = async () => {
    if (ocupado) return;
    ocupado = true;
    estadoEjecucion = { ...estadoEjecucion, ejecutando: true, error: null };
    try {
      const resultado = await generarHorizonteAutomatico();
      estadoEjecucion = { ...estadoEjecucion, resultado, ultimaEjecucion: new Date().toISOString() };
      console.log('[GENERADOR_AUTOMATICO_TI]', JSON.stringify(resultado));
    } catch (error) {
      estadoEjecucion = { ...estadoEjecucion, error: error.message, ultimaEjecucion: new Date().toISOString() };
      console.error('[GENERADOR_AUTOMATICO_TI] No se generó el horizonte:', error.message);
    } finally { ocupado = false; estadoEjecucion = { ...estadoEjecucion, ejecutando: false }; }
  };
  const inicio = setTimeout(ejecutar, 10000);
  const intervalo = setInterval(ejecutar, intervaloMs);
  inicio.unref?.(); intervalo.unref?.();
  return () => { clearTimeout(inicio); clearInterval(intervalo); };
}
