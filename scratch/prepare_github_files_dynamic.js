const fs = require('fs');
const path = require('path');

const root = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS';
const packageJson = require(path.join(root, 'package.json'));
const version = packageJson.version;

const distDir = path.join(root, 'dist-installer');
const updatesDir = path.join(root, 'updates');

console.log(`Sincronizando archivos de la versión ${version} para GitHub Release...`);

try {
  // Asegurar que existe la carpeta updates
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }

  // Nombre del producto desde package.json
  const prodName = packageJson.build.productName || 'MiTienda-POS';
  const cleanProdName = prodName.replace(/\s+/g, '-');

  // Archivos origen en dist-installer
  const originExe = path.join(distDir, `${prodName} Setup ${version}.exe`);
  const originBlockmap = path.join(distDir, `${prodName} Setup ${version}.exe.blockmap`);
  const originYml = path.join(distDir, 'latest.yml');

  // Archivos destino con guiones (para que coincidan con latest.yml)
  const destExeDist = path.join(distDir, `${cleanProdName}-Setup-${version}.exe`);
  const destBlockmapDist = path.join(distDir, `${cleanProdName}-Setup-${version}.exe.blockmap`);

  const destExeUpdates = path.join(updatesDir, `${cleanProdName}-Setup-${version}.exe`);
  const destBlockmapUpdates = path.join(updatesDir, `${cleanProdName}-Setup-${version}.exe.blockmap`);
  const destYmlUpdates = path.join(updatesDir, 'latest.yml');

  // Verificar si existen los archivos origen
  if (!fs.existsSync(originExe)) {
    throw new Error(`No se encontró el instalador origen: ${originExe}`);
  }

  // 1. Copiar y renombrar en dist-installer
  console.log(`Copiando .exe renombrado en dist-installer...`);
  fs.copyFileSync(originExe, destExeDist);
  fs.copyFileSync(originBlockmap, destBlockmapDist);

  // 2. Copiar y renombrar a la carpeta updates/
  console.log(`Copiando archivos a la carpeta updates/...`);
  fs.copyFileSync(originExe, destExeUpdates);
  fs.copyFileSync(originBlockmap, destBlockmapUpdates);
  fs.copyFileSync(originYml, destYmlUpdates);

  console.log(`\n✅ ¡Archivos de la versión ${version} listos y sincronizados!`);
  console.log(`Sube estos tres archivos exactos a tu GitHub Release de la versión ${version}:`);
  console.log(`  1. ${path.basename(destExeDist)}`);
  console.log(`  2. ${path.basename(destBlockmapDist)}`);
  console.log(`  3. ${path.basename(originYml)}`);

} catch (err) {
  console.error('❌ Error al preparar los archivos:', err.message);
}
