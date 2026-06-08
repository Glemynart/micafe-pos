const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("DELETE FROM facturas_electronicas;", (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("✅ Todas las facturas electrónicas han sido eliminadas. Ahora todas las ventas están Pendientes.");
  });
});
db.close();
