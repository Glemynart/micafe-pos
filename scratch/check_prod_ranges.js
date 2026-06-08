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
const Factus = require('../src/factus.js');

async function checkProdRanges() {
  const db = new Database();
  await db.open();
  await db.init();
  const cfg = await db.getConfig();
  const factus = new Factus({
    baseUrl:      cfg.factus_base_url,
    clientId:     cfg.factus_client_id,
    clientSecret: cfg.factus_client_secret,
    username:     cfg.factus_username,
    password:     cfg.factus_password,
  });

  console.log("Conectando a:", factus.baseUrl);
  
  try {
    const ranges = await factus.getRangosNumeracion();
    console.log("✅ Rangos de numeración en PRODUCCIÓN:");
    console.log(JSON.stringify(ranges, null, 2));
    
    // Auto-configurar el rango SETP si existe
    if (ranges && ranges.data && ranges.data.data) {
       const setp = ranges.data.data.find(r => r.prefix === 'SETP');
       if (setp) {
           await db.setConfig('factus_rango_id', setp.id.toString());
           console.log(`✅ Rango SETP encontrado (ID: ${setp.id}) y guardado en la BD.`);
       }
    }
  } catch (error) {
    console.error("❌ Error conectando a Producción:", error.response?.data || error.message);
  }
}

checkProdRanges();
