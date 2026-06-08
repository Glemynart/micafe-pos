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

async function testDocTypes() {
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

  const token = await factus._getToken();
  console.log("Token obtenido.");

  const docTypesToTest = [
    "1", "01", 1, "Factura de Venta", "Factura Electrónica", "Factura Electrónica de Venta", "factura", "invoice",
    "Factura de venta", "factura_venta", "sales_invoice"
  ];

  for (const docType of docTypesToTest) {
    console.log(`\nTesting document type: "${docType}" (type: ${typeof docType})`);
    const payload = {
      prefix: "SETP",
      from: 990000000,
      to: 995000000,
      current: 990000000,
      resolution_number: "18760000001",
      start_date: "2019-01-19",
      end_date: "2030-01-19",
      technical_key: "fc8eac422eba16e22ffd8c6f94b3f40a6e38162c",
      document: docType
    };

    try {
      const res = await factus._raw('POST', '/v2/numbering-ranges', JSON.stringify(payload), 'application/json', token);
      console.log(`✅ SUCCESS with "${docType}":`, JSON.stringify(res));
      break; // Stop if we found a working one!
    } catch (error) {
      console.log(`❌ FAILED with "${docType}":`, error.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

testDocTypes();
