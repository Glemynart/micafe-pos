const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const FactusClient = require('./src/factus');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, 'pos-tienda-barrio', 'pos_tienda.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('No se encontro el archivo de base de datos en:', dbPath);
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Obtener config
  const rows = db.exec("SELECT clave, valor FROM configuracion");
  const config = {};
  if (rows.length > 0) {
    const values = rows[0].values;
    for (const val of values) {
      config[val[0]] = val[1];
    }
  }
  
  const client = new FactusClient({
    baseUrl: config.factus_base_url,
    clientId: config.factus_client_id,
    clientSecret: config.factus_client_secret,
    username: config.factus_username,
    password: config.factus_password
  });
  
  const testNit = '811002370';
  console.log(`Probando FactusClient.buscarCliente con NIT: ${testNit}...`);
  
  try {
    const res = await client.buscarCliente(testNit);
    console.log('RESULTADO OBTENIDO DE FactusClient.buscarCliente:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('ERROR AL LLAMAR FactusClient.buscarCliente:', err.message);
  }
}

main().catch(console.error);
