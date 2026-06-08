const fs = require('fs');
const initSqlJs = require('sql.js');
(async () => {
  const SQL = await initSqlJs();
  const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
  const data = fs.readFileSync(dbPath);
  const db = new SQL.Database(data);
  const res = db.exec('SELECT id, nombre, direccion, ciudad FROM clientes');
  if (res.length > 0) {
    res[0].values.forEach(row => {
      // Dump string to hex to see actual bytes if it contains non-ascii
      const str = (row[1] || '') + (row[2] || '') + (row[3] || '');
      let hasWeird = false;
      for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 127) { hasWeird = true; break; }
      }
      if (hasWeird) {
        console.log(`ID: ${row[0]}, Nombre: ${row[1]}`);
      }
    });
  }
})();
