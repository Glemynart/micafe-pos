const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.all('SELECT name FROM sqlite_master WHERE type="table"', function(err, rows) {
  if (err) {
    console.error(err.message);
  } else {
    console.log(rows);
  }
});
db.close();
