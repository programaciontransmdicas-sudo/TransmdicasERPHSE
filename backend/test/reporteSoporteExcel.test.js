import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { generarExcelSoporte, seleccionarRegistrosPermitidos } from '../src/modules/tickets/reportes/excel.js';
test('Excel de tickets, pulseras y videos conserva las filas y los textos',async()=>{
  for(const tipo of ['tickets','pulseras','videos']){
    const bytes=await generarExcelSoporte(tipo,[{id:10,estado:'Resuelto',descripcion:'=1+1',resolucion_desc:'Equipo cambiado',placas:['V0T715']}]);
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
    const hoja=wb.worksheets[0];assert.equal(hoja.rowCount,2);
    if(tipo==='tickets'){assert.equal(hoja.getCell('K2').value,'=1+1');assert.equal(hoja.getCell('L2').value,'Equipo cambiado');}
    if(tipo==='videos')assert.equal(hoja.getCell('F2').value,'V0T715');
  }
});

test('la selección rechaza IDs que no están en la consulta autorizada',()=>{
  assert.equal(seleccionarRegistrosPermitidos([1,9],[{id:1}]),null);
  assert.deepEqual(seleccionarRegistrosPermitidos(['1'],[{id:1},{id:2}]),[{id:1}]);
});
