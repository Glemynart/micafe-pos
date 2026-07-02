const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

class BackupManager {
  constructor(db) {
    this.db = db;
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.maxBackups = 30;
    this.driveBackup = null;
  }

  setDriveBackup(driveInstance) {
    this.driveBackup = driveInstance;
  }

  getOrCreateEncryptionKey() {
    const keyPath = path.join(app.getPath('userData'), '.backup_key');
    if (fs.existsSync(keyPath)) {
      const encryptedKey = fs.readFileSync(keyPath);
      return safeStorage.decryptString(encryptedKey);
    }
    const key = crypto.randomBytes(32).toString('hex');
    const encryptedKey = safeStorage.encryptString(key);
    fs.writeFileSync(keyPath, encryptedKey);
    return key;
  }

  encryptBackup(data) {
    const key = Buffer.from(this.getOrCreateEncryptionKey(), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  async createBackup(usuario = 'sistema') {
    try {
      if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });

      const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.enc`;
      const backupPath = path.join(this.backupDir, fileName);

      const data = this.db.db.export();
      const encrypted = this.encryptBackup(data);

      fs.writeFileSync(backupPath, encrypted);

      const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
      fs.writeFileSync(backupPath + '.sha256', checksum);

      this.rotateBackups();

      await this.db.registrarAuditoria(usuario, 'BACKUP_AUTOMATICO',
        `Respaldo cifrado creado: ${fileName}`);

      if (this.driveBackup) {
        this._uploadToDrive(backupPath, fileName).catch(e =>
          console.error('[Backup] Error subiendo a Drive:', e.message));
      }

      return { ok: true, path: backupPath, checksum };
    } catch (err) {
      console.error('[Backup] Error:', err);
      return { ok: false, error: err.message };
    }
  }

  async restoreBackup(encryptedPath) {
    try {
      const checksumFile = encryptedPath + '.sha256';
      if (fs.existsSync(checksumFile)) {
        const storedChecksum = fs.readFileSync(checksumFile, 'utf-8').trim();
        const currentData = fs.readFileSync(encryptedPath);
        const currentChecksum = crypto.createHash('sha256').update(currentData).digest('hex');
        if (storedChecksum !== currentChecksum) {
          throw new Error('El archivo de respaldo ha sido modificado o está corrupto');
        }
      }

      const encrypted = fs.readFileSync(encryptedPath);
      const key = Buffer.from(this.getOrCreateEncryptionKey(), 'hex');
      const iv = encrypted.subarray(0, 16);
      const authTag = encrypted.subarray(16, 32);
      const ciphertext = encrypted.subarray(32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return { ok: true, data: decrypted };
    } catch (err) {
      console.error('[Backup] Error de restauración:', err);
      return { ok: false, error: 'El archivo de respaldo está dañado o la clave es incorrecta' };
    }
  }

  rotateBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.enc'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > this.maxBackups) {
        for (const f of files.slice(this.maxBackups)) {
          fs.unlinkSync(f.path);
          try { fs.unlinkSync(f.path + '.sha256'); } catch (_) {}
          console.log(`[Backup] Respaldo antiguo eliminado: ${f.name}`);
        }
      }
    } catch (err) {
      console.error('[Backup] Error en rotación:', err);
    }
  }

  listBackups() {
    try {
      if (!fs.existsSync(this.backupDir)) return [];
      return fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.enc'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          size: fs.statSync(path.join(this.backupDir, f)).size,
          created: fs.statSync(path.join(this.backupDir, f)).mtime,
        }))
        .sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch { return []; }
  }

  async restoreFromLocal(filePath) {
    try {
      const result = await this.restoreBackup(filePath);
      if (!result.ok) return result;

      const dbPath = path.join(app.getPath('userData'), 'pos_tienda.db');
      const bakPath = dbPath + '.pre_restore.bak';

      fs.copyFileSync(dbPath, bakPath);

      this.db.db.close();
      fs.writeFileSync(dbPath, result.data);

      await this.db.registrarAuditoria('sistema', 'RESTAURACION',
        `Base de datos restaurada desde: ${path.basename(filePath)}`);

      return { ok: true, message: 'Base de datos restaurada. Reinicie la aplicacion.' };
    } catch (err) {
      console.error('[Restore] Error:', err);
      return { ok: false, error: err.message };
    }
  }

  async restoreFromDrive(fileId) {
    try {
      if (!this.driveBackup || !this.driveBackup.initialized) {
        return { ok: false, error: 'Drive no conectado' };
      }

      const tmpPath = path.join(app.getPath('temp'), `drive_restore_${Date.now()}.enc`);
      const downloaded = await this.driveBackup.downloadBackup(fileId, tmpPath);
      if (!downloaded.ok) return downloaded;

      const result = await this.restoreFromLocal(tmpPath);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      return result;
    } catch (err) {
      console.error('[Restore] Error desde Drive:', err);
      return { ok: false, error: err.message };
    }
  }

  async _uploadToDrive(localPath, fileName) {
    if (!this.driveBackup) return;
    const result = await this.driveBackup.uploadBackup(localPath, fileName);
    if (result.ok) {
      console.log('[Backup] Subido a Google Drive:', fileName);
    }
  }
}

module.exports = BackupManager;
