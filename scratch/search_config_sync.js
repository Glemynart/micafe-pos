const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'configuracion.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SYNC SEARCH IN configuracion.tsx ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('sync') || line.includes('sincronizar') || line.includes('cargar') || line.includes('load') || line.includes('rango') || line.includes('dian')) {
      if (line.includes('button') || line.includes('onClick') || line.includes('function') || line.includes('const') || line.includes('handler')) {
        console.log(`${lineNum}: ${line.trim()}`);
      }
    }
  });
} else {
  console.log('File not found:', filePath);
}
