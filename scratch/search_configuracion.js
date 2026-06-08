const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'configuracion.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS IN configuracion.tsx ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('prefijo') || line.includes('resolucion') || line.includes('rango') || line.includes('vigencia') || line.includes('dian') || line.includes('factus')) {
      if (line.includes('set') || line.includes('save') || line.includes('value') || line.includes('change') || line.includes('api.config')) {
        console.log(`${lineNum}: ${line.trim()}`);
      }
    }
  });
} else {
  console.log('File not found:', filePath);
}
