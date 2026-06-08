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

async function testFactusProd() {
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

  const testParams = {
    numeroFactura: 'SETP990000171',
    rangoId: null, // intentionally null to see if it works
    cliente: {
      identificacion: '222222222222',
      nombre: 'Consumidor final',
      tipo: 'CC',
      direccion: 'Cra 1 1 1',
      telefono: '3000000000',
      email: 'consumidor@final.com'
    },
    items: [
      {
        nombre: 'Producto de prueba',
        cantidad: 1,
        precio: 1000,
        iva: 0,
        impoconsumo: 0
      }
    ],
    total: 1000,
    metodoPago: 'Efectivo',
    fecha: new Date().toISOString().split('T')[0]
  };

  try {
    console.log("Enviando factura de prueba a Producción (Factus)...");
    const result = await factus.emitirFactura(testParams);
    console.log("✅ RESULTADO EXITOSO:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ ERROR DE FACTUS:");
    if (error.response && error.response.data) {
       console.error(JSON.stringify(error.response.data, null, 2));
    } else {
       console.error(error.message);
    }
  }
}

testFactusProd();
