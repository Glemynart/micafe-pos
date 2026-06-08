const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

(async () => {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    
    console.log('=== REAL TOP 10 SALES ===');
    const resSales = db.exec("SELECT * FROM ventas ORDER BY id DESC LIMIT 10");
    if (resSales.length > 0) {
      const cols = resSales[0].columns;
      resSales[0].values.forEach(row => {
        const item = {};
        cols.forEach((c, i) => item[c] = row[i]);
        console.log(`Venta #${item.id}: Fecha=${item.fecha}, Total=${item.total}, NumFactura=${item.numFactura}, ClienteId=${item.cliente_id}`);
        
        // Find electronic invoice
        const resFe = db.exec(`SELECT * FROM facturas_electronicas WHERE venta_id = ${item.id}`);
        if (resFe.length > 0) {
          const feCols = resFe[0].columns;
          const feItem = {};
          feCols.forEach((c, i) => feItem[c] = resFe[0].values[0][i]);
          console.log(`  -> Factura DIAN: SI (Número: ${feItem.numero}, CUFE: ${feItem.cufe})`);
        } else {
          console.log(`  -> Factura DIAN: NO`);
        }
      });
    } else {
      console.log('No sales found.');
    }
  } else {
    console.log('Database not found at ' + dbPath);
  }
})();
