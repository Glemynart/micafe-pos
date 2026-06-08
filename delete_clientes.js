const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.run('DELETE FROM clientes', function(err) {
  if (err) {
    console.error(err.message);
  } else {
    console.log(`Deleted ${this.changes} rows from clientes.`);
  }
});

db.close();
