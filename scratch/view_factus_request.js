const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'factus.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== LINES 280 TO 360 IN factus.js ===');
  for (let i = 280; i <= 360; i++) {
    if (lines[i-1] !== undefined) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('File not found:', filePath);
}
