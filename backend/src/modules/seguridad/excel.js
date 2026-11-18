import ExcelJS from 'exceljs';
import { CONTROLES, fallo } from './validaciones.js';

const fecha = valor => valor ? new Date(valor).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '';
const texto = valor => String(valor ?? '').slice(0, 32000);
const ETIQUETAS = {
  nombre: 'Nombre', dni: 'DNI', operacion: 'Operación', motivo: 'Motivo', placa: 'Placa',
  conductor: 'Conductor', carreta: 'Carreta', agente: 'Agente', observaciones: 'Observaciones',
  fecha: 'Fecha del evento', salida: 'Salida', devolucionFecha: 'Fecha de devolución', recibe: 'Recibe',
  cargo: 'Cargo', identificacion: 'Identificación', pendientesAnterior: 'Pendientes del turno anterior',
  novedades: 'Novedades', incidentes: 'Incidentes', movimientos: 'Movimientos', equipos: 'Equipos',
  acciones: 'Acciones', tipo: 'Tipo de ronda', turno: 'Turno', fin: 'Fin de ronda',
  presentaAnomalias: '¿Presentó anomalías?', anomalias: 'Anomalías', seguimiento: 'Seguimiento',
  fechaIngreso: 'Fecha de ingreso', fechaSalida: 'Fecha prevista de salida', horaIngreso: 'Hora de ingreso',
  responsableSolicitud: 'Responsable de la solicitud', empresa: 'Empresa', responsableSitio: 'Responsable en sitio',
  area: 'Área', movimiento: 'Movimiento', documento: 'Documento', numero: 'Número de documento',
  autoriza: 'Autoriza', retorna: '¿Retorna?', fechaPrevista: 'Retorno previsto', retorno: 'Fecha de retorno',
  ingresoRegistrado: 'Con ingreso registrado', verificaciones: 'Verificaciones', controles: 'Checklist',
};

export async function construirExcel({ tipo, filtros, registros }) {
  let cantidad = registros.length;
  for (const r of registros) {
    cantidad += (r.datos.movimientos || []).length;
    for (const b of r.datos.bienes || []) cantidad += 1 + (b.series || []).length;
    for (const ret of r.datos.retornos || []) for (const b of ret.bienes || []) cantidad += 1 + (b.series || []).length;
  }
  if (cantidad > 100000) throw fallo('El reporte supera 100000 filas de detalle. Reduce los filtros.', 413);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Transmdicas · ERPHSE';
  const crearHoja = (nombre, columnas) => {
    const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.columns = columnas.map(([key, header, width = 24]) => ({ key, header, width }));
    hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17385D' } };
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    return hoja;
  };
  const columnas = [
    ['id', 'Identificador', 38], ['base', 'Base'], ['creado', 'Registro en sistema · Perú', 28],
    ['estado', 'Estado'], ['referencia', 'Placa / referencia'], ['persona', 'Nombre / conductor', 32],
    ['identidad', 'Identificación'],
  ];
  const extras = Object.keys(ETIQUETAS).filter(clave => registros.some(r => {
    const v = r.datos[clave];
    return v !== undefined && (v === null || typeof v !== 'object' || (Array.isArray(v) && v.every(x => typeof x !== 'object')));
  }));
  for (const clave of extras) columnas.push([`dato_${clave}`, ETIQUETAS[clave], 30]);
  const hoja = crearHoja('Registros', columnas);
  for (const r of registros) {
    const fila = { id: r.id, base: r.base, creado: fecha(r.creado_en), estado: r.estado,
      referencia: r.referencia, persona: r.persona, identidad: r.documento };
    for (const clave of extras) {
      const v = r.datos[clave];
      fila[`dato_${clave}`] = texto(Array.isArray(v) ? v.join('; ')
        : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? fecha(v) : v);
    }
    // Los valores se asignan como texto, nunca como fórmulas recibidas del usuario.
    hoja.addRow(fila);
  }
  if (tipo === 'vehiculos') {
    const movimientos = crearHoja('Ingresos y salidas', [
      ['registro', 'Registro', 38], ['tipo', 'Movimiento'], ['fecha', 'Fecha del movimiento · Perú', 28],
      ['agente', 'Agente'], ['kilometraje', 'Kilometraje'], ['conductor', 'Conductor'], ['dni', 'DNI'],
      ['origen', 'Origen'], ['destino', 'Destino'], ['observaciones', 'Observaciones', 48],
    ]);
    for (const r of registros) for (const m of r.datos.movimientos || []) {
      movimientos.addRow({ ...m, registro: r.id, fecha: fecha(m.fecha) });
    }
  }
  if (tipo === 'activos') {
    const bienes = crearHoja('Bienes', [['registro', 'Registro', 38], ['bien', 'Bien', 38], ['descripcion', 'Descripción', 45], ['cantidad', 'Cantidad']]);
    const series = crearHoja('Series', [['registro', 'Registro', 38], ['bien', 'Bien', 38], ['serie', 'Serie', 40]]);
    const retornos = crearHoja('Retornos', [['registro', 'Registro', 38], ['bien', 'Bien', 38], ['fecha', 'Fecha · Perú', 28], ['recibe', 'Recibe'], ['documento', 'Documento'], ['descripcion', 'Descripción', 40], ['cantidad', 'Cantidad'], ['series', 'Series devueltas', 50]]);
    const seriesDevueltas = crearHoja('Series devueltas', [['registro', 'Registro', 38], ['bien', 'Bien', 38], ['fecha', 'Fecha · Perú', 28], ['serie', 'Serie', 40]]);
    for (const r of registros) {
      for (const b of r.datos.bienes || []) {
        bienes.addRow({ registro: r.id, bien: b.id, descripcion: texto(b.descripcion), cantidad: b.cantidad });
        for (const serie of b.series || []) series.addRow({ registro: r.id, bien: b.id, serie: texto(serie) });
      }
      for (const ret of r.datos.retornos || []) for (const b of ret.bienes || []) {
        retornos.addRow({ registro: r.id, bien: b.bienId, fecha: fecha(ret.retorno), recibe: texto(ret.recibe),
          documento: texto(ret.documentoRetorno), descripcion: texto(b.descripcion), cantidad: b.cantidad,
          series: texto((b.series || []).join('; ')) });
        for (const serie of b.series || []) seriesDevueltas.addRow({ registro: r.id, bien: b.bienId, fecha: fecha(ret.retorno), serie: texto(serie) });
      }
    }
  }
  const info = crearHoja('Filtros', [['campo', 'Filtro', 32], ['valor', 'Valor', 60]]);
  info.addRows([
    { campo: 'Control', valor: CONTROLES.find(c => c.id === tipo).nombre },
    { campo: 'Base', valor: filtros.base || 'Todas las bases' },
    { campo: 'Fecha filtrada', valor: 'Registro en sistema (creado_en), hora de Perú' },
    { campo: 'Desde', valor: filtros.desde || 'Sin límite' }, { campo: 'Hasta', valor: filtros.hasta || 'Sin límite' },
    { campo: 'Búsqueda', valor: filtros.busqueda }, { campo: 'Estado', valor: filtros.estado || 'Todos' },
    { campo: 'Registros exportados', valor: registros.length },
  ]);
  return libro.xlsx.writeBuffer();
}
