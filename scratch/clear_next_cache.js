const fs = require('fs');
const path = require('path');

const root = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS';
const devCacheDir = path.join(root, 'out', 'dev', 'cache');
const nextCacheDir = path.join(root, '.next', 'cache');

console.log('Limpiando cachés corruptas de Next.js y Turbopack...');

try {
  if (fs.existsSync(devCacheDir)) {
    console.log(`Eliminando caché en: ${devCacheDir}...`);
    fs.rmSync(devCacheDir, { recursive: true, force: true });
    console.log('✅ Caché de out/dev/cache eliminada.');
  } else {
    console.log('No se encontró out/dev/cache.');
  }

  if (fs.existsSync(nextCacheDir)) {
    console.log(`Eliminando caché en: ${nextCacheDir}...`);
    fs.rmSync(nextCacheDir, { recursive: true, force: true });
    console.log('✅ Caché de .next/cache eliminada.');
  } else {
    console.log('No se encontró .next/cache.');
  }

  console.log('\n🎉 ¡Limpieza completada! El caché corrupto ha sido eliminado y Next.js se reiniciará limpiamente.');

} catch (err) {
  console.error('❌ Error al limpiar caché:', err.message);
}
