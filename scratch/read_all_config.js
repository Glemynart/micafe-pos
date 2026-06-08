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

async function checkConfig() {
  const db = new Database();
  await db.open();
  const config = db.getConfig();
  console.log('=== CONFIGURATION VALUES IN SQLite ===');
  for (const [k, v] of Object.entries(config)) {
    console.log(`${k}: ${v}`);
  }
}

checkConfig();
