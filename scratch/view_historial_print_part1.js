const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'historial.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 277 TO 330 IN historial.tsx ===');
  for (let i = 277; i <= 330; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
