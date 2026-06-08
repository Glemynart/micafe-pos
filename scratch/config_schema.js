const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("PRAGMA table_info(configuracion);", (err, rows) => {
    console.log(rows);
  });
});
db.close();
