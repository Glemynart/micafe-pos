const Factus = require('../src/factus.js');

async function findNDEndpoint() {
  const factus = new Factus({
    baseUrl:      'https://api-sandbox.factus.com.co',
    clientId:     'a1d974a3-aed9-432e-95a9-5263da5cfb19',
    clientSecret: 'ub9g9pzxYXQQ3MoT6IyZ0pZHWomczWHbeBZpPvqi',
    username:     'eugeniam0926@gmail.com',
    password:     '71800393',
  });

  try {
    const token = await factus._getToken();
    console.log("Token obtenido.");

    const endpoints = [
      '/v2/debit-notes',
      '/v2/debit-note',
      '/v2/debit_notes',
      '/v2/debit_note',
      '/v2/bills/debit-notes',
      '/v2/bills/debit-note',
      '/v2/bills/debit_notes',
      '/v2/bills/debit_note',
      '/v2/debit-notes/validate',
      '/v2/debit-notes/validate-document',
      '/v2/bills/validate', // Maybe it's sent to /v2/bills/validate but with a different document type?
    ];

    for (const ep of endpoints) {
      console.log(`Testing ND endpoint: ${ep}`);
      try {
        const res = await factus._raw('POST', ep, JSON.stringify({}), 'application/json', token);
        console.log(`✅ SUCCESS for ${ep}:`, res);
      } catch (err) {
        console.log(`❌ Error for ${ep}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error("Error general:", error.message);
  }
}

findNDEndpoint();
