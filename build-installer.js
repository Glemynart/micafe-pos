const electronInstaller = require('electron-winstaller');
const path = require('path');

async function build() {
  console.log('Construyendo instalador...');
  try {
    await electronInstaller.createWindowsInstaller({
      appDirectory: path.join(__dirname, 'dist', 'MiTienda POS-win32-x64'),
      outputDirectory: path.join(__dirname, 'dist', 'installer'),
      authors: 'MiTienda',
      exe: 'MiTienda POS.exe',
      setupExe: 'MiTienda_POS_Installer.exe',
      noMsi: true,
      description: 'Sistema POS para tiendas de barrio'
    });
    console.log('¡Instalador creado exitosamente!');
  } catch (e) {
    console.log(`Error al crear el instalador: ${e.message}`);
  }
}

build();
