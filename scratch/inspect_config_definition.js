const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\components\\pos\\vender.tsx';
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log('Inspecting "config" occurrences in vender.tsx...');
  lines.forEach((line, idx) => {
    if (line.includes('const [config') || line.includes('const config') || line.includes('setConfig') || line.includes('window.api.config')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
    }
  });
} else {
  console.log('vender.tsx not found.');
}
