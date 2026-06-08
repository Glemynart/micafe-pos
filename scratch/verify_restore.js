const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.get("SELECT COUNT(*) as count FROM ventas", (err, row) => {
    if (err) console.error(err);
    else console.log("Ventas count:", row.count);
  });
  db.get("SELECT COUNT(*) as count FROM facturas_electronicas", (err, row) => {
    if (err) console.error(err);
    else console.log("Facturas count:", row.count);
  });
});
db.close();
