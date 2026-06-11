/**
 * Encrypt Enable Banking session IDs at rest (AES-256-GCM).
 */

const crypto = require('crypto');
const config = require('../../config');

function deriveKey() {
  return crypto.createHash('sha256').update(`${config.SESSION_SECRET}:open-banking-session`).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decrypt(stored) {
  if (!stored) return null;
  const [ivB64, tagB64, dataB64] = String(stored).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
