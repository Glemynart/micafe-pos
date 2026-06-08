const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db');
db.get("SELECT valor FROM configuracion WHERE clave='factus_token'", (err, row) => {
  if (row) {
    require('fs').writeFileSync('token.txt', row.valor);
    console.log("Token saved.");
  }
});
db.close();
