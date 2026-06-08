const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'pos', 'vender.tsx');
if (fs.existsSync(filePath)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  console.log('=== CONFIG RETRIEVAL SEARCH IN vender.tsx ===');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('config') && (line.includes('api') || line.includes('get') || line.includes('set') || line.includes('load') || line.includes('useEffect'))) {
      console.log(`${lineNum}: ${line.trim()}`);
    }
  });
} else {
  console.log('File not found:', filePath);
}
