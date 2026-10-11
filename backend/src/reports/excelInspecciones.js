import ExcelJS from 'exceljs';
function formatDMY(valor) {
  if (!valor) return '';

  if (
    typeof valor === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())
  ) {
    return valor.trim().split('-').reverse().join('-');
  }

  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(fecha.getTime())) return '';

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(fecha).replaceAll('/', '-');
}

function getValidatedDateRange(queryParams = {}) {
  const fechaInicio = String(queryParams.fechaInicio || '').trim();
  const fechaFin = String(queryParams.fechaFin || '').trim();

  if (!fechaInicio && !fechaFin) return null;

  const isValidISODate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };

  if (!isValidISODate(fechaInicio) || !isValidISODate(fechaFin) || fechaInicio > fechaFin) {
    const error = new Error('El rango de fechas no es válido');
    error.status = 400;
    throw error;
  }

  return { fechaInicio, fechaFin };
}

// ==========================================
// GENERADOR DE EXCEL GENERAL / FILTRADO
// ==========================================
export const generateExcel = async (pool, queryParams, res) => {
  try {
    const { filtro, valor, fecha, operacion } = queryParams || {};
    const rangoFechas = getValidatedDateRange(queryParams);

    let query = '';
    let params = [];
    let paramIndex = 1;

    if (filtro === 'gerencial') {
      query = `
        SELECT 
          v.placa, v.tipo_vehiculo as tipo, v.operacion as programa, 'Activo' as estado_vehiculo,
          i.fecha_hora::date::text AS fecha,
to_char(i.fecha_hora, 'HH24:MI') AS hora, i.tablet, i.radio, i.camaras, i.img_tablet, i.img_radio, i.img_camaras, i.observaciones
        FROM vehiculos v
        LEFT JOIN inspecciones_flota i ON v.placa = i.placa
        WHERE 1=1
      `;

      // New combination filters for gerencial
      if (operacion && operacion !== 'todas') {
        if (operacion === 'Falta identificar') {
          query += ` AND (v.operacion IS NULL OR v.operacion = '' OR LOWER(v.operacion) = 'sin operación')`;
        } else if (operacion === 'Industrias' || operacion === 'Bambas') {
          query += ` AND LOWER(v.operacion) LIKE $${paramIndex++}`;
          params.push(`%${operacion.toLowerCase()}%`);
        } else {
          query += ` AND LOWER(v.operacion) = $${paramIndex++}`;
          params.push(operacion.toLowerCase());
        }
      }

      if (rangoFechas) {
        query += ` AND i.fecha_hora::date BETWEEN $${paramIndex++}::date AND $${paramIndex++}::date`;
        params.push(rangoFechas.fechaInicio, rangoFechas.fechaFin);
      } else if (fecha === 'hoy') {
        query += ` AND i.fecha_hora::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date`;
      } else if (fecha === 'semana') {
        query += ` AND i.fecha_hora::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date - 7`;
      }

      query += ` ORDER BY i.fecha_hora DESC NULLS LAST, v.placa ASC`;
    } else {
      query = `
  SELECT
    i.*,
    i.fecha_hora::date::text AS fecha,
    to_char(i.fecha_hora, 'HH24:MI') AS hora,
    v.operacion AS programa
  FROM inspecciones_flota i
  JOIN vehiculos v ON i.placa = v.placa
  WHERE 1=1
`;
      if (filtro === 'placa') {
        query += ` AND i.placa = $${paramIndex++}`;
        params.push(valor.toUpperCase());
      } else if (filtro === 'programa') {
        if (valor === 'Falta identificar') {
          query += ` AND (v.operacion IS NULL OR v.operacion = '' OR LOWER(v.operacion) = 'sin operación')`;
        } else if (valor === 'Industrias' || valor === 'Bambas') {
          query += ` AND LOWER(v.operacion) LIKE $${paramIndex++}`;
          params.push(`%${valor.toLowerCase()}%`);
        } else {
          query += ` AND LOWER(v.operacion) = $${paramIndex++}`;
          params.push(valor.toLowerCase());
        }
      }

      // New combination filters
      if (operacion && operacion !== 'todas') {
        if (operacion === 'Falta identificar') {
          query += ` AND (v.operacion IS NULL OR v.operacion = '' OR LOWER(v.operacion) = 'sin operación')`;
        } else if (operacion === 'Industrias' || operacion === 'Bambas') {
          query += ` AND LOWER(v.operacion) LIKE $${paramIndex++}`;
          params.push(`%${operacion.toLowerCase()}%`);
        } else {
          query += ` AND LOWER(v.operacion) = $${paramIndex++}`;
          params.push(operacion.toLowerCase());
        }
      }

      if (rangoFechas) {
        query += ` AND i.fecha_hora::date BETWEEN $${paramIndex++}::date AND $${paramIndex++}::date`;
        params.push(rangoFechas.fechaInicio, rangoFechas.fechaFin);
      } else if (fecha === 'hoy') {
        query += ` AND i.fecha_hora::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date`;
      } else if (fecha === 'semana') {
        query += ` AND i.fecha_hora::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date - 7`;
      }

      query += ' ORDER BY i.fecha_hora DESC NULLS LAST, i.id DESC';
    }
    const result = await pool.query(query, params);
    const inspecciones = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inspecciones');

    if (filtro === 'gerencial') {
      // Configurar anchos de columna sin fijar la primera fila de cabecera automáticamente
      worksheet.columns = [
        { key: 'programa', width: 20 },
        { key: 'placa', width: 15 },
        { key: 'tipo', width: 18 },
        { key: 'estado_vehiculo', width: 15 },
        { key: 'fecha', width: 15 },
        { key: 'hora', width: 10 },
        { key: 'tablet', width: 15 },
        { key: 'radio', width: 15 },
        { key: 'camaras', width: 15 },
        { key: 'img_tablet', width: 40 },
        { key: 'img_radio', width: 40 },
        { key: 'img_camaras', width: 40 },
        { key: 'observaciones', width: 45 },
      ];

      // 1. Título principal
      const titleRow = worksheet.addRow(['REPORTE GERENCIAL DE FLOTAS E INSPECCIONES']);
      worksheet.mergeCells('A1:J1');
      titleRow.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101B33' } }; // Navy ERPHC
      titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
      titleRow.height = 30;

      // 2. Subtítulo (Fecha de Generación)
      const dateRow = worksheet.addRow([`Fecha de Emisión: ${new Date().toLocaleString('es-PE')}`]);
      worksheet.mergeCells('A2:J2');
      dateRow.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF101B33' } };
      dateRow.alignment = { vertical: 'middle', horizontal: 'right' };
      dateRow.height = 20;

      // Espaciador
      worksheet.addRow([]);

      // 3. Cabecera de la tabla
      const headerRow = worksheet.addRow([
        'Operación', 'Placa', 'Tipo Unidad', 'Estado Unidad',
        'Última Insp.', 'Hora', 'Tablet', 'Radio Base', 'Cámaras', 'Foto Tablet', 'Foto Radio', 'Foto Cámaras', 'Observaciones'
      ]);

      headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E9F6E' } }; // Verde ERPHC
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 25;

      // Bordes para la cabecera
      headerRow.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' }
        };
      });

      // 4. Agregar Datos
      inspecciones.forEach((insp, index) => {
        const row = worksheet.addRow({
          programa: insp.programa || 'Sin Operación',
          placa: insp.placa,
          tipo: insp.tipo || 'N/A',
          estado_vehiculo: insp.estado_vehiculo || 'N/A',
          fecha: formatDMY(insp.fecha) || 'Sin Inspección',
          hora: insp.hora || '-',
          tablet: insp.tablet || '-',
          radio: insp.radio || '-',
          camaras: insp.camaras || '-',
          img_tablet: insp.img_tablet ? (insp.img_tablet.startsWith('http') ? insp.img_tablet : `http://localhost:8000/uploads/${insp.img_tablet}`) : 'N/A',
          img_radio: insp.img_radio ? (insp.img_radio.startsWith('http') ? insp.img_radio : `http://localhost:8000/uploads/${insp.img_radio}`) : 'N/A',
          img_camaras: insp.img_camaras ? (insp.img_camaras.startsWith('http') ? insp.img_camaras : `http://localhost:8000/uploads/${insp.img_camaras}`) : 'N/A',
          observaciones: insp.observaciones || '-'
        });

        // Estilos de filas de datos
        row.font = { name: 'Arial', size: 10 };
        row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // Alineación izquierda para observaciones
        row.getCell(10).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        // Colores alternados (Zebra striping)
        if (index % 2 === 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        }

        row.eachCell(cell => {
          cell.border = {
            top: { style: 'hair' }, left: { style: 'hair' }, bottom: { style: 'hair' }, right: { style: 'hair' }
          };
        });
      });

      // Añadir Autocorrector de filtros a la tabla
      worksheet.autoFilter = 'A4:J4';
    } else {
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Placa', key: 'placa', width: 15 },
        { header: 'Programa', key: 'programa', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Hora', key: 'hora', width: 10 },
        { header: 'Tablet', key: 'tablet', width: 15 },
        { header: 'Radio Base', key: 'radio', width: 15 },
        { header: 'Cámaras', key: 'camaras', width: 15 },
        { header: 'Foto Tablet', key: 'img_tablet', width: 40 },
        { header: 'Foto Radio', key: 'img_radio', width: 40 },
        { header: 'Foto Cámaras', key: 'img_camaras', width: 40 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101B33' } };

      inspecciones.forEach(insp => {
        worksheet.addRow({
          id: insp.id,
          placa: insp.placa,
          programa: insp.programa,
          fecha: formatDMY(insp.fecha),
          hora: insp.hora,
          tablet: insp.tablet,
          radio: insp.radio,
          camaras: insp.camaras,
          img_tablet: insp.img_tablet ? (insp.img_tablet.startsWith('http') ? insp.img_tablet : `http://localhost:8000/uploads/${insp.img_tablet}`) : 'N/A',
          img_radio: insp.img_radio ? (insp.img_radio.startsWith('http') ? insp.img_radio : `http://localhost:8000/uploads/${insp.img_radio}`) : 'N/A',
          img_camaras: insp.img_camaras ? (insp.img_camaras.startsWith('http') ? insp.img_camaras : `http://localhost:8000/uploads/${insp.img_camaras}`) : 'N/A',
        });
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Flotas_${filtro || 'General'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generando Excel', error);
    if (res.headersSent) return res.end();
    res.status(error.status || 500).json({
      error: error.status === 400 ? error.message : 'Error interno generando el Excel'
    });
  }
};
