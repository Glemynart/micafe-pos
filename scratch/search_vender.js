const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'vender.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS IN vender.tsx ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('prefijo') || line.includes('resolucion') || line.includes('vigencia') || line.includes('ticket') || line.includes('imprimir') || line.includes('print')) {
      console.log(`${lineNum}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', filePath);
}
