const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.get('SELECT * FROM ajustes LIMIT 1', function(err, row) {
  if (err) {
    console.error(err.message);
  } else {
    console.log(JSON.stringify(row, null, 2));
  }
});
db.close();
