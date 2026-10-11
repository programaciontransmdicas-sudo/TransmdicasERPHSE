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
} from '../../reports/ExcelMaster.js';

import {
  obtenerOperacionesReportes,
  obtenerDatosMantenimientoReporte
} from './repository.js';

import {
  validarParametrosMaster
} from './service.js';

import {
  generarExcelMantenimiento
} from '../../reports/excelMantenimiento.js';

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
              400
              ? 400
              : 500
        )
        .json({
          error:
            error.status === 404 ||
              error.status === 400
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
      const datos =
        await obtenerDatosMantenimientoReporte();

      const workbook =
        await generarExcelMantenimiento(
          datos
        );

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