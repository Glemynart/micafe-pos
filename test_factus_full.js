const sqlite3 = require('sqlite3').verbose();
const FactusAPI = require('./src/factus');
const dbPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\pos_tienda.db';
const db = new sqlite3.Database(dbPath);

db.all('SELECT clave, valor FROM configuracion', async (err, rows) => {
  const config = {};
  rows.forEach(r => config[r.clave] = r.valor);
  
  const factus = new FactusAPI({
    baseUrl: config.factus_base_url,
    clientId: config.factus_client_id,
    clientSecret: config.factus_client_secret,
    username: config.factus_username,
    password: config.factus_password
  });
  
  try {
    const res = await factus._request('GET', '/v2/dian/acquirer?identification_document_code=31&identification_number=8110125069', null, await factus._getToken());
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e.response ? JSON.stringify(e.response.data) : e.message);
  }
});
