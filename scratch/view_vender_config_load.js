const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'vender.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 580 TO 660 IN vender.tsx ===');
  for (let i = 580; i <= 660; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
