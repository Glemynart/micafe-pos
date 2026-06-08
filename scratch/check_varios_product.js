const fs = require('fs');
const initSqlJs = require('sql.js');

const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

(async () => {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    
    console.log('=== CHECKING FOR 1000 OR VARIOS IN DB ===');
    const res = db.exec("SELECT id, nombre, precio, stock, barcode FROM productos WHERE barcode = '1000' OR nombre LIKE '%Varios%' OR nombre LIKE '%VARIOS%'");
    if (res.length > 0) {
      const cols = res[0].columns;
      res[0].values.forEach(row => {
        const item = {};
        cols.forEach((c, i) => item[c] = row[i]);
        console.log(`Producto #${item.id}: Nombre="${item.nombre}", Precio=${item.precio}, Stock=${item.stock}, Barcode="${item.barcode}", Codigo="${item.codigo}"`);
      });
    } else {
      console.log('No matching product found.');
    }
  } else {
    console.log('Database not found.');
  }
})();
