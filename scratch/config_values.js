const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT clave, valor FROM configuracion WHERE clave LIKE 'factus_%'", (err, rows) => {
    console.log(rows);
  });
});
db.close();
