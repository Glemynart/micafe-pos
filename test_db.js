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

const DB = require('./src/database.js');
(async () => {
  try {
    const db = new DB();
    await db.open();
    const clientes = db.getAllClientes();
    console.log('Total clientes from getAllClientes:', clientes.length);
    if (clientes.length > 0) {
      console.log('First client:', clientes[0]);
    }
  } catch (err) {
    console.error(err);
  }
})();
