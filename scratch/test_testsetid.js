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

async function testTestSetId() {
  try {
    const db = new Database();
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

    console.log("Iniciando prueba con test_set_id...");
    const facturaTest = {
      "observation": "Venta registrada en POS",
      "payment_form": 1,
      "payment_due_date": new Date().toISOString().split('T')[0],
      "payment_method_id": 10,
      "numbering_range_id": 2326,
      "reference_code": "TEST-SETID-" + Date.now(),
      "test_set_id": "b3737646-76b7-436d-ba5a-4e966ffc0c16",
      "testSetId": "b3737646-76b7-436d-ba5a-4e966ffc0c16",
      "payment_details": [
        {
          "payment_form": 1,
          "payment_method_code": "10",
          "amount": 1000
        }
      ],
      "customer": {
        "identification": "222222222222",
        "dv": null,
        "company": null,
        "trade_name": null,
        "names": "Consumidor Final Pruebas",
        "address": "Cra 1 1 1",
        "email": "consumidor@final.com",
        "phone": "3000000000",
        "legal_organization_id": 2,
        "tribute_id": 21,
        "identification_document_id": 3,
        "municipality_id": 980
      },
      "items": [
        {
          "code_reference": "001",
          "name": "PRODUCTO DE PRUEBA DIAN",
          "quantity": 1,
          "price": 840.34,
          "discount_rate": 0,
          "unit_measure_code": "94",
          "standard_code": "1",
          "is_excluded": 0,
          "tribute_id": "01",
          "withholding_taxes": [],
          "taxes": [
            {
              "code": "01",
              "rate": "19.00",
              "taxable_amount": "840.34",
              "tax_amount": "159.66"
            }
          ]
        }
      ]
    };

    console.log("Emitiendo factura con test_set_id en payload y query param...");
    const token = await factus._getToken();
    const payload = JSON.stringify(facturaTest);
    const result = await factus._raw('POST', '/v2/bills/validate?test_set_id=b3737646-76b7-436d-ba5a-4e966ffc0c16', payload, 'application/json', token);
    console.log("✅ Resultado Factus:", JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("❌ Error en prueba:", error);
  }
}

testTestSetId();
