/**
 * One-time migration script: encrypt existing unencrypted PHI in CallLog records
 * and recording files on disk.
 *
 * Usage: node server/src/scripts/encryptExistingPHI.js
 *
 * Safe to run multiple times — skips already-encrypted data.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { PHI_FIELDS, isEncrypted, encryptPHI, encryptFile } = require('../utils/phiEncryption');

const prisma = new PrismaClient();
const recordingsDir = path.join(__dirname, '../../uploads/recordings');

async function encryptCallLogRecords() {
  console.log('[Migration] Scanning CallLog records for unencrypted PHI...');

  const allLogs = await prisma.callLog.findMany({
    where: {
      OR: [
        { transcript: { not: null } },
        { summary: { not: null } },
        { structuredData: { not: null } },
        { customerNumber: { not: null } },
        { recordingUrl: { not: null } }
      ]
    }
  });

  let updated = 0;
  let skipped = 0;

  for (const log of allLogs) {
    // Check if any PHI field needs encryption
    let needsUpdate = false;
    for (const field of PHI_FIELDS) {
      if (log[field] != null && typeof log[field] === 'string' && !isEncrypted(log[field])) {
        needsUpdate = true;
        break;
      }
    }

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    const encrypted = encryptPHI(log);
    const updateData = {};
    for (const field of PHI_FIELDS) {
      if (encrypted[field] !== log[field]) {
        updateData[field] = encrypted[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.callLog.update({
        where: { id: log.id },
        data: updateData
      });
      updated++;
      if (updated % 100 === 0) {
        console.log(`[Migration] Encrypted ${updated} records so far...`);
      }
    }
  }

  console.log(`[Migration] CallLog records: ${updated} encrypted, ${skipped} already encrypted/empty`);
}

async function encryptRecordingFiles() {
  console.log('[Migration] Scanning recording files for unencrypted audio...');

  if (!fs.existsSync(recordingsDir)) {
    console.log('[Migration] No recordings directory found, skipping.');
    return;
  }

  const files = fs.readdirSync(recordingsDir);
  let encrypted = 0;
  let skipped = 0;

  for (const file of files) {
    // Skip already encrypted files
    if (file.endsWith('.enc')) {
      skipped++;
      continue;
    }

    // Only process audio files
    if (!file.match(/\.(mp3|wav)$/i)) {
      continue;
    }

    const inputPath = path.join(recordingsDir, file);
    const outputPath = path.join(recordingsDir, file + '.enc');

    try {
      await encryptFile(inputPath, outputPath);
      fs.unlinkSync(inputPath); // remove plaintext file

      // Update the recordingUrl in the corresponding CallLog
      const vapiCallId = file.replace(/\.(mp3|wav)$/i, '');
      const callLog = await prisma.callLog.findUnique({ where: { vapiCallId } });
      if (callLog && callLog.recordingUrl) {
        // Replace the filename in the URL
        const newUrl = callLog.recordingUrl.replace(file, file + '.enc');
        // Encrypt the updated URL too
        const { encrypt } = require('../utils/encryption');
        await prisma.callLog.update({
          where: { id: callLog.id },
          data: { recordingUrl: encrypt(newUrl) }
        });
      }

      encrypted++;
      console.log(`[Migration] Encrypted file: ${file}`);
    } catch (err) {
      console.error(`[Migration] Failed to encrypt file ${file}:`, err.message);
    }
  }

  console.log(`[Migration] Recording files: ${encrypted} encrypted, ${skipped} already encrypted`);
}

async function main() {
  console.log('[Migration] Starting PHI encryption migration...');
  console.log('[Migration] ENCRYPTION_KEY present:', !!process.env.ENCRYPTION_KEY);

  if (!process.env.ENCRYPTION_KEY) {
    console.error('[Migration] ERROR: ENCRYPTION_KEY environment variable is not set. Aborting.');
    process.exit(1);
  }

  try {
    await encryptCallLogRecords();
    await encryptRecordingFiles();
    console.log('[Migration] PHI encryption migration complete.');
  } catch (err) {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
