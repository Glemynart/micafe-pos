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
    const username = (cfg.factus_username || '').trim();

    const factus = new Factus({
      baseUrl:      cfg.factus_base_url || 'https://api-sandbox.factus.com.co',
      clientId:     cfg.factus_client_id,
      clientSecret: cfg.factus_client_secret,
      username:     username,
      password:     cfg.factus_password,
    });

    const token = await factus._getToken();
    console.log('Fetching last 10 bills...');
    const res = await factus._request('GET', '/v2/bills?limit=10', null, token);
    console.log('Response status:', res.status);
    console.log('Bills list:', JSON.stringify(res.data?.data || res.data || res, null, 2));

  } catch (err) {
    console.error('Error occurred:', err.message);
  }
})();
