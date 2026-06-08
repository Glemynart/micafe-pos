const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');

console.log('Searching for pos_tienda.db databases in AppData...');

const searchDirs = [
  path.join(appData, 'pos-tienda-barrio'),
  path.join(appData, 'MiTienda-POS'),
  path.join(appData, 'mitienda-pos'),
  path.join(appData, 'Electron')
];

(async () => {
  const SQL = await initSqlJs();
  
  for (const dir of searchDirs) {
    const dbPath = path.join(dir, 'pos_tienda.db');
    if (fs.existsSync(dbPath)) {
      console.log(`\n=== FOUND DATABASE AT: ${dbPath} ===`);
      const stat = fs.statSync(dbPath);
      console.log(`Last Modified: ${stat.mtime}`);
      console.log(`Size: ${stat.size} bytes`);
      
      try {
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(fileBuffer);
        
        // Query configuracion table
        const res = db.exec("SELECT clave, valor FROM configuracion");
        if (res.length > 0) {
          console.log('Current Config values:');
          res[0].values.forEach(row => {
            const [k, v] = row;
            if (['prefijo_factura', 'resolucion_dian', 'rango_inicio', 'rango_fin', 'resolucion_vigencia', 'factus_rango_id', 'factus_activo'].includes(k)) {
              console.log(`  ${k}: ${v}`);
            }
          });
        } else {
          console.log('configuracion table is empty or query returned no data.');
        }
      } catch (err) {
        console.error('Failed to read configuracion from this DB:', err.message);
      }
    }
  }
})();
