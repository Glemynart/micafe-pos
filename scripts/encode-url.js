// Ejecuta: node scripts/encode-url.js
// Genera el string encriptado para pegar en main.js -> _UPD_ENCODED

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const KEY = 'POS2025';

function encode(url) {
  let e = '';
  for (let i = 0; i < url.length; i++)
    e += String.fromCharCode(url.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  return Buffer.from(e, 'binary').toString('base64');
}

function decode(encoded) {
  try {
    const raw = Buffer.from(encoded, 'base64').toString('binary');
    let out = '';
    for (let i = 0; i < raw.length; i++)
      out += String.fromCharCode(raw.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
    return out;
  } catch { return '(error)'; }
}

rl.question('Ingresa la URL del servidor (ej: http://192.168.1.5:3457): ', (url) => {
  url = url.trim();
  if (!url) { console.log('URL vacía, cancelado.'); rl.close(); return; }

  const encoded = encode(url);
  console.log('\n✅ Copia este valor en main.js -> _UPD_ENCODED:\n');
  console.log(`  const _UPD_ENCODED = '${encoded}';\n`);
  console.log('🔍 Verificación (decodificado):', decode(encoded));
  console.log('');
  rl.close();
});
