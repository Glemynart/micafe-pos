const fs = require('fs');
const initSqlJs = require('sql.js');

const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

(async () => {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    
    console.log('=== CHECKING STORE CONFIG ===');
    const res = db.exec("SELECT clave, valor FROM configuracion WHERE clave IN ('nombre_tienda', 'nombre_propietario')");
    if (res.length > 0) {
      res[0].values.forEach(row => {
        console.log(`  ${row[0]}: "${row[1]}"`);
      });
    } else {
      console.log('No configurations found.');
    }
  } else {
    console.log('Database not found.');
  }
})();
