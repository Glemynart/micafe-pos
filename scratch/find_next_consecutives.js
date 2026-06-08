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

async function findNextConsecutives() {
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

  console.log('=== CONSECUTIVOS DISPONIBLES EN PRODUCCIÓN ===\n');

  // 1. Factura Física Local
  const numFisica = cfg.num_factura_fisica || '1';
  console.log(`1. Ticket de Venta Físico (Interno POS):`);
  console.log(`   - Siguiente número a usar: ${numFisica}\n`);

  try {
    // 2. Factura Electrónica FE (Rango ID 1833)
    const resFE = await factus.getSiguienteNumero(cfg.factus_rango_id);
    if (resFE.ok) {
      console.log(`2. Factura Electrónica DIAN (Prefijo FE):`);
      console.log(`   - ID Rango: ${resFE.rangoId}`);
      console.log(`   - Siguiente número a usar: ${resFE.prefix}${resFE.siguiente}\n`);
    } else {
      console.log(`2. Factura Electrónica DIAN: Error al obtener (${resFE.error})\n`);
    }
  } catch (err) {
    console.log(`2. Factura Electrónica DIAN: Error al conectar (${err.message})\n`);
  }

  try {
    // 3. Nota Crédito NC (ID Rango 1828)
    const resNC = await factus.getSiguienteNumero(1828);
    if (resNC.ok) {
      console.log(`3. Nota Crédito Electrónica DIAN (Prefijo NC):`);
      console.log(`   - ID Rango: ${resNC.rangoId}`);
      console.log(`   - Siguiente número a usar: ${resNC.prefix}${resNC.siguiente}\n`);
    }
  } catch (err) {
    console.log(`3. Nota Crédito Electrónica DIAN: Error al conectar (${err.message})\n`);
  }

  try {
    // 4. Nota Débito ND (ID Rango 1829)
    const resND = await factus.getSiguienteNumero(1829);
    if (resND.ok) {
      console.log(`4. Nota Débito Electrónica DIAN (Prefijo ND):`);
      console.log(`   - ID Rango: ${resND.rangoId}`);
      console.log(`   - Siguiente número a usar: ${resND.prefix}${resND.siguiente}\n`);
    }
  } catch (err) {
    console.log(`4. Nota Débito Electrónica DIAN: Error al conectar (${err.message})\n`);
  }
}

findNextConsecutives();
