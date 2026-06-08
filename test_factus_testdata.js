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
    const token = await factus._getToken();
    const res = await factus._request('GET', '/v2/dian/acquirer?identification_document_id=1&identification_number=1199991', null, token);
    console.log("TEST 1 (id):", JSON.stringify(res, null, 2));
  } catch(e) {
    console.error("TEST 1 ERROR:", e.response ? JSON.stringify(e.response.data) : e.message);
  }

  try {
    const token = await factus._getToken();
    const res = await factus._request('GET', '/v2/dian/acquirer?identification_document_code=1&identification_number=1199991', null, token);
    console.log("TEST 2 (code=1):", JSON.stringify(res, null, 2));
  } catch(e) {
    console.error("TEST 2 ERROR:", e.response ? JSON.stringify(e.response.data) : e.message);
  }

  try {
    const token = await factus._getToken();
    // 11 is DIAN's code for Registro civil
    const res = await factus._request('GET', '/v2/dian/acquirer?identification_document_code=11&identification_number=1199991', null, token);
    console.log("TEST 3 (code=11):", JSON.stringify(res, null, 2));
  } catch(e) {
    console.error("TEST 3 ERROR:", e.response ? JSON.stringify(e.response.data) : e.message);
  }
});
