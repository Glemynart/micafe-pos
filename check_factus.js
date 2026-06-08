const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.all('SELECT clave, valor FROM configuracion WHERE clave LIKE "%factus%"', (err, rows) => {
  if (err) console.error(err);
  else console.log(rows.filter(r => r.clave === 'factus_base_url' || r.clave === 'factus_activo'));
});
