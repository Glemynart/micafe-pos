const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db');
db.get('SELECT * FROM configuracion LIMIT 1', (err, row) => {
  if(row) console.log(Object.keys(row));
});
db.close();
