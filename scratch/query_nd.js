const Factus = require('../src/factus.js');

async function queryND() {
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

    console.log("Consultando GET /v2/bills/debit-notes...");
    const res = await factus._request('GET', '/v2/bills/debit-notes', null, token);
    console.log("✅ SUCCESS:");
    console.log(JSON.stringify(res, null, 2).slice(0, 1000));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

queryND();
