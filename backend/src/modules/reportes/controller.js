import { leerProgramaExcel } from '../programas/programacion/excel/repository.js';
import { filtrosExcel, prepararReporte, finQuincena } from '../programas/programacion/excel/service.js';
import { generarExcelPrograma } from '../../reports/excelProgramaTiPr01.js';
import {
  pool
} from '../../config/database.js';

import {
  generatePDF
} from '../../reports/pdfInspecciones.js';

import {
  generateExcel
} from '../../reports/excelInspecciones.js';

import {
  generateMasterReport
} from '../../reports/ExcelMasterMantenimiento.js';

import {
  obtenerOperacionesReportes
} from './repository.js';

import {
  validarParametrosMaster
} from './service.js';


// ==========================================
// OPERACIONES
// ==========================================

export const listarOperaciones =
  async (req, res) => {
    try {
      const operaciones =
        await obtenerOperacionesReportes();

      return res.json(
        operaciones
      );
    } catch (error) {
      console.error(
        'Error obteniendo operaciones de reportes:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'No se pudieron cargar las operaciones'
        });
    }
  };

// ==========================================
// REPORTE MASTER
// ==========================================

export const generarMaster =
  async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        clienteOperacionId
      } =
        validarParametrosMaster(
          req.query
        );

      const workbook =
        await generateMasterReport(
          pool,
          startDate,
          endDate,
          clienteOperacionId
        );

      res.setHeader(
        'Cache-Control',
        'no-store'
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Reporte_Master.xlsx'
      );

      await workbook.xlsx
        .write(res);

      return res.end();
    } catch (error) {
      console.error(
        'Error generando Reporte Master:',
        error
      );

      if (
        res.headersSent
      ) {
        return res.destroy();
      }

      return res
        .status(
          error.status ===
            404
            ? 404
            : error.status ===
              400 || error.status === 409
              ? error.status
              : 500
        )
        .json({
          error:
            [400, 404, 409].includes(error.status)
              ? error.message
              : 'Error interno generando reporte'
        });
    }
  };

// ==========================================
// MANTENIMIENTO EXCEL
// ==========================================

export const generarMantenimientoExcel =
  async (req, res) => {
    try {
      const activos = await pool.query("SELECT id FROM programas_mantenimiento WHERE codigo='TI-PR-01' AND estado='ACTIVO'");
      if (activos.rows.length !== 1) return res.status(409).json({ error:'Se requiere un programa TI-PR-01 activo.' });
      const datos = await leerProgramaExcel(activos.rows[0].id, pool);
      const ultimas = datos.visitas.filter(v => v.estado !== 'CANCELADO' && v.quincena_efectiva)
        .map(v => finQuincena(v.quincena_efectiva)).sort();
      const fin = ultimas.at(-1);
      if (fin && fin > datos.version.periodo_fin) datos.version = { ...datos.version, periodo_fin: fin };
      const workbook = await generarExcelPrograma(prepararReporte(datos, filtrosExcel({})));

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=MantenimientoEquipos.xlsx'
      );

      await workbook.xlsx
        .write(res);

      return res.end();
    } catch (error) {
      console.error(
        'Error generando Excel de mantenimiento:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Error al generar excel'
        });
    }
  };

// ==========================================
// PDF INSPECCIONES
// ==========================================

export const generarPDFInspecciones =
  async (req, res) => {
    await generatePDF(
      pool,
      req.query,
      res
    );
  };

// ==========================================
// EXCEL INSPECCIONES
// ==========================================

export const generarExcelInspecciones =
  async (req, res) => {
    await generateExcel(
      pool,
      req.query,
      res
    );
  };