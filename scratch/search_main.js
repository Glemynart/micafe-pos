const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'main.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS IN main.js ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('print:') || line.includes('toPrinter') || line.includes('ticket') || line.includes('printer')) {
      console.log(`${lineNum}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', filePath);
}
