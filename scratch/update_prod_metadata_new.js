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

async function updateProdMetadataNew() {
  const db = new Database();
  await db.open();
  await db.init();

  console.log("Actualizando los metadatos locales para el nuevo rango de facturación activo ID 1833 (prefijo FE)...");
  
  try {
    // Datos de la nueva resolución de facturación activa ID 1833
    await db.setConfig('factus_rango_id', '1833');
    await db.setConfig('prefijo_factura', 'FE');
    await db.setConfig('resolucion_dian', '18764110140429');
    await db.setConfig('rango_inicio', '1000001');
    await db.setConfig('rango_fin', '5000001');
    await db.setConfig('resolucion_vigencia', 'Desde 24-05-2026 hasta 24-05-2028');
    await db.setConfig('factus_activo', '1');

    console.log("✅ Metadatos de facturación actualizados exitosamente.");
    
    // Imprimir configuración para verificar
    const config = db.getConfig();
    console.log('\n=== NUEVA CONFIGURACIÓN LOCAL (ACTIVA) ===');
    console.log(`factus_activo: ${config.factus_activo}`);
    console.log(`factus_rango_id: ${config.factus_rango_id}`);
    console.log(`prefijo_factura: ${config.prefijo_factura}`);
    console.log(`resolucion_dian: ${config.resolucion_dian}`);
    console.log(`rango_inicio: ${config.rango_inicio}`);
    console.log(`rango_fin: ${config.rango_fin}`);
    console.log(`resolucion_vigencia: ${config.resolucion_vigencia}`);
    
  } catch (error) {
    console.error("❌ Error al actualizar metadatos:", error.message);
  }
}

updateProdMetadataNew();
