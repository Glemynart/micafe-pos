const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\components\\pos\\vender.tsx';
if (fs.existsSync(filePath)) {
  console.log('Inspecting vender.tsx ticket logic...');
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find where config is loaded
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('config') && (line.includes('resolucion_dian') || line.includes('prefijo') || line.includes('vigencia'))) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
    }
  });

  // Let's print around line 787 and 958
  console.log('\n--- Printing around line 780-800 ---');
  for (let i = 770; i <= 800; i++) {
    console.log(`${i}: ${lines[i-1]}`);
  }

  console.log('\n--- Printing around line 950-970 ---');
  for (let i = 945; i <= 970; i++) {
    console.log(`${i}: ${lines[i-1]}`);
  }
} else {
  console.log('vender.tsx not found.');
}
