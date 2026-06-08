const _UPD_KEY = 'POS2025';
const _UPD_ENCODED = 'NyYnWkVQDxcjNl9JXFQiO3x/WR9hOSo9VlE=';

function _xorDecode(encoded) {
  try {
    const raw = Buffer.from(encoded, 'base64').toString('binary');
    let out = '';
    for (let i = 0; i < raw.length; i++)
      out += String.fromCharCode(raw.charCodeAt(i) ^ _UPD_KEY.charCodeAt(i % _UPD_KEY.length));
    return out;
  } catch (err) { return 'Error: ' + err.message; }
}

console.log('Decoded URL:', _xorDecode(_UPD_ENCODED));
