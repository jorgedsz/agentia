const crypto = require('crypto');
const fs = require('fs');
const { Transform } = require('stream');
const { encrypt, decrypt } = require('./encryption');

// Fields in CallLog that contain PHI and must be encrypted at rest
const PHI_FIELDS = ['transcript', 'summary', 'structuredData', 'customerNumber', 'recordingUrl'];

// Pattern for data already encrypted by our encrypt() util: hex:hex:hex
const ENCRYPTED_PATTERN = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

/**
 * Check if a string value is already encrypted
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  return ENCRYPTED_PATTERN.test(value);
}

/**
 * Encrypt all PHI fields in a CallLog data object.
 * Skips null/undefined values and already-encrypted values.
 * Returns a new object with encrypted fields.
 */
function encryptPHI(callLogData) {
  const result = { ...callLogData };
  for (const field of PHI_FIELDS) {
    if (result[field] != null && typeof result[field] === 'string' && !isEncrypted(result[field])) {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt all PHI fields in a CallLog data object.
 * Skips null/undefined values and values that don't look encrypted.
 * Returns a new object with decrypted fields.
 */
function decryptPHI(callLogData) {
  const result = { ...callLogData };
  for (const field of PHI_FIELDS) {
    if (result[field] != null && typeof result[field] === 'string' && isEncrypted(result[field])) {
      try {
        result[field] = decrypt(result[field]);
      } catch (err) {
        console.error(`[PHI] Failed to decrypt field "${field}":`, err.message);
        // Leave encrypted value in place rather than corrupting data
      }
    }
  }
  return result;
}

// AES-256-GCM constants for file encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  if (key.length !== 64) throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a file on disk using AES-256-GCM.
 * Writes: [16-byte IV][16-byte authTag][ciphertext]
 * The authTag is written after encryption completes (seeks back).
 * Since GCM authTag is only available after cipher.final(), we buffer the ciphertext.
 */
function encryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const input = fs.createReadStream(inputPath);
    const chunks = [];

    input.on('error', reject);

    input.pipe(cipher);

    cipher.on('data', (chunk) => chunks.push(chunk));
    cipher.on('error', reject);
    cipher.on('end', () => {
      try {
        const authTag = cipher.getAuthTag();
        const ciphertext = Buffer.concat(chunks);
        // File format: [IV 16 bytes][AuthTag 16 bytes][Ciphertext]
        const output = Buffer.concat([iv, authTag, ciphertext]);
        fs.writeFileSync(outputPath, output);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Return a readable stream that decrypts an encrypted file.
 * File format: [16-byte IV][16-byte authTag][ciphertext]
 */
function decryptFileStream(encryptedPath) {
  const key = getKey();
  const fileBuffer = fs.readFileSync(encryptedPath);

  const iv = fileBuffer.subarray(0, IV_LENGTH);
  const authTag = fileBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = fileBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Create a pass-through transform that pushes the decrypted data
  const stream = new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk);
    }
  });

  try {
    const decrypted = decipher.update(ciphertext);
    const final = decipher.final();
    stream.push(decrypted);
    stream.push(final);
    stream.push(null); // signal end
  } catch (err) {
    process.nextTick(() => stream.destroy(err));
  }

  return stream;
}

module.exports = {
  PHI_FIELDS,
  isEncrypted,
  encryptPHI,
  decryptPHI,
  encryptFile,
  decryptFileStream
};
