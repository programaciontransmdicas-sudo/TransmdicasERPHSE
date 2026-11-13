import { leerProgramaExcel } from '../modules/programas/programacion/excel/repository.js';
import { filtrosExcel, prepararReporte } from '../modules/programas/programacion/excel/service.js';
import { generarExcelPrograma } from './excelProgramaTiPr01.js';
import { urlFirmadaEvidencia } from '../services/cloudinaryService.js';
import { formatearPlaca } from '../services/formatos.js';

const errorConEstado = (mensaje, status) => Object.assign(new Error(mensaje), { status });

// La URL firmada solo se utiliza en el servidor. Nunca se guarda en el Excel.
async function descargarEvidencia(publicId) {
  try {
    const response = await fetch(urlFirmadaEvidencia(publicId, 500, 'jpg'), { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) return null;
    const partes = []; let size = 0;
    for await (const parte of response.body) {
      size += parte.length;
      if (size > 10 * 1024 * 1024) return null;
      partes.push(parte);
    }
    const buffer = Buffer.concat(partes);
    const sig = buffer.subarray(0, 8).toString('hex');
    const extension = sig.startsWith('ffd8ff') ? 'jpeg' : sig === '89504e470d0a1a0a' ? 'png' : null;
    return extension ? { buffer, extension } : null;
  } catch { return null; }
}

export const generateMasterReport = async (pool, startDate, endDate, clienteOperacionId) => {
  const programas = await pool.query("SELECT id FROM programas_mantenimiento WHERE codigo = 'TI-PR-01' AND estado = 'ACTIVO'");
  if (programas.rows.length !== 1) throw errorConEstado('Se requiere un único programa TI-PR-01 activo.', 409);
  const programaId = programas.rows[0].id;
  const accesibles = await pool.query('SELECT placa FROM vehiculos WHERE cliente_operacion_id = $1', [clienteOperacionId]);
  const placas = new Set(accesibles.rows.map(row => row.placa));
  const programa = await leerProgramaExcel(programaId, pool);
  programa.unidades = programa.unidades.filter(u => placas.has(u.placa));
  // Las fechas son el alcance elegido para la exportación, no una alteración de vigencia.
  const rango = { ...programa, version: { ...programa.version, periodo_inicio: startDate, periodo_fin: endDate } };
  const reporte = prepararReporte(rango, filtrosExcel({}));
  const libro = await generarExcelPrograma(reporte);

  const resultado = await pool.query(`
    SELECT o.id AS orden_id, u.placa, p.fecha_ejecucion::text AS fecha, p.estado AS resultado_visita,
      e.tipo_equipo, e.nivel_mantenimiento AS nivel_programado, d.estado AS resultado_equipo,
      d.nivel_completado, d.observaciones,
      COALESCE((SELECT array_agg(ev.cloudinary_public_id ORDER BY ev.id)
        FROM ordenes_trabajo_evidencias ev WHERE ev.detalle_id=d.id AND ev.estado='ACTIVA'), ARRAY[]::text[]) AS evidencias
    FROM ordenes_trabajo o
    JOIN programacion_mantenimiento p ON p.id=o.programacion_id
    JOIN programa_mantenimiento_unidades u ON u.id=p.programa_unidad_id
    JOIN vehiculos v ON v.placa=u.placa
    JOIN ordenes_trabajo_detalle d ON d.orden_trabajo_id=o.id
    JOIN programacion_mantenimiento_equipos e ON e.id=d.programacion_equipo_id
    WHERE p.programa_id=$1 AND v.cliente_operacion_id=$2 AND o.estado='CERRADA'
      AND p.fecha_ejecucion BETWEEN $3::date AND $4::date
    ORDER BY p.fecha_ejecucion DESC, o.id DESC, e.tipo_equipo, d.id`,
    [programaId, clienteOperacionId, startDate, endDate]);
  const detalles = resultado.rows;
  const ots = new Map();
  for (const d of detalles) if (!ots.has(d.orden_id)) ots.set(d.orden_id, d);
  const ordenes = libro.addWorksheet('Órdenes cerradas');
  ordenes.columns = [
    { header:'OT', key:'ot', width:12 }, { header:'PLACA', key:'placa', width:16 },
    { header:'FECHA DE EJECUCIÓN', key:'fecha', width:24 }, { header:'RESULTADO DE VISITA', key:'resultado', width:24 }
  ];
  for (const o of ots.values()) ordenes.addRow({ ot:o.orden_id, placa:formatearPlaca(o.placa), fecha:o.fecha, resultado:o.resultado_visita });
  const equipos = libro.addWorksheet('Equipos y evidencias');
  equipos.columns = [
    { header:'OT', key:'ot', width:10 }, { header:'PLACA', key:'placa', width:15 },
    { header:'FECHA', key:'fecha', width:15 }, { header:'EQUIPO', key:'equipo', width:20 },
    { header:'NIVEL PROGRAMADO', key:'nivel', width:20 }, { header:'RESULTADO', key:'resultado', width:20 },
    { header:'NIVEL COMPLETADO', key:'nivel_completado', width:20 }, { header:'OBSERVACIONES', key:'observaciones', width:45 },
    ...[1,2,3,4].map(n => ({ header:`FOTO ${n}`, key:`foto${n}`, width:20 }))
  ];
  for (const hoja of [ordenes, equipos]) {
    hoja.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
    hoja.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1F4E78'} };
    hoja.getRow(1).alignment = { vertical:'middle', wrapText:true };
    hoja.views = [{ state:'frozen', ySplit:1 }];
  }
  let imagenesNoDisponibles = 0;
  for (const d of detalles) {
    const fila = equipos.addRow({ ot:d.orden_id, placa:formatearPlaca(d.placa), fecha:d.fecha,
      equipo:d.tipo_equipo, nivel:d.nivel_programado, resultado:d.resultado_equipo,
      nivel_completado:d.nivel_completado, observaciones:d.observaciones });
    fila.alignment = { vertical:'middle', wrapText:true };
    const evidencias = d.evidencias.slice(0, 4);
    const fotos = await Promise.all(evidencias.map(descargarEvidencia));
    if (fotos.length) fila.height = 75;
    fotos.forEach((foto, i) => {
      if (!foto) { fila.getCell(9+i).value = 'Imagen no disponible'; imagenesNoDisponibles++; return; }
      const id = libro.addImage(foto);
      equipos.addImage(id, { tl:{ col:8+i, row:fila.number-1 }, ext:{width:100,height:90} });
    });
  }
  if (imagenesNoDisponibles) equipos.getCell('H1').note = `${imagenesNoDisponibles} evidencia(s) no se pudieron recuperar. Consulte la OT en el ERP.`;
  if (!detalles.length) ordenes.addRow({ resultado:'Sin OT cerradas en el período seleccionado' });
  return libro;
};
