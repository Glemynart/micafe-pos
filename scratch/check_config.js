const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT key, value FROM configuracion WHERE key LIKE 'factus_%'", (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Configuración de Factus actual:");
    console.log(rows);
  });
});
db.close();
