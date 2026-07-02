const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');
const log = require('electron-log');

class AutoUpdaterManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.updateInfo = null;
    this.lastCheckResult = { ok: false, message: 'No verificado' };
    this.configuredUrl = '';
  }

  async init() {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.forceDevUpdateConfig = !!process.env.FORCE_UPDATE || !app.isPackaged;

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Verificando actualizaciones...');
      this._sendStatus('checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Actualizacion disponible:', info.version);
      this.updateAvailable = true;
      this.updateInfo = info;
      this.lastCheckResult = { ok: true, message: `Nueva version ${info.version} disponible`, version: info.version };
      this._sendStatus('available', info);
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] Sin actualizaciones nuevas.');
      this.lastCheckResult = { ok: true, message: 'Ya tienes la ultima version' };
      this._sendStatus('not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.downloadProgress = { percent: Math.round(progress.percent), bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total };
      this._sendStatus('downloading', this.downloadProgress);
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('[Updater] Actualizacion descargada. Se aplicara al cerrar.');
      this.updateDownloaded = true;
      this.lastCheckResult = { ok: true, message: 'Actualizacion descargada. Reinicie para aplicar.' };
      this._sendStatus('downloaded', this.updateInfo);

      if (this.mainWindow) {
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'Actualizacion lista',
          message: `Version ${this.updateInfo?.version} descargada.`,
          detail: 'La actualizacion se aplicara al cerrar la aplicacion. Reinicie manualmente.',
          buttons: ['Entendido', 'Reiniciar ahora'],
          defaultId: 0,
        }).then((result) => {
          if (result.response === 1) {
            autoUpdater.quitAndInstall();
          }
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err.message);
      // Solo marcamos error si aún no tenemos una actualización disponible
      if (!this.updateAvailable) {
        this.lastCheckResult = { ok: false, message: 'No se pudo verificar actualizaciones' };
      } else {
        // Hay actualización pero hubo error al descargar — no borrar el estado
        this.lastCheckResult = { 
          ok: true, 
          updateAvailable: true,
          message: `Nueva versión ${this.updateInfo?.version || ''} disponible. Error al descargar automáticamente.`
        };
      }
      this._sendStatus('error', { message: err.message, hadUpdate: this.updateAvailable });
    });

    autoUpdater.on('update-cancelled', () => {
      this._sendStatus('cancelled');
    });
  }

  configureUrl(url) {
    this.configuredUrl = url;
    if (url.startsWith('github:')) {
      const cleanUrl = url.replace('github:', '');
      const parts = cleanUrl.split('/');
      const owner = parts[0];
      const repo = parts[1];
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: owner,
        repo: repo
      });
      console.log(`[Updater] Configurado con GitHub Releases: ${owner}/${repo}`);
    } else {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: url,
        channel: 'latest',
      });
      console.log('[Updater] URL configurada:', url);
    }
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true;
    }
  }

  async checkForUpdates() {
    if (!this.configuredUrl) {
      this.lastCheckResult = { ok: false, message: 'URL de actualizaciones no configurada' };
      return null;
    }
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('[Updater] Error verificando:', err.message);
      return null;
    }
  }

  async checkForUpdatesSilent() {
    if (!this.configuredUrl) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Silencioso - no molestar si el servidor no responde
    }
  }

  getStatus() {
    return {
      ...this.lastCheckResult,
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      downloadProgress: this.downloadProgress || null,
      configured: !!this.configuredUrl,
    };
  }

  installNow() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  _sendStatus(event, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { event, ...data });
    }
  }
}

module.exports = AutoUpdaterManager;
