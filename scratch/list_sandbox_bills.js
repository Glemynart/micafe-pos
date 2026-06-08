const Factus = require('../src/factus.js');

(async () => {
  try {
    const factus = new Factus({
      baseUrl:      'https://api-sandbox.factus.com.co',
      clientId:     'a1d974a3-aed9-432e-95a9-5263da5cfb19',
      clientSecret: 'ub9g9pzxYXQQ3MoT6IyZ0pZHWomczWHbeBZpPvqi',
      username:     'eugeniam0926@gmail.com',
      password:     '71800393',
    });

    const token = await factus._getToken();
    console.log('Fetching last 50 bills from Sandbox...');
    const res = await factus._request('GET', '/v2/bills?limit=50', null, token);
    const bills = res.data?.data || res.data || [];
    
    console.log(`Encontradas ${bills.length} facturas en Sandbox.`);
    bills.forEach((b, idx) => {
      console.log(`[${idx+1}] Número: ${b.number}, Código: ${b.reference_code}, ID Rango: ${b.numbering_range_id}, Creado: ${b.created_at}`);
    });

    console.log('\nFetching last 50 credit notes from Sandbox...');
    const resNC = await factus._request('GET', '/v2/credit-notes?limit=50', null, token);
    const creditNotes = resNC.data?.data || resNC.data || [];
    console.log(`Encontradas ${creditNotes.length} notas de crédito en Sandbox.`);
    creditNotes.forEach((nc, idx) => {
      console.log(`[${idx+1}] Número: ${nc.number}, Ref Factura: ${nc.bill_number}, Creado: ${nc.created_at}`);
    });

  } catch (err) {
    console.error('Error occurred:', err.message);
  }
})();
