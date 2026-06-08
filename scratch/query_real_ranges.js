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

async function queryRealRanges() {
  const db = new Database();
  await db.open();
  const cfg = db.getConfig();
  
  const factus = new Factus({
    baseUrl:      cfg.factus_base_url,
    clientId:     cfg.factus_client_id,
    clientSecret: cfg.factus_client_secret,
    username:     cfg.factus_username,
    password:     cfg.factus_password,
  });

  console.log("Conectando con Factus API en:", factus.baseUrl);
  
  try {
    const res = await factus.getRangosNumeracion();
    console.log("\n=== RESPUESTA DE FACTUS API ===");
    // Factus sometimes returns it wrapped in data or data.data
    const ranges = res.data?.data || res.data || res;
    
    if (Array.isArray(ranges)) {
      ranges.forEach((r, idx) => {
        console.log(`\nRango #${idx+1}:`);
        console.log(`  ID: ${r.id}`);
        console.log(`  Prefijo: ${r.prefix}`);
        console.log(`  Resolución: ${r.number}`);
        console.log(`  Rango: del ${r.from} al ${r.to}`);
        console.log(`  Vigencia: desde ${r.start_date} hasta ${r.end_date}`);
        console.log(`  Activo: ${r.is_active ? 'SÍ' : 'NO'}`);
      });
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
  } catch (error) {
    console.error("❌ Error al obtener rangos:", error.message);
  }
}

queryRealRanges();
