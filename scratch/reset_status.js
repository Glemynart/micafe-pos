const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT id, estado_dian FROM facturas_electronicas", (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Estados actuales:");
    console.log(rows);
    
    // Cambiar estado_dian a 'PENDIENTE' para todas las facturas
    db.run("UPDATE facturas_electronicas SET estado_dian = 'PENDIENTE'", (err) => {
      if (err) console.error(err);
      else console.log("✅ Todas las facturas han sido devueltas al estado PENDIENTE.");
    });
  });
});
db.close();
