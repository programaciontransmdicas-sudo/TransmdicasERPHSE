import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
mock.module('../src/modules/programas/programacion/excel/repository.js', { namedExports: {
  leerProgramaExcel: async () => ({ version:{periodo_inicio:'2026-01-01',periodo_fin:'2026-12-31'}, unidades:[{placa:'AAA111'},{placa:'BBB222'}] })
} });
mock.module('../src/modules/programas/programacion/excel/service.js', { namedExports: {
  filtrosExcel: () => ({}), prepararReporte: datos => datos
} });
mock.module('../src/reports/excelProgramaTiPr01.js', { namedExports: {
  generarExcelPrograma: async datos => { const wb=new ExcelJS.Workbook(); const sh=wb.addWorksheet('TI-PR-01'); sh.addRow(datos.unidades.map(u => u.placa)); return wb; }
} });
mock.module('../src/services/cloudinaryService.js', { namedExports: { urlFirmadaEvidencia: (_id, ancho, formato) => `https://fake.invalid/${ancho}/${formato}` } });
const { generateMasterReport } = await import('../src/reports/ExcelMasterMantenimiento.js');

test('El Excel separa las OT de los resultados y conserva No aplica', async () => {
  const pool = { async query(sql) {
    if (sql.includes('SELECT id FROM programas_mantenimiento')) return { rows:[{id:90}] };
    if (sql.includes('SELECT placa FROM vehiculos')) return { rows:[{placa:'AAA111'}] };
    return { rows:[{orden_id:1,placa:'AAA111',fecha:'2026-11-11',resultado_visita:'EJECUTADO',tipo_equipo:'GPS',nivel_programado:'M3',resultado_equipo:'NO_APLICA',nivel_completado:null,observaciones:'NA',evidencias:[]}] };
  }};
  const libro = await generateMasterReport(pool,'2026-11-01','2026-11-30',4);
  assert.deepEqual(libro.worksheets.map(h=>h.name),['TI-PR-01','Órdenes cerradas','Equipos y evidencias']);
  assert.equal(libro.getWorksheet('TI-PR-01').getCell('A1').value,'AAA111');
  assert.equal(libro.getWorksheet('Equipos y evidencias').getCell('F2').value,'NO_APLICA');
  const buffer=await libro.xlsx.writeBuffer();
  const validado=new ExcelJS.Workbook(); await validado.xlsx.load(buffer);
  assert.equal(validado.getWorksheet('Equipos y evidencias').getCell('F2').value,'NO_APLICA');
});


test('Las evidencias se incrustan sin guardar la URL privada en el Excel', async () => {
  const pool = { async query(sql) {
    if (sql.includes('SELECT id FROM programas_mantenimiento')) return { rows:[{id:90}] };
    if (sql.includes('SELECT placa FROM vehiculos')) return { rows:[{placa:'AAA111'}] };
    return { rows:[{orden_id:1,placa:'AAA111',fecha:'2026-11-11',resultado_visita:'EJECUTADO',tipo_equipo:'CAMARAS',nivel_programado:'M1',resultado_equipo:'COMPLETADO',nivel_completado:'M1',evidencias:['privado']}] };
  }};
  const original=globalThis.fetch;
  globalThis.fetch=async url => {
    assert.match(url,/\/500\/jpg$/);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/VZQAAAAASUVORK5CYII=','base64');
    return {ok:true,body:new ReadableStream({start(c){c.enqueue(png);c.close()}})};
  };
  try {
    const libro=await generateMasterReport(pool,'2026-11-01','2026-11-30',4);
    assert.equal(libro.getWorksheet('Equipos y evidencias').getImages().length,1);
    assert.equal(libro.getWorksheet('Equipos y evidencias').getCell('I2').value,null);
    const bytes=await libro.xlsx.writeBuffer();
    const leido=new ExcelJS.Workbook(); await leido.xlsx.load(bytes);
    assert.equal(leido.getWorksheet('Equipos y evidencias').getImages().length,1);
  } finally { globalThis.fetch=original; }
});
