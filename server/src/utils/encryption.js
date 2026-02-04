const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} text - The plaintext to encrypt
 * @returns {string} - The encrypted string in format: iv:authTag:ciphertext (hex encoded)
 */
function encrypt(text) {
  if (!text) return text;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string that was encrypted with encrypt()
 * @param {string} ciphertext - The encrypted string in format: iv:authTag:ciphertext
 * @returns {string} - The decrypted plaintext
 */
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;

  const key = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask a string to show only the last N characters
 * @param {string} text - The text to mask
 * @param {number} visibleChars - Number of characters to show at the end
 * @returns {string} - The masked string
 */
function mask(text, visibleChars = 4) {
  if (!text || text.length <= visibleChars) {
    return '****';
  }
  return '*'.repeat(text.length - visibleChars) + text.slice(-visibleChars);
}

module.exports = {
  encrypt,
  decrypt,
  mask
};
