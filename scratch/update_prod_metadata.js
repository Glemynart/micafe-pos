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

async function updateProdMetadata() {
  const db = new Database();
  await db.open();
  await db.init();

  console.log("Actualizando los metadatos de facturación en la base de datos local para Producción...");
  
  try {
    // Datos reales de la resolución de producción obtenidos de Factus:
    await db.setConfig('prefijo_factura', 'FEV');
    await db.setConfig('resolucion_dian', '18764094204385');
    await db.setConfig('rango_inicio', '1');
    await db.setConfig('rango_fin', '5000000');
    await db.setConfig('resolucion_vigencia', 'Desde 09-06-2025 hasta 09-06-2027');
    await db.setConfig('factus_activo', '1'); // Activar facturación Factus en el POS

    console.log("✅ Metadatos de facturación actualizados exitosamente en la base de datos.");
    
    // Imprimir configuración actualizada para verificar
    const config = db.getConfig();
    console.log('\n=== NUEVA CONFIGURACIÓN LOCAL ===');
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

updateProdMetadata();
