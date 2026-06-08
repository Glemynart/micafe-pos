const ExcelJS = require('exceljs');
const path = require('path');

async function readTemplate() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, 'test_export.xlsx');
  
  try {
    await workbook.xlsx.readFile(filePath);
    const sheet1 = workbook.worksheets[0];
    for (let i = 4; i <= 15; i++) {
      console.log(`Row ${i}:`, sheet1.getRow(i).values);
    }
  } catch (err) {
    console.error('Error reading excel file:', err);
  }
}

readTemplate();
