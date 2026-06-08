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
const Factus = require('../src/factus.js');

(async () => {
  try {
    const db = new DB();
    await db.open();
    const cfg = db.getConfig();
    
    // Trim username just in case of trailing spaces
    const username = (cfg.factus_username || '').trim();
    
    console.log('Testing with credentials:');
    console.log('Base URL:', cfg.factus_base_url);
    console.log('Client ID:', cfg.factus_client_id);
    console.log('Username:', `"${username}"`);
    console.log('Password length:', (cfg.factus_password || '').length);

    const factus = new Factus({
      baseUrl:      cfg.factus_base_url || 'https://api-sandbox.factus.com.co',
      clientId:     cfg.factus_client_id,
      clientSecret: cfg.factus_client_secret,
      username:     username,
      password:     cfg.factus_password,
    });

    console.log('Authenticating...');
    const token = await factus._getToken();
    console.log('Token obtained:', token.slice(0, 20) + '...');

    console.log('Fetching numbering ranges...');
    const ranges = await factus.getRangosNumeracion();
    console.log('Numbering ranges:', JSON.stringify(ranges, null, 2));

  } catch (err) {
    console.error('Error occurred:', err.message);
    if (err.stack) console.error(err.stack);
  }
})();
