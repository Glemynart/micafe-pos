const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'vender.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 750 TO 834 IN vender.tsx ===');
  for (let i = 750; i <= 834; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
