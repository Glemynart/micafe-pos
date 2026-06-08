const fs = require('fs');
const path = require('path');

const root = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS';
const keywords = ['resolucion_dian', 'prefijo_factura', 'rango_inicio', 'factus_rango_id'];

function searchInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== 'dist-installer') {
        searchInDir(full);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.js', '.tsx', '.ts', '.jsx', '.html', '.css'].includes(ext)) {
        const content = fs.readFileSync(full, 'utf8');
        keywords.forEach(kw => {
          if (content.includes(kw)) {
            console.log(`Keyword [${kw}] found in: ${full}`);
          }
        });
      }
    }
  }
}

console.log('Searching for DIAN configurations in codebase...');
searchInDir(root);
