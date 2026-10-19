import { esUsuarioAdmin, esUsuarioTi, normalizarId, ValidationError } from '../../comun.js';
import { leerProgramaExcel } from './repository.js';
import { filtrosExcel, prepararReporte } from './service.js';
import { generarExcelPrograma } from '../../../../reports/excelProgramaTiPr01.js';

export async function descargarProgramaExcel(req, res) {
  try {
    if (!esUsuarioAdmin(req.user) && !esUsuarioTi(req.user)) {
      throw new ValidationError('No tiene permiso para descargar el programa.', 403);
    }
    const programaId = normalizarId('programaId', req.params.programaId);
    const filtros = filtrosExcel(req.query);
    const datos = await leerProgramaExcel(programaId);
    const reporte = prepararReporte(datos, filtros);
    if (!reporte.filas.length) throw new ValidationError('No hay unidades para exportar con los filtros seleccionados.', 404);
    const workbook = await generarExcelPrograma(reporte);
    // Construir antes de enviar cabeceras permite informar fallos sin descargar un XLSX roto.
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="TI-PR-01_${datos.version.periodo_inicio}_${datos.version.periodo_fin}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(error.status).json({ error: error.message });
    console.error('Error exportando programa TI-PR-01:', error);
    return res.status(500).json({ error: 'No se pudo generar el Excel del programa.' });
  }
}
