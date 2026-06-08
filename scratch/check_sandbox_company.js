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
    console.log('Fetching company details in Sandbox...');
    // We try to request company or profile information
    const resCompany = await factus._request('GET', '/v2/companies', null, token);
    console.log('Company Details:', JSON.stringify(resCompany.data || resCompany, null, 2));

    console.log('\nFetching active environments in Sandbox...');
    // Try to get configured environments
    const resEnv = await factus._request('GET', '/v2/environments', null, token);
    console.log('Environments Details:', JSON.stringify(resEnv.data || resEnv, null, 2));

  } catch (err) {
    console.error('Error occurred:', err.message);
  }
})();
