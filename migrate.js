const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db');
db.serialize(() => {
  db.run('ALTER TABLE clientes ADD COLUMN ciudad TEXT;', (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`La columna ciudad ya existe.`);
      } else {
        console.error(`Error:`, err.message);
      }
    } else {
      console.log(`Columna ciudad agregada exitosamente.`);
    }
  });
});
db.close();
