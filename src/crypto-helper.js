const { safeStorage } = require('electron');

class ConfigEncryptor {
  encrypt(plainText) {
    if (!plainText) return '';
    if (!safeStorage.isEncryptionAvailable()) {
      return this._fallbackEncrypt(plainText);
    }
    const buffer = safeStorage.encryptString(plainText);
    return buffer.toString('base64');
  }

  decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return this._fallbackDecrypt(encryptedBase64);
      }
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch {
      return encryptedBase64;
    }
  }

  isAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  _fallbackEncrypt(plainText) {
    return Buffer.from(plainText, 'utf-8').toString('base64');
  }

  _fallbackDecrypt(encryptedBase64) {
    return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
  }
}

module.exports = new ConfigEncryptor();
