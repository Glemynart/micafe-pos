const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table';", [], (err, tables) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Tablas encontradas:");
    tables.forEach(t => console.log(t.name));
  });
});

db.close();
