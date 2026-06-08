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
    
    // Test native _run behavior directly
    db.db.run("INSERT INTO productos (nombre, precio, stock, categoria, emoji) VALUES ('Test Order', 100, 0, 'General', '📦')");
    const idBeforeSave = db.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
    await db.save();
    const idAfterSave = db.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
    
    console.log('ID before save:', idBeforeSave);
    console.log('ID after save:', idAfterSave);
  } catch (err) {
    console.error('Error:', err);
  }
})();
