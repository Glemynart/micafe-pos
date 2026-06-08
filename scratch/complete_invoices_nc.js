const Factus = require('../src/factus.js');

async function completeInvoicesNC() {
  const factus = new Factus({
    baseUrl:      'https://api-sandbox.factus.com.co',
    clientId:     'a1d974a3-aed9-432e-95a9-5263da5cfb19',
    clientSecret: 'ub9g9pzxYXQQ3MoT6IyZ0pZHWomczWHbeBZpPvqi',
    username:     'eugeniam0926@gmail.com',
    password:     '71800393',
  });

  const testSetId = "b3737646-76b7-436d-ba5a-4e966ffc0c16";
  console.log(`Completando Facturas y Notas de Crédito para test_set_id: ${testSetId}`);

  try {
    const token = await factus._getToken();
    console.log("✅ Autenticado en Factus Sandbox.");

    // Rangos de numeración
    const ranges = await factus.getRangosNumeracion();
    const lista = ranges?.data?.data || ranges?.data || [];
    
    const setpRange = lista.find(r => r.prefix === 'SETP');
    const ncRange   = lista.find(r => r.prefix === 'NC');

    if (!setpRange || !ncRange) {
      console.error("❌ No se encontraron los rangos SETP o NC.");
      return;
    }

    const facturasEmitidas = [];

    // 1. EMITIR 22 FACTURAS DE VENTA
    console.log("\n--- Iniciando emisión de 22 Facturas ---");
    for (let i = 1; i <= 22; i++) {
      const nextNumInfo = await factus.getSiguienteNumero(setpRange.id);
      const consecutive = nextNumInfo.prefix + nextNumInfo.siguiente;
      console.log(`[Factura ${i}/22] Emitiendo ${consecutive}...`);

      const payload = {
        observation:        `Factura de prueba Habilitación (Lote Completo) ${i}/22`,
        payment_form:       1,
        payment_due_date:   new Date().toISOString().split('T')[0],
        payment_method_id:  10,
        numbering_range_id: setpRange.id,
        reference_code:     consecutive,
        payment_details: [
          {
            payment_form:        1,
            payment_method_code: "10",
            amount:              1190,
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
            code_reference:     "001",
            name:               "PRODUCTO DE PRUEBA DIAN",
            quantity:           1,
            price:              1000,
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
                taxable_amount: '1000.00',
                tax_amount:     '190.00',
              }
            ]
          }
        ],
      };

      const result = await factus._raw(
        'POST',
        `/v2/bills/validate?test_set_id=${testSetId}`,
        JSON.stringify(payload),
        'application/json',
        token
      );

      if (result && result.data && result.data.number) {
        const num = result.data.number;
        facturasEmitidas.push(num);
        console.log(`   ✅ Guardada. Consecutivo: ${num}`);
      } else {
        console.error(`   ❌ Error al emitir factura ${i}:`, JSON.stringify(result));
        return;
      }

      await new Promise(r => setTimeout(r, 1200));
    }

    // 2. EMITIR 9 NOTAS CRÉDITO (Referenciando las primeras 9 facturas emitidas en esta tanda)
    console.log("\n--- Iniciando emisión de 9 Notas de Crédito ---");
    for (let i = 0; i < 9; i++) {
      const refFactura = facturasEmitidas[i];
      const nextNCInfo = await factus.getSiguienteNumero(ncRange.id);
      const ncConsecutive = nextNCInfo.prefix + nextNCInfo.siguiente;
      console.log(`[Nota Crédito ${i+1}/9] Emitiendo ${ncConsecutive} referenciando a ${refFactura}...`);

      const ncPayload = {
        observation:             'Devolución total de prueba lote DIAN',
        payment_form:            1,
        payment_due_date:        new Date().toISOString().split('T')[0],
        payment_method_id:       10,
        numbering_range_id:      ncRange.id,
        reference_code:          ncConsecutive,
        correction_concept_code: "2",
        bill_number:             refFactura,
        payment_details: [
          {
            payment_form:        1,
            payment_method_code: "10",
            amount:              1190,
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
            code_reference:     "001",
            name:               "PRODUCTO DE PRUEBA DIAN",
            quantity:           1,
            price:              1000,
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
                taxable_amount: '1000.00',
                tax_amount:     '190.00',
              }
            ]
          }
        ],
      };

      const ncResult = await factus._raw(
        'POST',
        `/v2/credit-notes/validate?test_set_id=${testSetId}`,
        JSON.stringify(ncPayload),
        'application/json',
        token
      );

      if (ncResult && ncResult.data && ncResult.data.number) {
        console.log(`   ✅ Nota Crédito emitida: ${ncResult.data.number}`);
      } else {
        console.error(`   ❌ Error en Nota Crédito ${i+1}:`, JSON.stringify(ncResult));
        return;
      }

      await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`\n🎉 Lote completado. Se enviaron las 22 Facturas y 9 Notas de Crédito restantes.`);
    console.log(`Total facturas enviadas hoy: 30`);
    console.log(`Total notas crédito enviadas hoy: 10`);
    console.log(`Verifique nuevamente su portal de la DIAN.`);

  } catch (error) {
    console.error("❌ Error en lote:", error.message);
  }
}

completeInvoicesNC();
