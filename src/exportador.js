const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function exportarVentasExcel(ventas, outputPath) {
  const workbook = new ExcelJS.Workbook();
  // We use the template that is now stored in the project
  const templatePath = path.join(__dirname, '..', 'plantillas_ventas.xlsx');
  
  if (fs.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    // Fallback if template doesn't exist
    const sheet = workbook.addWorksheet('Historial de Ventas');
    sheet.addRow(['Factura N°', 'Fecha', 'Hora', 'Items', 'Subtotal', 'IVA', 'Impoconsumo', 'Total', 'Método de Pago', 'Estado DIAN', 'Observaciones']);
  }

  const worksheet = workbook.worksheets[0];

  // Update generation date in row 2, col B if it's the template
  if (fs.existsSync(templatePath)) {
    const today = new Date().toLocaleDateString('es-CO');
    const cell = worksheet.getCell('B2');
    if (cell && cell.value && cell.value.toString().includes('Generado el')) {
      cell.value = `Generado el: ${today}   |   Sistema: MiTienda POS`;
    }
  }

  // Find the first empty row starting from row 5
  let startRow = 5;
  if (!fs.existsSync(templatePath)) startRow = 2; // If fallback, start at 2

  // 1. Capture alternating row styles from template (rows 5 and 6)
  const stylesOdd = {};
  const stylesEven = {};
  if (fs.existsSync(templatePath)) {
    worksheet.getRow(5).eachCell({ includeEmpty: true }, (c, col) => { stylesOdd[col] = Object.assign({}, c.style); });
    worksheet.getRow(6).eachCell({ includeEmpty: true }, (c, col) => { stylesEven[col] = Object.assign({}, c.style); });
  }

  // 2. Find and capture the "TOTALES" row dynamically
  let totalesRowIndex = -1;
  let totalesRowStyles = {};
  let totalesRowFormulas = {};
  
  if (fs.existsSync(templatePath)) {
    for (let i = 5; i <= Math.max(50, worksheet.rowCount); i++) {
      const r = worksheet.getRow(i);
      const valB = r.getCell('B').value;
      const valA = r.getCell('A').value;
      const textA = valA ? valA.toString().toUpperCase() : '';
      const textB = valB ? valB.toString().toUpperCase() : '';
      
      if (textA.includes('TOTALES') || textB.includes('TOTALES')) {
        totalesRowIndex = i;
        r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          totalesRowStyles[colNumber] = Object.assign({}, cell.style);
          if (cell.formula) {
            totalesRowFormulas[colNumber] = { formula: cell.formula, result: cell.result };
          } else if (cell.value && cell.value.formula) {
            totalesRowFormulas[colNumber] = { formula: cell.value.formula, result: cell.value.result };
          } else {
            totalesRowFormulas[colNumber] = cell.value;
          }
        });
        
        // Clear the original TOTALES row so it doesn't get in the way
        r.eachCell({ includeEmpty: true }, (cell) => {
          cell.value = null;
          cell.style = {};
        });
        break;
      }
    }
  }

  // Clear template placeholder rows (e.g. 5 to 12) so they don't interfere
  if (fs.existsSync(templatePath) && totalesRowIndex > 5) {
    for (let i = 5; i < totalesRowIndex; i++) {
      const r = worksheet.getRow(i);
      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
        cell.style = {};
      });
    }
  }

  const lastRow = startRow + Math.max(0, ventas.length) - 1;

  // Insert data
  ventas.forEach((v, index) => {
    const rowIndex = startRow + index;
    const row = worksheet.getRow(rowIndex);
    
    // Split date and time
    const [fechaPart, horaPart] = (v.fecha || "").split(" ");

    // v contains the filtered data sent from the frontend
    row.getCell('A').value = v.id;
    row.getCell('B').value = fechaPart || "";
    row.getCell('C').value = horaPart || "";
    row.getCell('D').value = v.resumen || "";
    
    // Set values and format them with thousands separator
    ['E', 'F', 'G', 'H'].forEach((col, idx) => {
      const cell = row.getCell(col);
      let val = [v.subtotal_ventas, v.iva_total, v.impoconsumo_total, v.total][idx];
      if (idx === 0 && !val) val = v.total; // Fallback for subtotal
      cell.value = parseFloat(val || 0);
      cell.numFmt = '#,##0'; // Thousands separator, no decimals
    });

    row.getCell('I').value = (v.metodo_pago || "Efectivo").toUpperCase();
    row.getCell('J').value = v.cufe ? "Enviado DIAN" : "Pendiente";
    // Apply alternating styles
    if (fs.existsSync(templatePath)) {
      const stylesToUse = (index % 2 === 0) ? stylesOdd : stylesEven;
      Object.keys(stylesToUse).forEach(col => {
        row.getCell(parseInt(col)).style = stylesToUse[col];
      });
    }

    // We will use Conditional Formatting instead so it updates if the user manually changes the dropdown in Excel
    const isEnviado = !!v.cufe;

    // Wrap text for the "Items" column so it adjusts to the content
    const cellD = row.getCell('D');
    cellD.alignment = { ...(cellD.alignment || {}), wrapText: true, vertical: 'middle' };
    
    // Excel sometimes ignores auto-height in generated files, so we calculate it manually
    const textLength = (v.resumen || "").length;
    // Assume about 35 characters fit per line, and each line is 15 points high
    const estimatedLines = Math.max(1, Math.ceil(textLength / 35));
    row.height = estimatedLines * 15;

    row.commit();
  });

  // 3. Write TOTALES row at the end
  if (fs.existsSync(templatePath) && totalesRowIndex !== -1) {
    const newTotalesRow = worksheet.getRow(lastRow + 1);
    Object.keys(totalesRowFormulas).forEach(colNumber => {
      const cell = newTotalesRow.getCell(parseInt(colNumber));
      let valOrForm = totalesRowFormulas[colNumber];
      
      // Update ranges from X5:X12 to X5:X[lastRow]
      if (valOrForm && valOrForm.formula) {
        let newForm = valOrForm.formula.replace(/([A-Z]5:[A-Z])\d+/g, `$1${lastRow}`);
        cell.value = { formula: newForm };
      } else {
        cell.value = valOrForm;
      }
      
      if (totalesRowStyles[colNumber]) {
        cell.style = totalesRowStyles[colNumber];
      }
    });
    newTotalesRow.commit();
  }

  // Update formulas in Sheet 2 ("Resumen") if it exists
  if (workbook.worksheets.length > 1) {
    const sheet2 = workbook.worksheets[1];
    const lastRow = startRow + Math.max(0, ventas.length - 1);
    
    // Total de facturas
    sheet2.getCell('B3').value = { formula: `COUNTA('Historial de Ventas'!A5:A${lastRow})` };
    // Ventas totales (neto)
    sheet2.getCell('B4').value = { formula: `SUM('Historial de Ventas'!E5:E${lastRow})` };
    // Total IVA recaudado
    sheet2.getCell('B5').value = { formula: `SUM('Historial de Ventas'!F5:F${lastRow})` };
    // Total Impoconsumo
    sheet2.getCell('B6').value = { formula: `SUM('Historial de Ventas'!G5:G${lastRow})` };
    // Total recaudado
    sheet2.getCell('B7').value = { formula: `SUM('Historial de Ventas'!H5:H${lastRow})` };
    // Facturas Enviado DIAN
    sheet2.getCell('B8').value = { formula: `COUNTIF('Historial de Ventas'!J5:J${lastRow},"Enviado DIAN")` };
    // Facturas Pendientes
    sheet2.getCell('B9').value = { formula: `COUNTIF('Historial de Ventas'!J5:J${lastRow},"Pendiente")` };
    // Ventas EFECTIVO
    sheet2.getCell('B10').value = { formula: `SUMIF('Historial de Ventas'!I5:I${lastRow},"EFECTIVO",'Historial de Ventas'!H5:H${lastRow})` };
    // Ventas TRANSFERENCIA
    sheet2.getCell('B11').value = { formula: `SUMIF('Historial de Ventas'!I5:I${lastRow},"TRANSFERENCIA",'Historial de Ventas'!H5:H${lastRow})` };
    // Ventas TARJETA
    sheet2.getCell('B12').value = { formula: `SUMIF('Historial de Ventas'!I5:I${lastRow},"TARJETA",'Historial de Ventas'!H5:H${lastRow})` };
  }

  // Set the first sheet as the active tab when opening the file
  workbook.views = [
    {
      x: 0, y: 0, width: 10000, height: 20000,
      firstSheet: 0, activeTab: 0, visibility: 'visible'
    }
  ];

  // Add conditional formatting for Estado DIAN (Column J)
  worksheet.addConditionalFormatting({
    ref: `J${startRow}:J${Math.max(lastRow + 200, startRow + 500)}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"Enviado DIAN"'],
        style: {
          font: { color: { argb: 'FF155724' }, bold: true }, // Dark Green
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD4EDDA' } } // Light Green
        }
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"Pendiente"'],
        style: {
          font: { color: { argb: 'FF856404' }, bold: true }, // Dark Goldenrod
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3CD' } } // Light Yellow
        }
      }
    ]
  });

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = { exportarVentasExcel };
