const path = require('path');
const mockElectron = {
  app: { getPath: () => 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio' }
};
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
  if (request === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};

const Database = require('../src/database.js');
const Factus = require('../src/factus.js');

async function createProdRange() {
  const db = new Database();
  await db.open();
  await db.init();
  const cfg = await db.getConfig();
  const factus = new Factus({
    baseUrl:      cfg.factus_base_url,
    clientId:     cfg.factus_client_id,
    clientSecret: cfg.factus_client_secret,
    username:     cfg.factus_username,
    password:     cfg.factus_password,
  });

  console.log("Conectando a:", factus.baseUrl);
  
  try {
    const token = await factus._getToken();
    console.log("Token obtenido exitosamente.");
    
    const payload = {
      prefix: "SETP",
      from: 990000000,
      to: 995000000,
      resolution_number: "18760000001",
      start_date: "2019-01-19",
      end_date: "2030-01-19",
      technical_key: "fc8eac422eba16e22ffd8c6f94b3f40a6e38162c",
      document: "Factura de Venta"
    };

    console.log("Enviando POST /v2/numbering-ranges con payload:", JSON.stringify(payload, null, 2));
    const res = await factus._raw('POST', '/v2/numbering-ranges', JSON.stringify(payload), 'application/json', token);
    console.log("✅ Rango creado exitosamente:");
    console.log(JSON.stringify(res, null, 2));
    
  } catch (error) {
    console.error("❌ Error registrando el rango:", error.message);
  }
}

createProdRange();
