import PDFDocument from 'pdfkit-table';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper para optimizar URLs de Cloudinary al vuelo (redimensionado y compresión)
const optimizeCloudinaryUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Inyecta parámetros para pedir una imagen pequeña y optimizada a Cloudinary
  return url.replace('/upload/', '/upload/w_300,h_220,c_fit,q_auto,f_jpeg/');
};

// Helper para obtener buffer de imagen (Remoto o Local)
const fetchImage = async (urlOrFileName) => {
  if (typeof urlOrFileName !== 'string' || !urlOrFileName.trim()) {
    return null;
  }

  const origen = urlOrFileName.trim();

  try {
    if (/^https?:\/\//i.test(origen)) {
      const response = await fetch(origen, {
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok || !response.body) {
        const detalle =
          response.headers.get('x-cld-error') || response.statusText;

        await response.body?.cancel();

        throw new Error(
          'HTTP ' + response.status + ': ' +
          (detalle || 'Respuesta sin imagen')
        );
      }

      const partes = [];
      let bytes = 0;

      for await (const parte of response.body) {
        bytes += parte.byteLength;

        if (bytes > 8 * 1024 * 1024) {
          throw new Error('Imagen mayor a 8 MB');
        }

        partes.push(Buffer.from(parte));
      }

      return Buffer.concat(partes);
    }

    const carpeta = path.resolve(
      __dirname,
      '../../uploads'
    );
    const archivo = path.resolve(carpeta, origen);

    if (!archivo.startsWith(carpeta + path.sep)) return null;

    return fs.existsSync(archivo) ? archivo : null;
  } catch (error) {
    console.warn(
      '[PDF: descarga de foto]',
      error.cause?.code || error.code || error.name,
      error.message
    );
    return null;
  }
};

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
// GENERADOR DE PDF (PROFESIONAL)
// ==========================================
export const generatePDF = async (pool, queryParams, res) => {
  let doc;

  try {
    const { filtro, valor, fecha, operacion } = queryParams || {};
    const rangoFechas = getValidatedDateRange(queryParams);

    let query = `
  SELECT
    i.*,
    i.fecha_hora::date::text AS fecha,
    to_char(i.fecha_hora, 'HH24:MI') AS hora,
    v.operacion AS programa
  FROM inspecciones_flota i
  JOIN vehiculos v ON i.placa = v.placa
  WHERE 1=1
`;
    let params = [];
    let paramIndex = 1;

    // Backward compatibility for old UI links
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
    const result = await pool.query(query, params);
    const inspecciones = result.rows;

    if (res.destroyed) return;

    doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      bufferPages: true
    });

    doc.on('error', error => {
      console.error('Error en el flujo PDF:', error);
      if (!res.destroyed) res.destroy(error);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Flotas.pdf`);
    doc.pipe(res);

    let subtitle = 'Todas las unidades';
    if (filtro === 'placa') subtitle = `Filtro: Placa ${valor}`;
    else if (filtro === 'programa') subtitle = `Filtro: Programa ${valor}`;
    if (rangoFechas) {
      subtitle += ` | Periodo: ${formatDMY(rangoFechas.fechaInicio)} al ${formatDMY(rangoFechas.fechaFin)}`;
      if (operacion && operacion !== 'todas') subtitle += ` | Op: ${operacion}`;
    } else if (fecha || operacion) {
      let ops = [];
      if (fecha === 'hoy') ops.push('Hoy');
      else if (fecha === 'semana') ops.push('Últimos 7 días');
      if (operacion && operacion !== 'todas') ops.push(`Op: ${operacion}`);
      if (ops.length > 0) subtitle = `Filtro: ${ops.join(' | ')}`;
    }

    // Dibujar Cabecera en una página
    const drawHeader = (pageNum) => {
      doc.rect(0, 0, doc.page.width, 80).fill('#101B33'); // Navy ERPHC
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('REPORTE DE INSPECCIONES TI', 40, 25, { align: 'left' });
      doc.fontSize(10).font('Helvetica').text(subtitle, 40, 50, { align: 'left' });
      doc.fontSize(10).font('Helvetica').text(`Generado: ${formatDMY(new Date())}`, 0, 50, { align: 'right', width: doc.page.width - 40 });
      doc.fillColor('#000000');
      doc.y = 100;
    };

    drawHeader(1);

    if (inspecciones.length === 0) {
      doc.fontSize(14).text('No hay inspecciones registradas para este filtro.', { align: 'center' });
      doc.end();
      return;
    }

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151').text(`Total de Registros: ${inspecciones.length}`, 40, doc.y);
    doc.moveDown(1.5);

    // Helpers de dibujo
    const drawBadge = (text, x, y) => {
      const isOK = ['OK', 'N/A', 'NO APLICA'].includes(text.toUpperCase());
      const bgColor = isOK ? '#E7F9F1' : '#FDEAE8'; // Verde suave o Rojo suave
      const textColor = isOK ? '#0E9F6E' : '#DC3B2A'; // Verde oscuro o Rojo oscuro

      doc.rect(x, y - 2, 80, 16).fill(bgColor);
      doc.fillColor(textColor).fontSize(8).font('Helvetica-Bold').text(text.toUpperCase(), x, y + 2, { width: 80, align: 'center' });
      doc.fillColor('#000000'); // reset
    };

    const checkPageBreak = (neededSpace) => {
      if (doc.y + neededSpace > doc.page.height - 60) {
        doc.addPage();
        drawHeader();
        return true;
      }
      return false;
    };

    // ================= CUERPO =================
    for (let i = 0; i < inspecciones.length; i++) {
      const insp = inspecciones[i];
      const startY = doc.y;

      // Estimar altura de la tarjeta
      let cardHeight = 110;
      const imagesToRender = [];

      const [tabletImg, radioImg, camarasImg] = await Promise.all([
        fetchImage(insp.img_tablet),
        fetchImage(insp.img_radio),
        fetchImage(insp.img_camaras)
      ]);

      if (res.destroyed) {
        doc.destroy();
        return;
      }

      if (insp.img_tablet) {
        imagesToRender.push({ label: 'Tablet', data: tabletImg });
      }

      if (insp.img_radio) {
        imagesToRender.push({ label: 'Radio Base', data: radioImg });
      }

      if (insp.img_camaras) {
        imagesToRender.push({ label: 'Cámaras', data: camarasImg });
      }

      if (imagesToRender.length > 0) cardHeight += 160; // Espacio extra para fotos

      // Calcular altura extra por observaciones
      const obsText = insp.observaciones ? insp.observaciones.trim() : 'Ninguna';
      const obsHeight = doc.heightOfString(`Observaciones: ${obsText}`, { width: doc.page.width - 100, fontSize: 9 });
      cardHeight += obsHeight;

      checkPageBreak(cardHeight + 20);
      const cardY = doc.y;

      // Dibujar fondo de tarjeta
      doc.rect(40, cardY, doc.page.width - 80, cardHeight).fill('#F8FAFC').lineWidth(1).strokeColor('#E2E8F0').stroke();

      // Cabecera de la tarjeta
      doc.rect(40, cardY, doc.page.width - 80, 25).fill('#F1F5F9');
      doc.fillColor('#101B33').fontSize(11).font('Helvetica-Bold').text(`Inspección ID: ${insp.id}   |   Placa: ${insp.placa}`, 50, cardY + 7);
      doc.fontSize(9).font('Helvetica').text(`${formatDMY(insp.fecha)} ${insp.hora}`, 40, cardY + 7, { align: 'right', width: doc.page.width - 90 });

      doc.fillColor('#334155');
      let currentY = cardY + 35;

      // Fila 1: Programa
      doc.fontSize(9).font('Helvetica-Bold').text('Programa:', 50, currentY, { continued: true }).font('Helvetica').text(` ${insp.programa || 'Sin Operación'}`);
      currentY += 20;

      // Fila 2: Estados
      doc.font('Helvetica-Bold').text('Equipos:', 50, currentY);
      doc.font('Helvetica').text('Tablet:', 120, currentY); drawBadge(insp.tablet || 'S/D', 160, currentY);
      doc.font('Helvetica').text('Radio:', 250, currentY); drawBadge(insp.radio || 'S/D', 290, currentY);
      doc.font('Helvetica').text('Cámaras:', 380, currentY); drawBadge(insp.camaras || 'S/D', 430, currentY);
      currentY += 25;

      // Fila 3: Observaciones
      doc.font('Helvetica-Bold').fillColor('#1E293B').text('Observaciones:', 50, currentY);
      doc.font('Helvetica').fillColor('#475569').text(obsText, 130, currentY, { width: doc.page.width - 180 });
      currentY += obsHeight + 15;

      // Renderizar Imágenes
      if (imagesToRender.length > 0) {
        let imgX = 50;
        imagesToRender.forEach(img => {
          // Borde de la foto
          doc.rect(imgX, currentY, 150, 110).fill('#FFFFFF').strokeColor('#CBD5E1').lineWidth(1).stroke();
          try {
            if (!img.data) throw new Error('Foto no disponible');
            // fit centra la imagen gracias a align y valign
            doc.image(img.data, imgX + 2, currentY + 2, { width: 146, height: 106, fit: [146, 106], align: 'center', valign: 'center' });
          } catch (e) {
            console.warn('[PDF: insertar foto]', insp.id, img.label, e.message);
            doc.fillColor('#94A3B8').fontSize(8).text('(Foto no disponible)', imgX, currentY + 50, { width: 150, align: 'center' });
          }

          // Etiqueta debajo
          doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text(img.label.toUpperCase(), imgX, currentY + 115, { width: 150, align: 'center' });
          imgX += 160;
        });
        currentY += 140;
      }

      doc.y = cardY + cardHeight + 15; // Mover al final de la tarjeta
    }

    // Dibujar numeración de páginas en el pie
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica').text(`Página ${i + 1} de ${range.count}`, 0, doc.page.height - 30, { align: 'center' });
    }

    doc.end();

  } catch (error) {
    console.error('Error generando PDF', error);

    doc?.unpipe(res);
    doc?.destroy();

    if (res.destroyed) return;

    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');

      res.status(error.status || 500).json({
        error: error.status === 400
          ? error.message
          : 'No se pudo generar el PDF. Revisa la terminal del backend.'
      });
    } else {
      res.destroy(error);
    }
  }
};
