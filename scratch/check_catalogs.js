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

async function checkCatalogs() {
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

  const endpoints = [
    '/v2/catalogs/document-types',
    '/v2/document-types',
    '/v2/catalogs',
    '/v2/dian/document-types',
    '/v2/numbering-ranges/document-types',
  ];

  for (const ep of endpoints) {
    console.log(`Testing endpoint: ${ep}`);
    try {
      const res = await factus._request('GET', ep, null, token);
      console.log(`✅ SUCCESS for ${ep}:`);
      console.log(JSON.stringify(res, null, 2).slice(0, 800));
    } catch (error) {
      console.log(`❌ FAILED for ${ep}:`, error.message);
    }
  }
}

checkCatalogs();
