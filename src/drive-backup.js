const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { app, safeStorage, shell } = require('electron');

const DRIVE_FOLDER_NAME = 'MiTiendaPOS_Backups';
const MAX_DRIVE_BACKUPS = 30;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

class DriveBackup {
  constructor() {
    this.drive = null;
    this.folderId = null;
    this.auth = null;
    this.initialized = false;
    this.lastStatus = { ok: false, message: 'No configurado' };
  }

  async initialize() {
    try {
      const credsPath = this._getCredentialPath();
      if (!fs.existsSync(credsPath)) {
        this.lastStatus = { ok: false, message: 'Archivo credentials.json no encontrado.' };
        return false;
      }

      const raw = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      const creds = raw.installed || raw.web || raw;

      if (!creds.client_id || !creds.client_secret) {
        this.lastStatus = { ok: false, message: 'credentials.json invalido. Necesita client_id y client_secret (OAuth Desktop App).' };
        return false;
      }

      const redirectUri = 'http://localhost:3456/oauth2callback';

      this.auth = new google.auth.OAuth2(
        creds.client_id,
        creds.client_secret,
        redirectUri
      );

      const token = this._loadToken();
      if (token) {
        this.auth.setCredentials(token);
        try {
          await this.auth.getAccessToken();
        } catch {
          console.log('[Drive] Token expirado, re-autenticando...');
          const newToken = await this._doOAuthFlow();
          if (!newToken) return false;
          this.auth.setCredentials(newToken);
        }
      } else {
        console.log('[Drive] Primera vez - abriendo navegador para autorizar...');
        const newToken = await this._doOAuthFlow();
        if (!newToken) return false;
        this.auth.setCredentials(newToken);
      }

      this.drive = google.drive({ version: 'v3', auth: this.auth });

      this.folderId = await this._getOrCreateBackupFolder();

      this.initialized = true;
      this.lastStatus = { ok: true, message: 'Drive conectado', folderId: this.folderId };
      console.log('[Drive] Conectado. Folder ID:', this.folderId);
      return true;
    } catch (err) {
      console.error('[Drive] Error de inicializacion:', err.message);
      this.lastStatus = { ok: false, message: 'Error: ' + err.message };
      return false;
    }
  }

  async uploadBackup(filePath, fileName) {
    if (!this.initialized || !this.drive || !this.folderId) {
      return { ok: false, error: 'Drive no configurado' };
    }

    try {
      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [this.folderId],
        },
        media: {
          mimeType: 'application/octet-stream',
          body: fs.createReadStream(filePath),
        },
        fields: 'id, name, size, createdTime',
      });

      console.log('[Drive] Backup subido:', response.data.name);
      await this._rotateDriveBackups();
      return { ok: true, fileId: response.data.id, name: response.data.name };
    } catch (err) {
      console.error('[Drive] Error subiendo backup:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async getStatus() {
    if (!this.initialized) return this.lastStatus;

    try {
      const res = await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 5,
      });

      return {
        ok: true,
        message: 'Conectado',
        folderId: this.folderId,
        recentBackups: res.data.files.map(f => ({
          name: f.name,
          size: f.size,
          created: f.createdTime,
        })),
      };
    } catch (err) {
      return { ok: false, message: 'Error: ' + err.message };
    }
  }

  async downloadBackup(fileId, destPath) {
    if (!this.initialized || !this.drive) {
      return { ok: false, error: 'Drive no configurado' };
    }
    try {
      const dest = fs.createWriteStream(destPath);
      const res = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );
      await new Promise((resolve, reject) => {
        res.data
          .pipe(dest)
          .on('finish', resolve)
          .on('error', reject);
      });
      return { ok: true, path: destPath };
    } catch (err) {
      console.error('[Drive] Error descargando:', err.message);
      return { ok: false, error: err.message };
    }
  }

  _doOAuthFlow() {
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        const parsed = url.parse(req.url, true);

        if (parsed.pathname === '/oauth2callback') {
          const code = parsed.query.code;

          if (code) {
            try {
              const { tokens } = await this.auth.getToken(code);
              this._saveToken(tokens);

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html><body style="font-family:sans-serif;text-align:center;padding-top:80px;">
                <h2>Autorizacion exitosa</h2>
                <p>Ya puedes cerrar esta ventana.</p>
                <p>MiTienda POS se ha conectado a Google Drive.</p>
                </body></html>
              `);

              server.close();
              resolve(tokens);
            } catch (err) {
              console.error('[Drive] Error obteniendo token:', err.message);
              res.end('Error al obtener token');
              server.close();
              resolve(null);
            }
          } else {
            res.end('No se recibio codigo de autorizacion');
            server.close();
            resolve(null);
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(3456, () => {
        const authUrl = this.auth.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SCOPES,
        });

        console.log('[Drive] Abriendo navegador para autorizar Google Drive...');
        shell.openExternal(authUrl);
      });

      setTimeout(() => {
        server.close();
        resolve(null);
      }, 120000);
    });
  }

  async _getOrCreateBackupFolder() {
    const res = await this.drive.files.list({
      q: `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (res.data.files.length > 0) {
      console.log('[Drive] Carpeta encontrada:', res.data.files[0].id);
      return res.data.files[0].id;
    }

    const folder = await this.drive.files.create({
      requestBody: {
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    console.log('[Drive] Carpeta creada:', folder.data.id);
    return folder.data.id;
  }

  async _rotateDriveBackups() {
    try {
      const res = await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
      });

      const files = res.data.files;
      if (files.length > MAX_DRIVE_BACKUPS) {
        for (const file of files.slice(MAX_DRIVE_BACKUPS)) {
          await this.drive.files.delete({ fileId: file.id });
          console.log('[Drive] Backup antiguo eliminado:', file.name);
        }
      }
    } catch (err) {
      console.error('[Drive] Error en rotacion:', err.message);
    }
  }

  _getCredentialPath() {
    const devPath = path.join(process.cwd(), 'credentials.json');
    if (fs.existsSync(devPath)) return devPath;

    const prodPath = path.join(path.dirname(app.getPath('exe')), 'resources', 'credentials.json');
    if (fs.existsSync(prodPath)) return prodPath;

    return devPath;
  }

  _loadToken() {
    try {
      const tokenPath = path.join(app.getPath('userData'), '.pos_drive_token.enc');
      if (!fs.existsSync(tokenPath)) return null;

      const encrypted = fs.readFileSync(tokenPath);
      const decrypted = safeStorage.decryptString(encrypted);
      const token = JSON.parse(decrypted);

      if (token.refresh_token || token.access_token) {
        console.log('[Drive] Token cargado de almacenamiento seguro.');
        return token;
      }
      return null;
    } catch (err) {
      console.warn('[Drive] Error cargando token:', err.message);
      return null;
    }
  }

  _saveToken(tokens) {
    try {
      const tokenPath = path.join(app.getPath('userData'), '.pos_drive_token.enc');
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
        fs.writeFileSync(tokenPath, encrypted);
        console.log('[Drive] Token guardado cifrado.');
      }
    } catch (err) {
      console.warn('[Drive] Error guardando token:', err.message);
    }
  }
}

module.exports = DriveBackup;
