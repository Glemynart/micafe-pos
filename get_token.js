const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.get('SELECT factus_token FROM configuracion LIMIT 1', function(err, row) {
  if (err) {
    console.error(err.message);
  } else {
    console.log(row.factus_token ? row.factus_token.substring(0,20) + '...' : 'No token found');
    const fs = require('fs');
    fs.writeFileSync('token.txt', row.factus_token || '');
  }
});
db.close();
