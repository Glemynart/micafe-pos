const FactusClient = require('../src/factus.js');

const factus = new FactusClient({
  baseUrl: 'https://api-sandbox.factus.com.co',
  clientId: 'test',
  clientSecret: 'test',
  username: 'test',
  password: 'test'
});

console.log('=== TESTING CLIENT PAYLOAD PARSING ===');

// Test Case 1: Company NIT with Verification Digit already present in ID
const client1 = {
  tipo_documento: 'NIT',
  tipo: 'NIT',
  identificacion: '901724254-1',
  nombre: 'Factus S.A.S.',
  email: 'test@factus.com',
  telefono: '3123456789',
  direccion: 'Calle 10 # 5-6'
};
const res1 = factus._buildCustomerPayload(client1);
console.log('Test 1 (NIT with dash):', JSON.stringify(res1, null, 2));

// Test Case 2: Company NIT without Verification Digit (needs auto-computation)
const client2 = {
  tipo_documento: 'NIT',
  tipo: 'NIT',
  identificacion: '901724254',
  nombre: 'Factus S.A.S.',
  email: 'test@factus.com',
  telefono: '312 345-6789 ext 2',
  direccion: 'Calle 10 # 5-6'
};
const res2 = factus._buildCustomerPayload(client2);
console.log('Test 2 (NIT no dash, auto-DV):', JSON.stringify(res2, null, 2));

// Test Case 3: Person with CC containing dots and spaces
const client3 = {
  tipo_documento: 'CC',
  tipo: 'CC',
  identificacion: '1.025.634.789 ',
  nombre: 'Juan Pérez',
  email: 'juan@perez.com',
  telefono: '(315) 890 1234',
  direccion: 'Cra 45 # 12-34'
};
const res3 = factus._buildCustomerPayload(client3);
console.log('Test 3 (CC with dots/spaces):', JSON.stringify(res3, null, 2));

// Test Case 4: Person with CE (extranjería)
const client4 = {
  tipo_documento: 'CE',
  tipo: 'CE',
  identificacion: '888777666',
  nombre: 'John Doe',
  email: 'john@doe.com',
  telefono: '',
  direccion: ''
};
const res4 = factus._buildCustomerPayload(client4);
console.log('Test 4 (CE extranjeria):', JSON.stringify(res4, null, 2));

console.log('=== ALL TESTS COMPLETED ===');
