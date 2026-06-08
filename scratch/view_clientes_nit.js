const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'clientes.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 70 TO 100 IN clientes.tsx ===');
  for (let i = 70; i <= 100; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
