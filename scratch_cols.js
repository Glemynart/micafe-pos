const ExcelJS = require('exceljs');
async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('c:/Users/seguc/Downloads/PROYECTO POS/Plantilla_Reporte_Ventas.xlsx');
  const sh = wb.worksheets[0];
  const r = sh.getRow(4);
  console.log('Col I:', r.getCell('I').value);
  console.log('Col J:', r.getCell('J').value);
  console.log('Col K:', r.getCell('K').value);
}
test();
