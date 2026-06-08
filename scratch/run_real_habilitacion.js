const Factus = require('../src/factus.js');

async function runRealHabilitacion() {
  const factus = new Factus({
    baseUrl:      'https://api-sandbox.factus.com.co',
    clientId:     'a1d974a3-aed9-432e-95a9-5263da5cfb19',
    clientSecret: 'ub9g9pzxYXQQ3MoT6IyZ0pZHWomczWHbeBZpPvqi',
    username:     'eugeniam0926@gmail.com',
    password:     '71800393',
  });

  const testSetId = "b3737646-76b7-436d-ba5a-4e966ffc0c16";
  console.log(`Iniciando Set de Pruebas DIAN con test_set_id: ${testSetId}`);

  try {
    const token = await factus._getToken();
    console.log("✅ Autenticado en Factus Sandbox.");

    // Rangos de numeración en Sandbox
    const ranges = await factus.getRangosNumeracion();
    const lista = ranges?.data?.data || ranges?.data || [];
    
    const setpRange = lista.find(r => r.prefix === 'SETP');
    const ncRange   = lista.find(r => r.prefix === 'NC');
    const ndRange   = lista.find(r => r.prefix === 'ND');

    if (!setpRange || !ncRange || !ndRange) {
      console.error("❌ No se encontraron los rangos SETP, NC o ND necesarios.");
      return;
    }

    console.log(`\nRangos identificados:`);
    console.log(`- Factura SETP (ID: ${setpRange.id})`);
    console.log(`- Nota Crédito NC (ID: ${ncRange.id})`);
    console.log(`- Nota Débito ND (ID: ${ndRange.id})\n`);

    const facturasEmitidas = [];

    // 1. EMITIR 8 FACTURAS
    for (let i = 1; i <= 8; i++) {
      const nextNumInfo = await factus.getSiguienteNumero(setpRange.id);
      const consecutive = nextNumInfo.prefix + nextNumInfo.siguiente;
      console.log(`[Factura ${i}/8] Emitiendo ${consecutive}...`);

      const payload = {
        observation:        `Factura de prueba Habilitación ${i}/8`,
        payment_form:       1,
        payment_due_date:   new Date().toISOString().split('T')[0],
        payment_method_id:  10, // Efectivo
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
        console.log(`   ✅ Guardada con éxito. Número: ${num}, CUFE: ${result.data.cufe?.slice(0, 20)}...`);
      } else {
        console.error(`   ❌ Error al emitir factura ${i}:`, JSON.stringify(result));
        return;
      }

      // Esperar 1.5s entre solicitudes
      await new Promise(r => setTimeout(r, 1500));
    }

    if (facturasEmitidas.length < 2) {
      console.error("❌ No se emitieron suficientes facturas para hacer las notas.");
      return;
    }

    // 2. EMITIR 1 NOTA CRÉDITO (Referenciando la factura 1)
    const refFacturaNC = facturasEmitidas[0];
    const nextNCInfo = await factus.getSiguienteNumero(ncRange.id);
    const ncConsecutive = nextNCInfo.prefix + nextNCInfo.siguiente;
    console.log(`\n[Nota Crédito] Emitiendo ${ncConsecutive} referenciando a ${refFacturaNC}...`);

    const ncPayload = {
      observation:             'Devolución total de prueba DIAN',
      payment_form:            1,
      payment_due_date:        new Date().toISOString().split('T')[0],
      payment_method_id:       10, // Efectivo
      numbering_range_id:      ncRange.id,
      reference_code:          ncConsecutive,
      correction_concept_code: "2", // Devolución total
      bill_number:             refFacturaNC,
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
      console.error("   ❌ Error al emitir Nota Crédito:", JSON.stringify(ncResult));
      return;
    }

    await new Promise(r => setTimeout(r, 1500));

    // 3. EMITIR 1 NOTA DÉBITO (Referenciando la factura 2)
    const refFacturaND = facturasEmitidas[1];
    const nextNDInfo = await factus.getSiguienteNumero(ndRange.id);
    const ndConsecutive = nextNDInfo.prefix + nextNDInfo.siguiente;
    console.log(`\n[Nota Débito] Emitiendo ${ndConsecutive} referenciando a ${refFacturaND}...`);

    const ndPayload = {
      observation:             'Ajuste de valor por pruebas DIAN',
      payment_form:            1,
      payment_due_date:        new Date().toISOString().split('T')[0],
      payment_method_id:       10, // Efectivo
      numbering_range_id:      ndRange.id,
      reference_code:          ndConsecutive,
      correction_concept_code: "1", // Intereses / ajuste
      bill_number:             refFacturaND,
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

    const ndResult = await factus._raw(
      'POST',
      `/v2/debit-notes?test_set_id=${testSetId}`,
      JSON.stringify(ndPayload),
      'application/json',
      token
    );

    if (ndResult && ndResult.data && ndResult.data.number) {
      console.log(`   ✅ Nota Débito emitida: ${ndResult.data.number}`);
    } else {
      console.error("   ❌ Error al emitir Nota Débito:", JSON.stringify(ndResult));
      return;
    }

    console.log(`\n🎉 ¡SET DE PRUEBAS COMPLETADO CON ÉXITO!`);
    console.log(`Se enviaron 8 facturas, 1 nota crédito y 1 nota débito con el test_set_id correspondiente.`);
    console.log(`Por favor, verifique el gráfico de habilitación en el portal de la DIAN ahora.`);

  } catch (error) {
    console.error("\n❌ Error en el proceso de Habilitación:", error.message);
  }
}

runRealHabilitacion();
