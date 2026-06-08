const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db');
db.all('SELECT * FROM facturas_electronicas LIMIT 3', (err, rows) => {
  if (err) console.error(err);
  else {
    if (rows.length === 0) console.log('No hay facturas electrónicas.');
    else { console.log('Columns:', Object.keys(rows[0])); console.log(rows); }
  }
});
