const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'factus.js');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== SEARCH RESULTS FOR customer IN factus.js ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('customer:')) {
      console.log(`Found around line ${lineNum}`);
      for (let i = Math.max(1, lineNum - 3); i <= Math.min(lines.length, lineNum + 20); i++) {
        console.log(`${i}: ${lines[i-1]}`);
      }
    }
  });
} else {
  console.log('File not found:', filePath);
}
