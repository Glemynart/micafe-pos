const path = require('path');
const mockElectron = { app: { getPath: () => 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio' } };
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(arg) {
  if (arg === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};
const DB = require('./src/database.js');
(async () => {
  const db = new DB();
  await db.open();
  const res = db.db.exec('SELECT * FROM clientes');
  if (res.length > 0) {
    console.log(`Total rows in table:`, res[0].values.length);
    console.log(`Columns:`, res[0].columns.join(', '));
    console.log(`First row:`, res[0].values[0]);
  } else {
    console.log(`Table is completely empty.`);
  }
})();
