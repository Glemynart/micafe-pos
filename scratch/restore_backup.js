const path = require('path');
const mockElectron = {
  app: { 
    getPath: (name) => {
      if (name === 'userData') return 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio';
      if (name === 'temp') return 'C:\\Users\\seguc\\AppData\\Local\\Temp';
      return '';
    }
  },
  safeStorage: {
    decryptString: (buffer) => buffer.toString('utf-8'),
    encryptString: (string) => Buffer.from(string, 'utf-8')
  }
};
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
  if (request === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};

const Database = require('../src/database.js');
const BackupManager = require('../src/backup-manager.js');

async function restore() {
  const db = new Database();
  await db.open();
  
  const bm = new BackupManager(db);
  const backupFile = path.join(bm.backupDir, 'backup_2026-05-23T19-49-12-465Z.enc');
  
  console.log('Restoring from:', backupFile);
  const result = await bm.restoreFromLocal(backupFile);
  
  console.log('Restore result:', result);
}

restore().catch(console.error);
