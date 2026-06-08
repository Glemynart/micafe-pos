const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'clientes.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS IN clientes.tsx ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('tipo_documento') || line.includes('documento') || line.includes('identificacion')) {
      console.log(`${lineNum}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', filePath);
}
