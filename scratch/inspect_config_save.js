const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\components\\pos\\configuracion.tsx';
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log('Inspecting saving logic in configuracion.tsx...');
  let start = -1;
  lines.forEach((line, idx) => {
    if (line.includes('const guardar') || line.includes('const handleSave') || line.includes('api.config.set')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
      if (start === -1) start = idx;
    }
  });

  if (start !== -1) {
    console.log('\n--- Printing around save logic ---');
    for (let i = start - 5; i <= start + 25; i++) {
      console.log(`${i}: ${lines[i-1]}`);
    }
  }
} else {
  console.log('configuracion.tsx not found.');
}
