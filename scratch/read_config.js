const path = require('path');
const mockElectron = {
  app: { getPath: () => 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio' }
};
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(arg) {
  if (arg === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};

const DB = require('../src/database.js');
(async () => {
  try {
    const db = new DB();
    await db.open();
    const config = db.getConfig();
    console.log('=== CURRENT DATABASE CONFIGURATION ===');
    for (const [k, v] of Object.entries(config)) {
      console.log(`${k}: ${v}`);
    }
  } catch (err) {
    console.error(err);
  }
})();
