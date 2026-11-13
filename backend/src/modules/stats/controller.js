import { leerIndicadoresMantenimiento } from './mantenimiento.js';
import { obtenerSoporteStats, obtenerInventarioAgrupado, obtenerTotalInventario } from './repository.js';
import { tieneAccesoTotalFlota, obtenerClienteOperacionIds } from '../../middlewares/auth.js';

const obtenerAlcance = req => ({ accesoTotal: tieneAccesoTotalFlota(req), clienteOperacionIds: obtenerClienteOperacionIds(req) || [] });
const agrupado = rows => rows.map(row => ({ name: row.estado ?? row.tipo_movimiento, value: Number(row.cantidad) }));

export const obtenerStats = async (req, res) => {
  try {
    const datos = await leerIndicadoresMantenimiento(obtenerAlcance(req));
    return res.json({ totalVehiculos: datos.unidades.length, totalMantenimientos: datos.ordenes.length,
      // Compatibilidad con clientes antiguos; el valor ahora cuenta OT cerradas.
      totalInspecciones: datos.ordenes.length });
  } catch (error) {
    console.error('Error obteniendo estadísticas de mantenimiento:', error.message);
    return res.status(500).json({ error:'Error al obtener estadísticas' });
  }
};

export const obtenerCharts = async (req, res) => {
  try {
    const alcance = obtenerAlcance(req);
    const [datos, soporteRows] = await Promise.all([leerIndicadoresMantenimiento(alcance), obtenerSoporteStats(alcance)]);
    let inventario;
    try { inventario = agrupado(await obtenerInventarioAgrupado(alcance)); }
    catch { inventario = [{name:'Entregas Registradas', value:await obtenerTotalInventario(alcance)}]; }
    const porFecha = {}, resultados = {}, programas = {};
    for (const orden of datos.ordenes) {
      if (orden.fecha) porFecha[orden.fecha] = (porFecha[orden.fecha] || 0) + 1;
      for (const equipo of orden.equipos) resultados[equipo.estado] = (resultados[equipo.estado] || 0) + 1;
    }
    for (const unidad of datos.unidades) {
      const nombre = [unidad.cliente, unidad.operacion].filter(Boolean).join(' - ') || 'Sin Categoría';
      programas[nombre] = (programas[nombre] || 0) + 1;
    }
    const trend = Object.keys(porFecha).sort().slice(-14).map(date => ({date, mantenimientos:porFecha[date], inspecciones:porFecha[date]}));
    const salud = { alDia:0, vencidas:0, porVencer:0, sinInformacion:0 };
    const propiedades = { 'AL DÍA':'alDia', 'VENCIDA':'vencidas', 'POR VENCER':'porVencer', 'SIN INFORMACIÓN':'sinInformacion' };
    for (const u of datos.unidades) salud[propiedades[u.estado]]++;
    return res.json({ trend, programas:Object.entries(programas).map(([name,value])=>({name,value})), salud,
      fallos:Object.entries(resultados).map(([name,errores])=>({name,errores})), soporte:agrupado(soporteRows), inventario });
  } catch (error) {
    console.error('Error obteniendo gráficos de mantenimiento:', error.message);
    return res.status(500).json({ error:'Error al obtener datos para los gráficos' });
  }
};
