import ExcelJS from 'exceljs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El estado de la unidad se calcula desde la última inspección, con la misma
// regla que usa el listado de flota. No existe un estado manual en vehiculos.
import { calcularEstado } from '../modules/flota/service.js';

const uploadsDir =
  fileURLToPath(
    new URL(
      '../../uploads/',
      import.meta.url
    )
  );
const downloadImage = async (source) => {
  try {
    let buffer;
    const maxBytes = 8 * 1024 * 1024;
    if (/^https?:\/\//i.test(source)) {
      const url = new URL(source);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password) return null;
      url.pathname = url.pathname.replace('/image/upload/', '/image/upload/c_limit,w_300,h_300/q_auto/f_jpg/');
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
      if (!response.ok) { await response.body?.cancel(); return null; }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error('Imagen demasiado grande');
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    } else {
      const name = source.replace(/^\/?uploads\//, '');
      if (!name || name.includes('..') || /[\\/:]/.test(name)) return null;
      const filename = path.join(uploadsDir, name);
      if ((await stat(filename)).size > maxBytes) return null;
      buffer = await readFile(filename);
    }
    const signature = buffer.subarray(0, 8).toString('hex');
    const extension = signature.startsWith('ffd8ff') ? 'jpeg' : signature === '89504e470d0a1a0a' ? 'png' : signature.startsWith('474946383761') || signature.startsWith('474946383961') ? 'gif' : null;
    return extension ? { buffer, extension } : null;
  } catch {
    return null;
  }
};
export const generateMasterReport = async (pool, startDate, endDate, clienteOperacionId) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERPHC';
  workbook.created = new Date();


  const result = await pool.query(`
  SELECT
    i.*,

    i.fecha_hora::date AS fecha,
    TO_CHAR(i.fecha_hora, 'HH24:MI') AS hora,

    v.tipo_vehiculo,
    v.marca_tracto,
    v.modelo_tracto,
    v.anio_fabricacion,
    v.cliente,

    i.estado AS estado_operativo,

    COALESCE(
  NULLIF(BTRIM(v.operacion), ''),
  'Sin Operación'
) AS operacion,

    i.fecha_hora::date::text AS fecha_ejecutada_raw,

    COALESCE(m.frecuencia_dias, 180) AS frecuencia_dias,

    CASE
      WHEN i.camaras ILIKE '%OK%'
      THEN 'OK'
      ELSE COALESCE(m.dvr, 'N/A')
    END AS dvr,

    CASE
      WHEN i.tablet ILIKE '%OK%'
      THEN 'OK'
      ELSE COALESCE(m.copiloto, 'N/A')
    END AS copiloto,

    CASE
      WHEN i.radio ILIKE '%OK%'
      THEN 'OK'
      ELSE COALESCE(m.radio_base, 'N/A')
    END AS radio_base,

    COALESCE(m.handy, 'N/A') AS handy,
    COALESCE(m.camara_interna, 'N/A') AS camara_interna,
    COALESCE(m.camara_externa, 'N/A') AS camara_externa,
    COALESCE(m.camara_retroceso, 'N/A') AS camara_retroceso,
    COALESCE(m.sensores_retroceso, 'N/A') AS sensores_retroceso,
    COALESCE(m.sensores_delanteros, 'N/A') AS sensores_delanteros,
    COALESCE(m.sistema_adas, 'N/A') AS sistema_adas

  FROM vehiculos v

  JOIN LATERAL (
    SELECT x.*
    FROM inspecciones_flota x
    WHERE
      x.placa = v.placa
      AND x.fecha_hora >= $1::date
      AND x.fecha_hora < ($2::date + INTERVAL '1 day')
    ORDER BY
      x.fecha_hora DESC,
      x.id DESC
    LIMIT 1
  ) i ON true

  LEFT JOIN LATERAL (
    SELECT x.*
    FROM mantenimientos_tecnicos x
    WHERE x.placa = v.placa
    ORDER BY x.id DESC
    LIMIT 1
  ) m ON true

  WHERE v.cliente_operacion_id = $3::integer

  ORDER BY v.placa ASC
`, [startDate, endDate, clienteOperacionId]);
  const inspecciones = result.rows;
  if (!inspecciones.length) throw Object.assign(new Error('No hay inspecciones para esa operación en el período seleccionado'), { status: 404 });

  const urls = [...new Set(inspecciones.flatMap(row => [row.img_tablet, row.img_camaras, row.img_radio]).filter(url => typeof url === 'string' && url.trim()))];
  const images = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      images.set(url, await downloadImage(url));
    }
  }));
  const imageIds = new Map();


  // Helper para crear pestaña de Operaciones (LBB, PRX, AAQ, IND)
  const createOperationSheet = async (sheetName) => {
    const ws = workbook.addWorksheet(sheetName);

    ws.columns = [
      { header: 'FECHA', key: 'fecha', width: 15 },
      { header: 'HORA', key: 'hora', width: 10 },
      { header: 'PLACA', key: 'placa', width: 15 },
      { header: 'CONDUCTOR', key: 'conductor', width: 25 },
      { header: 'ESTADO COPILOTO (TABLET)', key: 'tablet', width: 25 },
      { header: 'OBSERVACIONES COPILOTO', key: 'obs_tablet', width: 35 },
      { header: 'EVIDENCIA COPILOTO', key: 'img_tablet', width: 25 },
      { header: 'ESTADO CÁMARAS', key: 'camaras', width: 25 },
      { header: 'OBSERVACIONES CÁMARAS', key: 'obs_camaras', width: 35 },
      { header: 'EVIDENCIA CÁMARAS', key: 'img_camaras', width: 25 },
      { header: 'ESTADO RADIO BASE', key: 'radio', width: 25 },
      { header: 'OBSERVACIONES RADIO BASE', key: 'obs_radio', width: 35 },
      { header: 'EVIDENCIAS RADIO BASE', key: 'img_radio', width: 25 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E9F6E' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    const rows = inspecciones;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;

      const xlRow = ws.addRow({
        fecha: row.fecha,
        hora: row.hora,
        placa: row.placa,
        conductor: row.conductor,
        tablet: row.tablet,
        obs_tablet: row.observaciones,
        img_tablet: '',
        camaras: row.camaras,
        obs_camaras: '',
        img_camaras: '',
        radio: row.radio,
        obs_radio: '',
        img_radio: ''
      });

      xlRow.height = 80;
      xlRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      const imgFields = [
        { url: row.img_tablet, colIndex: 6 },
        { url: row.img_camaras, colIndex: 9 },
        { url: row.img_radio, colIndex: 12 }
      ];

      for (const field of imgFields) {
        if (!field.url) continue;
        const cell = ws.getCell(rowIndex, field.colIndex + 1);
        const isWeb = /^https?:\/\//i.test(field.url);
        cell.value = isWeb ? { text: 'Ver original', hyperlink: field.url } : field.url;
        cell.alignment = { vertical: 'bottom', horizontal: 'center', wrapText: true };
        const img = images.get(field.url);
        if (!img) { cell.note = 'No se pudo incrustar la imagen; se conserva su referencia original.'; continue; }
        if (!imageIds.has(field.url)) imageIds.set(field.url, workbook.addImage(img));
        ws.addImage(imageIds.get(field.url), { tl: { col: field.colIndex, row: rowIndex - 1 }, ext: { width: 100, height: 80 } });
      }
    }
  };

  // ==============================================
  // 1. TI-PR-01 (Mantenimiento Técnico)
  // ==============================================
  const ws1 = workbook.addWorksheet('TI-PR-01', { views: [{ showGridLines: false }] });

  const borderAll = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const fontBold = { bold: true, name: 'Arial', size: 10 };
  const fontNormal = { name: 'Arial', size: 9 };
  const centerAlign = { vertical: 'middle', horizontal: 'center', wrapText: true };

  ws1.mergeCells('A1:U1');
  const f1 = ws1.getCell('A1');
  f1.value = 'PROGRAMA';
  f1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101B33' } };
  f1.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  f1.alignment = centerAlign;
  f1.border = borderAll;

  ws1.getCell('V1').value = 'TI - PR - 01';
  ws1.getCell('V1').font = fontBold;
  ws1.getCell('V1').alignment = centerAlign;
  ws1.getCell('V1').border = borderAll;

  ws1.mergeCells('D2:U5');
  const titulo = ws1.getCell('D2');
  titulo.value = 'MANTENIMIENTO DE EQUIPOS TECNOLÓGICOS - TRACTO/CAMIONETAS';
  titulo.font = { bold: true, size: 14, name: 'Arial' };
  titulo.alignment = centerAlign;
  titulo.border = borderAll;

  ws1.mergeCells('A2:C5');
  ws1.getCell('A2').value = 'TRANSMDICAS S.R.L.';
  ws1.getCell('A2').alignment = centerAlign;
  ws1.getCell('A2').font = fontBold;
  ws1.getCell('A2').border = borderAll;

  const metadata = ['Versión:', 'Fecha:', 'Revisa:', 'Aprueba:'];
  for (let i = 0; i < 4; i++) {
    const c = ws1.getCell('V' + (i + 2));
    c.value = metadata[i];
    c.border = borderAll;
    c.font = fontNormal;
  }

  const greenHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E9F6E' } };
  ws1.mergeCells('A6:H6');
  ws1.getCell('A6').value = 'DATOS';
  ws1.mergeCells('I6:K6');
  ws1.getCell('I6').value = 'PROGRAMADO';
  ws1.mergeCells('L6:V6');
  ws1.getCell('L6').value = 'EJECUTADO';

  ['A6', 'I6', 'L6'].forEach(col => {
    const c = ws1.getCell(col);
    c.fill = greenHeader;
    c.font = fontBold;
    c.alignment = centerAlign;
    c.border = borderAll;
  });

  const headersMant = [
    'Nº', 'TIPO DE VEHÍCULO', 'PLACA', 'MARCA TRACTO', 'MODELO TRACTO', 'AÑO FABRICACIÓN TRACTO', 'OPERACIÓN', 'CLIENTE',
    'FECHA ULT MANTENIMIENTO', 'FRECUENCIA', 'FECHA PROX MANTENIMIENTO',
    'DVR', 'COPILOTO', 'RADIO BASE', 'HANDY', 'CAMARA INTERNA', 'CAMARA EXTERNA', 'CAMARA DE RETROCESO', 'SENSORES DE RETROCESO', 'SENSORES DELANTEROS', 'SISTEMA ADAS', 'FECHA EJECUTADA'
  ];
  const widthsMant = [4, 15, 12, 12, 12, 15, 12, 12, 15, 10, 15, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 15];

  headersMant.forEach((h, index) => {
    const colLetter = ws1.getColumn(index + 1).letter;
    const c = ws1.getCell(colLetter + '7');
    c.value = h;
    c.fill = greenHeader;
    c.font = { bold: true, size: 8, name: 'Arial' };
    c.alignment = centerAlign;
    c.border = borderAll;
    ws1.getColumn(index + 1).width = widthsMant[index];
  });
  ws1.getRow(7).height = 80;


  const dataRes = { rows: inspecciones };
  let rowNum = 8;
  dataRes.rows.forEach((row, i) => {
    let rawF = row.fecha_ejecutada_raw;
    if (rawF && rawF.includes('--')) rawF = null;
    if (rawF && rawF.includes('/')) {
      const parts = rawF.split('/');
      if (parts.length === 3) rawF = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    let ultMant = rawF ? new Date(rawF) : null;
    let freq = row.frecuencia_dias || 30;
    let proxMant = null;
    if (ultMant) {
      proxMant = new Date(ultMant);
      proxMant.setDate(proxMant.getDate() + freq);
    }

    const formatDate = (d) => d ? d.toISOString().split('T')[0] : '';

    const rowData = [
      i + 1,
      row.tipo_vehiculo || '',
      row.placa,
      row.marca_tracto || '',
      row.modelo_tracto || '',
      row.anio_fabricacion || '',
      row.operacion || '',
      row.cliente || '',
      formatDate(ultMant),
      freq === 180 ? 'Semestral' : `${freq} días`,
      formatDate(proxMant),
      row.dvr || '', row.copiloto || '', row.radio_base || '', row.handy || '',
      row.camara_interna || '', row.camara_externa || '', row.camara_retroceso || '',
      row.sensores_retroceso || '', row.sensores_delanteros || '', row.sistema_adas || '',
      formatDate(ultMant)
    ];

    rowData.forEach((val, colIndex) => {
      const c = ws1.getCell(ws1.getColumn(colIndex + 1).letter + rowNum);
      c.value = val;
      c.font = fontNormal;
      c.alignment = centerAlign;
      c.border = borderAll;
    });
    rowNum++;
  });


  // ==============================================
  // 2. REGISTRO (Inspecciones - Gerencial)
  // ==============================================
  const ws2 = workbook.addWorksheet('REGISTRO');
  ws2.columns = [
    { header: 'PROGRAMA', key: 'programa', width: 20 },
    { header: 'PLACA', key: 'placa', width: 15 },
    { header: 'TIPO DE VEHÍCULO', key: 'tipo', width: 18 },
    { header: 'ESTADO DE VEHÍCULO', key: 'estado_vehiculo', width: 15 },
    { header: 'FECHA', key: 'fecha', width: 15 },
    { header: 'HORA', key: 'hora', width: 10 },
    { header: 'TABLET', key: 'tablet', width: 15 },
    { header: 'RADIO BASE', key: 'radio', width: 15 },
    { header: 'CÁMARAS', key: 'camaras', width: 15 },
    { header: 'OBSERVACIONES', key: 'observaciones', width: 45 }
  ];
  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2458E8' } };

  inspecciones.forEach(r => ws2.addRow({ ...r, tipo: r.tipo_vehiculo, programa: r.operacion, estado_vehiculo: calcularEstado(r) }));


const relacionNombre = [
  inspecciones[0]?.cliente,
  inspecciones[0]?.operacion
]
  .filter(Boolean)
  .join(' — ');

const sheetName =
  `OP ${relacionNombre}`
    .replace(/[\\/*?:\[\]\x00-\x1f]/g, ' ')
    .slice(0, 31)
    .trim()
    .replace(/'+$/, '');
  await createOperationSheet(sheetName);

  return workbook;
};