const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\renderer.js';
if (fs.existsSync(filePath)) {
  console.log('Inspecting renderer.js for "prefijo"...');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('prefijo') || line.includes('resolucion')) {
      console.log(`${idx+1}: ${line.trim()}`);
    }
  });
} else {
  console.log('renderer.js not found.');
}
