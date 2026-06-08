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
    const barcode = "770test" + Math.floor(Math.random() * 10000);
    const prodCreado = {
      nombre: "Test Product " + Date.now(),
      precio: 1000,
      codigo: barcode,
      barcode: barcode,
      categoria: "General",
      stock: 0,
      iva: 19,
      impoconsumo: 0,
      emoji: "📦"
    };
    const res = await db.saveProducto(prodCreado);
    console.log('Result from saveProducto:', res);

    const inserted = db.db.exec(`SELECT * FROM productos WHERE barcode = '${barcode}'`);
    console.log('Inserted row from DB:', JSON.stringify(inserted, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
})();
