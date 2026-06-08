const fs = require('fs');

const files = [
  'components/pos/vender.tsx',
  'components/pos/configuracion.tsx',
  'renderer.js'
];

files.forEach(file => {
  const filePath = `c:\\Users\\seguc\\Downloads\\PROYECTO POS\\${file}`;
  if (fs.existsSync(filePath)) {
    console.log(`\n=== INSPECTING ${file} ===`);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('resolucion_dian') || line.includes('prefijo_factura') || line.includes('vigencia')) {
        console.log(`${idx+1}: ${line.trim()}`);
      }
    });
  }
});
