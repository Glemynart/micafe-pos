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

async function syncAndSaveSetp() {
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

  console.log("Conectando a la API de Producción:", factus.baseUrl);
  
  try {
    const ranges = await factus.getRangosNumeracion();
    console.log("✅ Conexión exitosa.");
    const lista = ranges?.data?.data || ranges?.data || [];
    
    console.log("Rangos de numeración activos en Factus Producción:");
    console.log(JSON.stringify(lista, null, 2));

    const setp = lista.find(r => r.prefix === 'SETP' || r.document === 'Factura de Venta');
    if (setp) {
      console.log(`\n🎉 ¡Rango SETP encontrado!`);
      console.log(`ID en Factus: ${setp.id}`);
      console.log(`Prefijo: ${setp.prefix}`);
      console.log(`Documento: ${setp.document}`);
      
      await db.setConfig('factus_rango_id', String(setp.id));
      console.log("✅ La base de datos del POS ha sido configurada con este rango de numeración.");
    } else {
      console.log("\n❌ Rango SETP (Factura de Venta) NO encontrado.");
      console.log("Por favor, asegúrate de haber asociado los prefijos en el portal de la DIAN y haberlos sincronizado en el panel web de Factus.");
    }
  } catch (error) {
    console.error("❌ Error de conexión:", error.message);
  }
}

syncAndSaveSetp();
