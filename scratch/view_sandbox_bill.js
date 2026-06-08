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
    const number = 'SETP990000202';
    console.log(`Fetching details for sandbox bill ${number}...`);
    const res = await factus._request('GET', `/v2/bills/${number}`, null, token);
    console.log('Bill Details:', JSON.stringify(res.data || res, null, 2));

  } catch (err) {
    console.error('Error occurred:', err.message);
  }
})();
