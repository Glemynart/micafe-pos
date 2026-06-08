const fs = require('fs');
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

async function findLogsAndErrors() {
  const appData = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio';
  console.log('=== CHECKING LOG FILES IN APPDATA ===');
  
  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach(f => {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        scanDir(fp);
      } else if (f.endsWith('.log') || f.endsWith('.txt')) {
        console.log(`Log file found: ${fp} (${stat.size} bytes)`);
        const content = fs.readFileSync(fp, 'utf8').split('\n');
        console.log('--- Last 20 lines ---');
        console.log(content.slice(-20).join('\n'));
        console.log('---------------------\n');
      }
    });
  };
  
  scanDir(appData);

  console.log('=== QUERYING SQLITE AUDIT TABLE ===');
  try {
    const db = new Database();
    await db.open();
    const audits = db._all('SELECT * FROM auditoria ORDER BY id DESC LIMIT 20');
    console.log(JSON.stringify(audits, null, 2));
  } catch (err) {
    console.error('Error querying SQLite:', err.message);
  }
}

findLogsAndErrors();
