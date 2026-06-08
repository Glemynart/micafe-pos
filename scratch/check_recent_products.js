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
    // Query recently created products
    const res = db.db.exec("SELECT id, nombre, precio, stock, barcode, creado_en FROM productos ORDER BY creado_en DESC LIMIT 30");
    if (!res || !res.length) {
      console.log('No se encontraron productos en la base de datos.');
      return;
    }
    const { columns, values } = res[0];
    const products = values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    console.log(`Encontrados ${products.length} productos recientemente creados:`);
    console.log(JSON.stringify(products, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
