const Factus = require('./src/factus');
const path = require('path');
require('module').Module._cache[require.resolve('electron')] = {
  exports: { app: { getPath: () => process.env.APPDATA ? path.join(process.env.APPDATA, 'pos-tienda-barrio') : __dirname, isPackaged: false } }
};
const Database = require('./src/database');
const db = new Database();

async function run() {
  await db.open();
  await db.init();
  const cfg = await db.getConfig();
  const factus = new Factus({
    baseUrl:      cfg.factus_base_url      || 'https://api-sandbox.factus.com.co',
    clientId:     cfg.factus_client_id,
    clientSecret: cfg.factus_client_secret,
    username:     cfg.factus_username,
    password:     cfg.factus_password,
  });

  console.log('Iniciando proceso de habilitación automática...');
  
  // Obtener rangos de numeración dinámicamente
  console.log('Obteniendo rangos de numeración...');
  const rangesRes = await factus.getRangosNumeracion();
  const rangesList = rangesRes?.data?.data || rangesRes?.data || [];
  
  const facturaRange = rangesList.find(r => r.document === 'Factura de Venta');
  const creditoRange = rangesList.find(r => r.document === 'Nota Crédito');
  const debitoRange = rangesList.find(r => r.document === 'Nota Débito');

  if (!facturaRange) {
    console.error('❌ No se encontró rango para Factura de Venta');
    return;
  }
  console.log(`Rangos identificados: Factura (${facturaRange.id}), Nota Crédito (${creditoRange?.id || 'No encontrada'}), Nota Débito (${debitoRange?.id || 'No encontrada'})`);

  // 1. Crear 30 facturas
  const facturasEmitidas = [];
  for (let i = 1; i <= 30; i++) {
    try {
      console.log(`Emitiendo factura ${i}/30...`);
      const res = await factus.emitirFactura({
        numeroFactura: `AUTO-${Date.now()}-${i}`,
        rangoId: facturaRange.id,
        cliente: {
          identificacion: '222222222222',
          nombres: 'Consumidor Final',
          email: 'consumidor@final.com',
          direccion: 'Cra 1 1 1',
          telefono: '3000000000',
          tipo_documento: '13',
          tipo_persona: '2',
          municipio: '980' // Apartadó por defecto
        },
        items: [
          {
            codigo: '001',
            nombre: 'PRODUCTO DE PRUEBA DIAN',
            cantidad: 1,
            precio: 1000,
            iva: 19
          }
        ],
        total: 1000,
        metodoPago: 'Efectivo',
        fecha: new Date().toISOString()
      });

      if (res.ok && res.numero) {
        facturasEmitidas.push(res.numero);
        console.log(`✅ Factura ${i} exitosa: ${res.numero}`);
      } else {
        console.error(`❌ Error en factura ${i}:`, res.error);
      }
    } catch (e) {
      console.error(`❌ Error en factura ${i}:`, e.message);
    }
    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Usar las primeras 10 facturas para Notas Crédito
  console.log('\nIniciando emisión de 10 Notas Crédito...');
  for (let i = 0; i < 10; i++) {
    if (!facturasEmitidas[i]) break;
    try {
      console.log(`Emitiendo Nota Crédito para factura ${facturasEmitidas[i]}...`);
      const resNC = await factus.emitirNotaCredito({
        numeroFactura: `NC-AUTO-${Date.now()}-${i+1}`,
        rangoId: creditoRange?.id,
        numeroFacturaRef: facturasEmitidas[i],
        cufeRef: 'no-importa',
        motivo: 'Devolución parcial de los bienes',
        total: 1000,
        cliente: {
          identificacion: '222222222222',
          nombres: 'Consumidor Final',
          email: 'consumidor@final.com',
          direccion: 'Cra 1 1 1',
          telefono: '3000000000'
        },
        items: [
          {
            codigo: '001',
            nombre: 'PRODUCTO DE PRUEBA DIAN',
            cantidad: 1,
            precio: 1000,
            iva: 19
          }
        ],
        metodoPago: 'Efectivo',
        fecha: new Date().toISOString()
      });
      if (resNC.ok) console.log(`✅ Nota Crédito ${i+1} exitosa`);
      else console.error(`❌ Error NC ${i+1}:`, resNC.error);
    } catch (e) {
      console.error(`❌ Error NC ${i+1}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // 3. Usar las siguientes 10 facturas para Notas Débito
  console.log('\nIniciando emisión de 10 Notas Débito...');
  for (let i = 10; i < 20; i++) {
    if (!facturasEmitidas[i]) break;
    try {
      console.log(`Emitiendo Nota Débito para factura ${facturasEmitidas[i]}...`);
      const resND = await factus.emitirNotaDebito({
        numeroFactura: `ND-AUTO-${Date.now()}-${i-9}`,
        rangoId: debitoRange?.id,
        numeroFacturaRef: facturasEmitidas[i],
        cufeRef: 'no-importa',
        motivo: 'Intereses de mora',
        total: 1000,
        cliente: {
          identificacion: '222222222222',
          nombres: 'Consumidor Final',
          email: 'consumidor@final.com',
          direccion: 'Cra 1 1 1',
          telefono: '3000000000'
        },
        items: [
          {
            codigo: '001',
            nombre: 'PRODUCTO DE PRUEBA DIAN',
            cantidad: 1,
            precio: 1000,
            iva: 19
          }
        ],
        metodoPago: 'Efectivo',
        fecha: new Date().toISOString()
      });
      if (resND.ok) console.log(`✅ Nota Débito ${i-9} exitosa`);
      else console.error(`❌ Error ND ${i-9}:`, resND.error);
    } catch (e) {
      console.error(`❌ Error ND ${i-9}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n🎉 ¡PROCESO DE HABILITACIÓN COMPLETADO!');
}

run();
