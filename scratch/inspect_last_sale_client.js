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

async function inspectLastSaleClient() {
  const db = new Database();
  await db.open();
  
  console.log('=== INSPECTING LAST 5 SALES ===');
  const sales = db._all('SELECT * FROM ventas ORDER BY id DESC LIMIT 5');
  
  for (const s of sales) {
    console.log(`\nVenta #${s.id}:`);
    console.log(`  Fecha: ${s.fecha}`);
    console.log(`  Total: $${s.total}`);
    console.log(`  Método Pago: ${s.metodo_pago}`);
    console.log(`  Cliente ID: ${s.cliente_id}`);
    
    // Check if electronic invoice exists
    const fe = db._get('SELECT * FROM facturas_electronicas WHERE venta_id = ?', [s.id]);
    if (fe) {
      console.log(`  Factura DIAN: SI (Número: ${fe.numero}, CUFE: ${fe.cufe})`);
    } else {
      console.log(`  Factura DIAN: NO ENVIADA/VALIDACIÓN FALLIDA`);
    }

    if (s.cliente_id) {
      const client = db._get('SELECT * FROM clientes WHERE id = ?', [s.cliente_id]);
      if (client) {
        console.log(`  Detalles del Cliente:`);
        console.log(`    Nombre: "${client.nombre}"`);
        console.log(`    Identificación: "${client.identificacion}"`);
        console.log(`    Tipo Documento: "${client.tipo_documento}"`);
        console.log(`    Email: "${client.email}"`);
        console.log(`    Teléfono: "${client.telefono}"`);
        console.log(`    Dirección: "${client.direccion}"`);
        console.log(`    Ciudad: "${client.ciudad}"`);
      } else {
        console.log(`  Cliente ID ${s.cliente_id} no encontrado en la tabla clientes.`);
      }
    } else {
      console.log(`  Cliente: Consumidor Final (Por Defecto)`);
    }
  }
}

inspectLastSaleClient();
