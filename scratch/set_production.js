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

async function updateConfig() {
  const db = new Database();
  await db.open();
  
  await db.setConfig('factus_base_url', 'https://api.factus.com.co');
  await db.setConfig('factus_username', 'eugeniam0926@gmail.com');
  await db.setConfig('factus_password', '71800393');
  await db.setConfig('factus_client_id', 'a1d97135-9777-4e83-b40b-e6c2970cae6d');
  await db.setConfig('factus_client_secret', 'Uw0bB8hMDdE48ls9AJvhYr1qrZ8iXsuiNPbnMC5R');
  
  console.log("✅ Credenciales de PRODUCCIÓN configuradas correctamente.");
}

updateConfig().catch(console.error);
