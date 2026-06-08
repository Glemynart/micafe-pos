const Factus = require('../src/factus.js');

async function testNDEndpoints2() {
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
      '/v2/debit-notes/create',
      '/v2/debit-notes/store',
      '/v2/debit-notes/send',
      '/v2/debit-notes/emit',
      '/v2/debit-notes/save',
      '/v2/debit-notes/validate-document',
      '/v2/debit-notes/validate', // tested, 405
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

testNDEndpoints2();
