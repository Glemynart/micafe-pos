const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'factus.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS FOR emitirFactura IN factus.js ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('emitirFactura')) {
      console.log(`Found around line ${lineNum}`);
      for (let i = Math.max(1, lineNum - 5); i <= Math.min(lines.length, lineNum + 60); i++) {
        console.log(`${i}: ${lines[i-1]}`);
      }
    }
  });
} else {
  console.log('File not found:', filePath);
}
