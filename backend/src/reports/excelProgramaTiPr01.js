import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { placaVisible } from '../modules/programas/programacion/excel/service.js';

const plantilla = fileURLToPath(new URL('./plantillas/TI-PR-01.xlsx', import.meta.url));
const azul = '1F4E78';
const relleno = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });
const fechaExcel = iso => iso ? new Date(`${iso}T00:00:00Z`) : null;
const borde = { style: 'thin', color: { argb: 'FFB8C9D9' } };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };
const colores = { M1: ['DEEBF7', '000000'], M2: ['BDD7EE', '000000'], M3: ['2E5C8A', 'FFFFFF'] };
const columnasUnidad = [5,17,10,14,17,6,12,14,10,10,10,10,10,10,13,11];

// Se usa ExcelJS, que ya forma parte del backend, sobre una plantilla de encabezado
// limpia. No se redistribuye el Excel con las placas, fórmulas y registros antiguos.
export async function generarExcelPrograma(reporte) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(plantilla);
  wb.creator = 'TRANSMDICAS';
  wb.created = fechaExcel(reporte.fecha_negocio);
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const sh = wb.getWorksheet('TI-PR-01');
  // ExcelJS comparte objetos de estilo al leer un archivo. Separarlos evita que dar
  // formato de fecha a AB3 convierta también la versión «01» en una fecha.
  sh.eachRow({includeEmpty:true}, row => row.eachCell({includeEmpty:true}, cell => {
    cell.style = structuredClone(cell.style);
  }));
  const n = reporte.quincenas.length;
  const resumen = 17 + n;
  const ultimaColumna = resumen + 3;
  const letra = col => sh.getColumn(col).letter;
  const last = letra(ultimaColumna);
  const ultimaFila = Math.max(8, reporte.filas.length + 7);

  // Las quincenas proceden del período vigente, incluyendo destinos que lo extienden.
  // No se fija septiembre-diciembre ni se pierden las columnas que crucen de año.
  for (const r of ['A1:C5','D1:Z1','D2:Z5','AA1:AB1','A6:H6','I6:P6','Q6:X6','Y6:AB6']) sh.unMergeCells(r);
  for (let r = 1; r <= 7; r++) {
    for (let c = 1; c <= Math.max(28, ultimaColumna); c++) sh.getCell(r,c).value = null;
  }
  const tituloFinal = letra(resumen + 1);
  const meta = letra(resumen + 2);
  const merge = (rango, valor) => { sh.mergeCells(rango); sh.getCell(rango.split(':')[0]).value = valor; };
  merge('A1:C5', 'TRANSMDICAS S.R.L.');
  merge(`D1:${tituloFinal}1`, 'PROGRAMA');
  merge(`D2:${tituloFinal}5`, reporte.programa.nombre);
  merge(`${meta}1:${last}1`, reporte.programa.codigo);
  for (const [r, etiqueta, valor] of [[2,'Versión:',reporte.version.version],
    [3,'Fecha:',fechaExcel(reporte.version.fecha_documento)], [4,'Revisa:','JHSE'], [5,'Aprueba:','GG']]) {
    sh.getCell(r,resumen+2).value = etiqueta;
    sh.getCell(r,resumen+3).value = valor;
  }
  sh.getCell(3,resumen+3).numFmt = 'dd/mm/yyyy';
  sh.getCell(2,resumen+3).numFmt = '@';
  merge('A6:H6', 'DATOS DE LA UNIDAD');
  merge('I6:P6', 'CICLO DE MANTENIMIENTO');
  merge(`Q6:${letra(resumen-1)}6`, 'PROGRAMACIÓN POR QUINCENA');
  merge(`${letra(resumen)}6:${last}6`, 'CUMPLIMIENTO DEL PERIODO');
  const headers = ['N°','TIPO DE VEHÍCULO','PLACA','MARCA','MODELO','AÑO','OPERACIÓN','CLIENTE',
    'ÚLT. M1','PRÓX. M1','ÚLT. M2','PRÓX. M2','ÚLT. M3','PRÓX. M3','ESTADO','QUINC. ARRANQUE DEL CICLO',
    ...reporte.quincenas.map(fechaExcel), 'PROGRAMADOS','EJECUTADOS','% CUMPL.','OBSERVACIONES'];
  sh.getRow(7).values = headers;
  [...columnasUnidad,...Array(n).fill(7),11,11,9,26].forEach((w,i) => { sh.getColumn(i+1).width = w; });
  // Retirar el formato sobrante cuando un período tiene menos de ocho quincenas.
  for (let c=ultimaColumna+1;c<=28;c++) {
    for (let r=1;r<=8;r++) sh.getCell(r,c).style={};
  }
  for (let r=1; r<=5; r++) {
    sh.getRow(r).height = 19;
    for (let c=1;c<=ultimaColumna;c++) {
      const cell=sh.getCell(r,c);
      cell.font={name:'Arial',size:c<=3?12:c<resumen+2?11:8,bold:true,color:{argb:'FF000000'}};
      cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      cell.border=bordes;
      cell.fill=relleno('FFFFFF');
    }
  }
  for (let r=6;r<=7;r++) {
    sh.getRow(r).height=r===6?26:46;
    for(let c=1;c<=ultimaColumna;c++) {
      const cell=sh.getCell(r,c);
      cell.font={name:'Arial',size:8,bold:true,color:{argb:'FFFFFFFF'}};
      cell.fill=relleno(azul);
      cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      cell.border=bordes;
      if(r===7 && c>=17 && c<resumen) cell.numFmt='dd/mm/yyyy';
    }
  }

  reporte.filas.forEach((f,i) => {
    const r=i+8, u=f.unidad;
    const row=sh.getRow(r);
    row.values=[i+1,u.tipo_vehiculo || null,placaVisible(u.placa),u.marca_tracto || null,u.modelo_tracto || null,
      u.anio_fabricacion ?? null,u.operacion || null,u.cliente || null,
      fechaExcel(f.ultimas[0]),fechaExcel(f.proximas[0]),fechaExcel(f.ultimas[1]),fechaExcel(f.proximas[1]),
      fechaExcel(f.ultimas[2]),fechaExcel(f.proximas[2]),f.estado,fechaExcel(f.arranque),
      ...reporte.quincenas.map(q => f.matriz.get(q)?.texto || null), f.programados,f.ejecutados,
      {formula:`IF(${letra(resumen)}${r}=0,"",${letra(resumen+1)}${r}/${letra(resumen)}${r})`,result:f.porcentaje??''},
      f.observaciones || null];
    // Las observaciones se imprimen completas. Sin truncar el motivo de reprogramación.
    const lineas=f.observaciones.split('\n').reduce((a,t) => a+Math.max(1,Math.ceil(t.length/38)),0);
    row.height=Math.min(409,Math.max(30,lineas*11));
    for(let c=1;c<=ultimaColumna;c++) {
      const cell=row.getCell(c);
      cell.font={name:'Arial',size:8,color:{argb:'FF000000'}};
      cell.alignment={vertical:'middle',horizontal:[1,6,resumen,resumen+1,resumen+2].includes(c)?'center':'left',wrapText:true};
      cell.border=bordes;
      cell.fill=relleno(i%2?'F5F8FC':'FFFFFF');
      if((c>=9 && c<=14)||c===16) cell.numFmt='dd/mm/yyyy';
    }
    row.getCell(resumen+2).numFmt='0%';
    row.getCell(ultimaColumna).alignment={vertical:'top',wrapText:true};
  });
  // Reglas nativas para conservar la leyenda M1/M2/M3 y los estados del formato.
  for(const [nivel,[fill,font]] of Object.entries(colores)) {
    sh.addConditionalFormatting({ref:`Q8:${letra(resumen-1)}${ultimaFila}`,rules:[{
      type:'expression',formulae:[`LEFT(Q8,2)="${nivel}"`],
      style:{fill:relleno(fill),font:{bold:nivel!=='M1',color:{argb:`FF${font}`}}}
    }]});
  }
  for(const [estado,fill,font] of [['VENCIDO','FFC7CE','9C0006'],['POR VENCER','FFEB9C','9C6500'],['AL DÍA','C6EFCE','006100']]) {
    sh.addConditionalFormatting({ref:`O8:O${ultimaFila}`,rules:[{type:'expression',formulae:[`O8="${estado}"`],
      style:{fill:relleno(fill),font:{color:{argb:`FF${font}`}}}}]});
  }
  const pct=letra(resumen+2);
  for(const [op,fill,font] of [['<','FFC7CE','9C0006'],['>=','C6EFCE','006100']]) {
    sh.addConditionalFormatting({ref:`${pct}8:${pct}${ultimaFila}`,rules:[{type:'expression',
      formulae:[`AND(ISNUMBER(${pct}8),${pct}8${op}0.9)`],style:{fill:relleno(fill),font:{color:{argb:`FF${font}`}}}}]});
  }
  sh.views=[{state:'frozen',xSplit:3,ySplit:7,topLeftCell:'D8',showGridLines:false}];
  sh.autoFilter={from:'A7',to:`${last}${ultimaFila}`};
  sh.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,
    printArea:`A1:${last}${ultimaFila}`,printTitlesRow:'1:7'};
  sh.headerFooter={oddFooter:`&L${reporte.programa.codigo}  |  Exportado ${reporte.fecha_negocio}&RPágina &P de &N`};
  return wb;
}
