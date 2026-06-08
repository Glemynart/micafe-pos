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

async function fixPrefijoDian() {
  const db = new Database();
  await db.open();
  await db.init();

  console.log("Corrigiendo y asegurando TODAS las variables de resolución en la base de datos local...");
  
  try {
    // Seteamos tanto prefijo_dian (usado por el ticket) como prefijo_factura
    await db.setConfig('prefijo_dian', 'FE');
    await db.setConfig('prefijo_factura', 'FE');
    await db.setConfig('resolucion_dian', '18764110140429');
    await db.setConfig('rango_inicio', '1000001');
    await db.setConfig('rango_fin', '5000001');
    await db.setConfig('resolucion_vigencia', 'Desde 24-05-2026 hasta 24-05-2028');
    await db.setConfig('factus_rango_id', '1833');
    await db.setConfig('factus_activo', '1');

    console.log("✅ Configuración de base de datos local reparada con éxito.");
    
    // Imprimir para verificar
    const config = db.getConfig();
    console.log('\n=== VALORES ACTUALES EN LA BASE DE DATOS ===');
    for (const [k, v] of Object.entries(config)) {
      if (['prefijo_dian', 'prefijo_factura', 'resolucion_dian', 'rango_inicio', 'rango_fin', 'resolucion_vigencia', 'factus_rango_id', 'factus_activo'].includes(k)) {
        console.log(`  ${k}: ${v}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Error al reparar base de datos:", error.message);
  }
}

fixPrefijoDian();
