const fs = require('fs');
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const data = fs.readFileSync(dbPath);
const idx = data.indexOf(Buffer.from('ALEJANDRO ALBA'));
if (idx !== -1) {
  console.log(data.slice(idx, idx + 20));
}
