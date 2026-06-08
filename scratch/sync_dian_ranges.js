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

async function syncDianRanges() {
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
    
    console.log("Consultando endpoint /v2/numbering-ranges/dian...");
    const dianRanges = await factus._request('GET', '/v2/numbering-ranges/dian', null, token);
    console.log("✅ Resoluciones disponibles en la DIAN:");
    console.log(JSON.stringify(dianRanges, null, 2));
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

syncDianRanges();
