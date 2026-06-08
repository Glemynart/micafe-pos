const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'factus.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== METHOD SEARCH IN factus.js ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('async emitirNotaCredito') || line.includes('async emitirNotaDebito')) {
      console.log(`${lineNum}: ${line.trim()}`);
      for (let i = lineNum; i <= lineNum + 20; i++) {
        console.log(`  ${i}: ${lines[i-1]}`);
      }
    }
  });
} else {
  console.log('File not found:', filePath);
}
