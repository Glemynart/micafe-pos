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

async function checkInvoice() {
  try {
    const db = new Database();
    await db.open();
    await db.init();
    const cfg = await db.getConfig();
    const factus = new Factus({
      baseUrl:      cfg.factus_base_url      || 'https://api-sandbox.factus.com.co',
      clientId:     cfg.factus_client_id,
      clientSecret: cfg.factus_client_secret,
      username:     cfg.factus_username,
      password:     cfg.factus_password,
    });

    const token = await factus._getToken();
    const result = await factus._request('GET', '/v2/bills?filter[number]=SETP990000170', null, token);
    
    console.log("✅ Detalle de la factura SETP990000170:");
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("❌ Error en prueba:", error);
  }
}

checkInvoice();
