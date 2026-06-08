const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'clientes.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 430 TO 465 IN clientes.tsx ===');
  for (let i = 430; i <= 465; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
