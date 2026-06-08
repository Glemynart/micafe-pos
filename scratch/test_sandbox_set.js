const Factus = require('../src/factus.js');

async function testSandboxSet() {
  const factus = new Factus({
    baseUrl:      'https://api-sandbox.factus.com.co',
    clientId:     'a1d974a3-aed9-432e-95a9-5263da5cfb19',
    clientSecret: 'ub9g9pzxYXQQ3MoT6IyZ0pZHWomczWHbeBZpPvqi',
    username:     'eugeniam0926@gmail.com',
    password:     '71800393',
  });

  console.log("Conectando a Sandbox con credenciales del usuario...");
  
  try {
    const token = await factus._getToken();
    console.log("✅ Token obtenido exitosamente.");
    
    // Obtener rangos para ver el ID de SETP
    const ranges = await factus.getRangosNumeracion();
    const lista = ranges?.data?.data || ranges?.data || [];
    console.log("Rangos en Sandbox:");
    console.log(JSON.stringify(lista, null, 2));

    const setpRange = lista.find(r => r.prefix === 'SETP');
    if (!setpRange) {
      console.error("❌ Rango SETP no encontrado en Sandbox.");
      return;
    }

    console.log(`Usando rango SETP con ID: ${setpRange.id}`);

    const nextNumInfo = await factus.getSiguienteNumero(setpRange.id);
    const consecutive = nextNumInfo.prefix + nextNumInfo.siguiente;
    console.log(`Siguiente consecutivo de prueba: ${consecutive}`);

    const testSetId = "b3737646-76b7-436d-ba5a-4e966ffc0c16";

    // Payload de factura de prueba
    const payload = {
      observation:        'Venta de prueba Habilitación POS',
      payment_form:       1,
      payment_due_date:   new Date().toISOString().split('T')[0],
      payment_method_id:  10, // Efectivo
      numbering_range_id: setpRange.id,
      reference_code:     consecutive,
      test_set_id:        testSetId,
      payment_details: [
        {
          payment_form:        1,
          payment_method_code: "10",
          amount:              1100,
        },
      ],
      customer: {
        identification:              "222222222222",
        dv:                          null,
        company:                     null,
        trade_name:                  null,
        names:                       "Consumidor Final Pruebas",
        address:                     "Colombia",
        email:                       "consumidor@final.com",
        phone:                       "3000000000",
        legal_organization_id:       2,
        tribute_id:                  21,
        identification_document_id:  3,
        municipality_id:             980,
      },
      items: [
        {
          code_reference:     "7701101280591",
          name:               "ACEITE DE PRUEBA DIAN",
          quantity:           1,
          price:              924.37,
          discount_rate:      0,
          unit_measure_code:  '94',
          standard_code:      '1',
          is_excluded:        0,
          tribute_id:         '01',
          withholding_taxes:  [],
          taxes: [
            {
              code:           '01',
              rate:           '19.00',
              taxable_amount: '924.37',
              tax_amount:     '175.63',
            }
          ]
        }
      ],
    };

    console.log(`Emitiendo factura con test_set_id=${testSetId} en query params...`);
    // Probamos pasar test_set_id como query parameter
    const result = await factus._raw(
      'POST', 
      `/v2/bills/validate?test_set_id=${testSetId}`, 
      JSON.stringify(payload), 
      'application/json', 
      token
    );

    console.log("✅ Respuesta de Factus:");
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("❌ Error en la prueba:", error.message);
  }
}

testSandboxSet();
