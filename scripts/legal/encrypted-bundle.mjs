import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { verifyBundle } from './tenant-export.mjs';

const magic = Buffer.from('DUSEMA-EXIT-V3\n');
export function encryptBundle(bundle, key) {
  verifyBundle(bundle);
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) throw new Error('EXPORT_KEY_MUST_BE_32_BYTES');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  return Buffer.concat([magic, iv, cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final(), cipher.getAuthTag()]);
}
export function decryptBundle(bytes, key) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32 || !Buffer.isBuffer(bytes) || bytes.byteLength < magic.length + 28 || !bytes.subarray(0, magic.length).equals(magic)) throw new Error('EXPORT_INVALID_ENVELOPE');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(magic.length, magic.length + 12));
    decipher.setAAD(magic);
    decipher.setAuthTag(bytes.subarray(-16));
    const plain = Buffer.concat([decipher.update(bytes.subarray(magic.length + 12, -16)), decipher.final()]);
    const bundle = JSON.parse(plain.toString('utf8'));
    verifyBundle(bundle);
    return bundle;
  } catch { throw new Error('EXPORT_DECRYPT_OR_INTEGRITY_FAILED'); }
}
export const encryptedDigest = bytes => createHash('sha256').update(bytes).digest('hex');
