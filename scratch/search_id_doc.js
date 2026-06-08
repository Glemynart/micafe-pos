const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.next' || file === 'out' || file === 'dist-installer') return;
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('identification_document')) {
        console.log(`Found 'identification_document' in: ${fullPath}`);
        content.split('\n').forEach((line, idx) => {
          if (line.includes('identification_document')) {
            console.log(`  Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDir(path.join(__dirname, '..'));
