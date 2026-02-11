/**
 * Data retention purge script: deletes CallLog records and recording files
 * older than the configured retention period for HIPAA-enabled users.
 *
 * Usage: node server/src/scripts/dataRetentionPurge.js
 * Schedule via cron or Railway cron job (e.g., daily at 2am).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const recordingsDir = path.join(__dirname, '../../uploads/recordings');

async function purgeExpiredData() {
  // Find all users with HIPAA enabled
  const complianceSettings = await prisma.complianceSetting.findMany({
    where: { hipaaEnabled: true },
    include: { user: { select: { id: true, email: true } } }
  });

  console.log(`[Purge] Found ${complianceSettings.length} HIPAA-enabled users`);

  let totalDeleted = 0;
  let totalFilesDeleted = 0;

  for (const setting of complianceSettings) {
    const retentionDays = setting.dataRetentionDays || 365;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`[Purge] User ${setting.user.id} (${setting.user.email}): retention=${retentionDays} days, cutoff=${cutoffDate.toISOString()}`);

    // Find expired CallLog records
    const expiredLogs = await prisma.callLog.findMany({
      where: {
        userId: setting.user.id,
        createdAt: { lt: cutoffDate }
      },
      select: { id: true, vapiCallId: true, recordingUrl: true }
    });

    if (expiredLogs.length === 0) {
      console.log(`[Purge] User ${setting.user.id}: no expired records`);
      continue;
    }

    console.log(`[Purge] User ${setting.user.id}: ${expiredLogs.length} expired records to purge`);

    // Delete associated recording files from disk
    for (const log of expiredLogs) {
      if (log.vapiCallId) {
        // Try all possible file patterns
        const patterns = [
          `${log.vapiCallId}.mp3.enc`,
          `${log.vapiCallId}.wav.enc`,
          `${log.vapiCallId}.mp3`,
          `${log.vapiCallId}.wav`
        ];

        for (const filename of patterns) {
          const filePath = path.join(recordingsDir, filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              totalFilesDeleted++;
              console.log(`[Purge] Deleted recording file: ${filename}`);
            } catch (err) {
              console.error(`[Purge] Failed to delete file ${filename}:`, err.message);
            }
          }
        }
      }
    }

    // Delete the CallLog records
    const deleteResult = await prisma.callLog.deleteMany({
      where: {
        userId: setting.user.id,
        createdAt: { lt: cutoffDate }
      }
    });

    totalDeleted += deleteResult.count;
    console.log(`[Purge] User ${setting.user.id}: deleted ${deleteResult.count} CallLog records`);

    // Audit log the purge
    await prisma.auditLog.create({
      data: {
        userId: setting.user.id,
        actorType: 'system',
        action: 'phi.purge',
        resourceType: 'call_log',
        details: JSON.stringify({
          recordsDeleted: deleteResult.count,
          retentionDays,
          cutoffDate: cutoffDate.toISOString()
        })
      }
    }).catch(err => {
      console.error(`[Purge] Audit log failed:`, err.message);
    });
  }

  console.log(`[Purge] Complete: ${totalDeleted} records deleted, ${totalFilesDeleted} files deleted`);
}

async function main() {
  console.log('[Purge] Starting data retention purge...');

  try {
    await purgeExpiredData();
  } catch (err) {
    console.error('[Purge] Purge failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
