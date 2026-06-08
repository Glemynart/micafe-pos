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
    console.log('Paging through bills in Sandbox...');
    let page = 1;
    let allBills = [];
    while (true) {
      console.log(`Fetching page ${page}...`);
      const res = await factus._request('GET', `/v2/bills?limit=50&page=${page}`, null, token);
      const bills = res.data?.data || [];
      if (bills.length === 0) break;
      allBills.push(...bills);
      page++;
      if (page > 10) break; // Safety limit
    }

    console.log(`\n=== Total Facturas encontradas: ${allBills.length} ===`);
    allBills.forEach((b, idx) => {
      console.log(`[${idx+1}] Número: ${b.number}, Creado: ${b.created_at}`);
    });

    console.log('\nPaging through credit notes in Sandbox...');
    let pageNC = 1;
    let allNCs = [];
    while (true) {
      console.log(`Fetching page ${pageNC}...`);
      const resNC = await factus._request('GET', `/v2/credit-notes?limit=50&page=${pageNC}`, null, token);
      const ncs = resNC.data?.data || [];
      if (ncs.length === 0) break;
      allNCs.push(...ncs);
      pageNC++;
      if (pageNC > 10) break;
    }

    console.log(`\n=== Total Notas de Crédito encontradas: ${allNCs.length} ===`);
    allNCs.forEach((nc, idx) => {
      console.log(`[${idx+1}] Número: ${nc.number}, Creado: ${nc.created_at}`);
    });

  } catch (err) {
    console.error('Error occurred:', err.message);
  }
})();
