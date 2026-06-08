const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("PRAGMA table_info(facturas_electronicas);", (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Columnas:");
    rows.forEach(r => console.log(r.name));
    
    db.all("SELECT id, estado FROM facturas_electronicas LIMIT 5", (err, rows2) => {
       console.log("Datos de estado:", rows2);
       
       db.run("UPDATE facturas_electronicas SET estado = 'PENDIENTE'", (err) => {
           if (err) console.error(err);
           else console.log("✅ Todas las facturas han sido devueltas al estado PENDIENTE.");
       });
    });
  });
});
db.close();
