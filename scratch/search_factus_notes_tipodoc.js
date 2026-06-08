const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'factus.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== tipoDoc SEARCH IN factus.js ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('tipoDoc') && lineNum > 300) {
      console.log(`${lineNum}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', filePath);
}
