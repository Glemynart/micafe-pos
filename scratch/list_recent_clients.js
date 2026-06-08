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

async function listRecentClients() {
  const db = new Database();
  await db.open();
  
  console.log('=== CLIENTS IN SQLITE ===');
  const clients = db._all('SELECT * FROM clientes ORDER BY id DESC LIMIT 10');
  console.log(JSON.stringify(clients, null, 2));
}

listRecentClients();
