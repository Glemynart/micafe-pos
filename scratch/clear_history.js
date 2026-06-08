const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("BEGIN TRANSACTION;");
  
  // Borrar datos
  db.run("DELETE FROM facturas_electronicas;");
  db.run("DELETE FROM detalle_venta;");
  db.run("DELETE FROM ventas;");
  
  // Resetear contadores de autoincremento
  db.run("DELETE FROM sqlite_sequence WHERE name='facturas_electronicas';");
  db.run("DELETE FROM sqlite_sequence WHERE name='detalle_venta';");
  db.run("DELETE FROM sqlite_sequence WHERE name='ventas';");
  
  db.run("COMMIT;", (err) => {
    if (err) {
      console.error("❌ Error al reiniciar historial:", err.message);
    } else {
      console.log("✅ Historial de ventas y facturas reiniciado con éxito.");
    }
  });
});

db.close();
