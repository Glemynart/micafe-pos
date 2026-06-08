const { app, safeStorage } = require('electron');
const path = require('path');

app.setPath('userData', 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio');

const Database = require('../src/database.js');
const BackupManager = require('../src/backup-manager.js');

app.whenReady().then(async () => {
  try {
    const db = new Database();
    await db.open();
    
    const bm = new BackupManager(db);
    const backupFile = path.join(bm.backupDir, 'backup_2026-05-23T19-49-12-465Z.enc');
    
    console.log('Restoring from:', backupFile);
    const result = await bm.restoreFromLocal(backupFile);
    
    console.log('Restore result:', result);
  } catch (err) {
    console.error(err);
  } finally {
    app.quit();
  }
});
