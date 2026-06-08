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

async function getRanges() {
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

    const ranges = await factus.getRangosNumeracion();
    console.log("✅ Rangos de numeración activos:");
    console.log(JSON.stringify(ranges, null, 2));

  } catch (error) {
    console.error("❌ Error en prueba:", error);
  }
}

getRanges();
