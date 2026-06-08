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

async function testProdEmitDian() {
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

  console.log('=== TEST PROD INVOICE EMISSION ===');
  console.log('Base URL:', factus.baseUrl);
  console.log('Username:', factus.username);
  console.log('Range ID:', cfg.factus_rango_id);

  // 1. Get next number
  let numInfo;
  try {
    numInfo = await factus.getSiguienteNumero(cfg.factus_rango_id);
    console.log('Next Number Response:', numInfo);
    if (!numInfo.ok) {
      console.log('Failed to get next number.');
      return;
    }
  } catch (err) {
    console.error('Error fetching next number:', err.message);
    return;
  }

  // 2. Prepare test payload with CC (e.g. 71800393)
  const clientPayload = {
    tipo: 'CC',
    identificacion: '71800393',
    nombre: 'Jesus Zapata',
    email: 'eugeniam0926@gmail.com',
    telefono: '3233446844',
    direccion: 'Calle 92 #95A-119'
  };

  const testItems = [
    {
      id: '9999',
      nombre: 'PRODUCTO PRUEBA PRODUCCION',
      precio: 1000,
      cantidad: 1,
      barcode: '7701234567890',
      iva: 0,
      impoconsumo: 0
    }
  ];

  console.log('\nSending Invoice for CC...');
  try {
    const res = await factus.emitirFactura({
      ventaId: 999999,
      items: testItems,
      total: 1000,
      metodoPago: 'Efectivo',
      fecha: new Date().toISOString().split('T')[0],
      cliente: clientPayload,
      numeroFactura: numInfo.prefix + numInfo.siguiente,
      rangoId: numInfo.rangoId
    });
    console.log('CC Invoicing Success!:', res);
  } catch (err) {
    console.error('❌ CC Invoicing Failed! Raw Message:', err.message);
  }
}

testProdEmitDian();
