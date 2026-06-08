const fs = require('fs');
const path = require('path');

const root = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS';
const distDir = path.join(root, 'dist-installer');
const updatesDir = path.join(root, 'updates');

console.log('Sincronizando archivos para GitHub Release...');

try {
  // Asegurar que existe la carpeta updates
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }

  // Archivos origen en dist-installer
  const originExe = path.join(distDir, 'MiTienda-POS Setup 1.0.10.exe');
  const originBlockmap = path.join(distDir, 'MiTienda-POS Setup 1.0.10.exe.blockmap');
  const originYml = path.join(distDir, 'latest.yml');

  // Archivos destino con guiones (para que coincidan con latest.yml)
  const destExeDist = path.join(distDir, 'MiTienda-POS-Setup-1.0.10.exe');
  const destBlockmapDist = path.join(distDir, 'MiTienda-POS-Setup-1.0.10.exe.blockmap');

  const destExeUpdates = path.join(updatesDir, 'MiTienda-POS-Setup-1.0.10.exe');
  const destBlockmapUpdates = path.join(updatesDir, 'MiTienda-POS-Setup-1.0.10.exe.blockmap');
  const destYmlUpdates = path.join(updatesDir, 'latest.yml');

  // 1. Copiar y renombrar en dist-installer
  console.log(`Copilando .exe renombrado en dist-installer...`);
  fs.copyFileSync(originExe, destExeDist);
  fs.copyFileSync(originBlockmap, destBlockmapDist);

  // 2. Copiar y renombrar a la carpeta updates/
  console.log(`Copilando archivos a la carpeta updates/...`);
  fs.copyFileSync(originExe, destExeUpdates);
  fs.copyFileSync(originBlockmap, destBlockmapUpdates);
  fs.copyFileSync(originYml, destYmlUpdates);

  console.log('\n✅ ¡Archivos listos y sincronizados!');
  console.log('Sube estos tres archivos exactos a tu GitHub Release de la versión 1.0.10:');
  console.log(`  1. ${path.basename(destExeDist)} (195 MB)`);
  console.log(`  2. ${path.basename(destBlockmapDist)}`);
  console.log(`  3. ${path.basename(originYml)}`);

} catch (err) {
  console.error('❌ Error al preparar los archivos:', err.message);
}
