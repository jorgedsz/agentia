const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/authMiddleware');
const { decryptFileStream, decryptBufferToStream } = require('../utils/phiEncryption');
const recordingStorage = require('../utils/recordingStorage');
const { logAudit } = require('../utils/auditLog');

const prisma = new PrismaClient();
const recordingsDir = path.join(__dirname, '../../uploads/recordings');

// Resolve a recording file by vapiCallId. Returns
//   { source: 'remote' | 'disk', filename, audioExt, filePath? } or null
// Object storage (when configured) wins over disk so newly uploaded
// recordings are served from S3 even if a stale local copy exists.
const resolveRecording = async (vapiCallId) => {
  const candidates = [`${vapiCallId}.wav.enc`, `${vapiCallId}.mp3.enc`, `${vapiCallId}.wav`, `${vapiCallId}.mp3`];
  if (recordingStorage.isConfigured()) {
    for (const filename of candidates) {
      try {
        if (await recordingStorage.remoteRecordingExists(filename)) {
          const audioExt = filename.endsWith('.mp3.enc') || filename.endsWith('.mp3') ? '.mp3' : '.wav';
          return { source: 'remote', filename, audioExt };
        }
      } catch (e) {
        console.error('[Recordings] remote lookup failed for', filename, e.message);
      }
    }
  }
  for (const filename of candidates) {
    const filePath = path.join(recordingsDir, filename);
    if (fs.existsSync(filePath)) {
      const audioExt = filename.endsWith('.mp3.enc') || filename.endsWith('.mp3') ? '.mp3' : '.wav';
      return { source: 'disk', filename, audioExt, filePath };
    }
  }
  return null;
};

// Stream an encrypted recording from S3 by reading it into a Buffer first
// (recordings are small — typical 5-min call is 3-5 MB). Decryption needs the
// whole ciphertext in memory anyway because the AES-GCM authTag is checked
// against the full ciphertext.
const streamRemoteRecording = async (filename, isEncrypted, res) => {
  const body = await recordingStorage.getEncryptedRecordingStream(filename);
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!isEncrypted) {
    res.end(buffer);
    return;
  }
  const stream = decryptBufferToStream(buffer);
  stream.on('error', (err) => {
    console.error('[Recordings] Remote decryption error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to decrypt recording' });
  });
  stream.pipe(res);
};

// GET /api/recordings/public/:vapiCallId — serve recording without auth (for webhook consumers)
router.get('/public/:vapiCallId', async (req, res) => {
  try {
    const vapiCallId = req.params.vapiCallId;

    const callLog = await prisma.callLog.findUnique({ where: { vapiCallId } });
    if (!callLog || !callLog.recordingUrl) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const found = await resolveRecording(vapiCallId);
    if (!found) {
      return res.status(404).json({ error: 'Recording file not found' });
    }

    const isEncrypted = found.filename.endsWith('.enc');
    const contentType = found.audioExt === '.mp3' ? 'audio/mpeg' : 'audio/wav';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${vapiCallId}${found.audioExt}"`);

    if (found.source === 'remote') {
      await streamRemoteRecording(found.filename, isEncrypted, res);
      return;
    }
    if (isEncrypted) {
      const stream = decryptFileStream(found.filePath);
      stream.on('error', (err) => {
        console.error('[Recordings] Public decryption error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to decrypt recording' });
      });
      stream.pipe(res);
    } else {
      fs.createReadStream(found.filePath).pipe(res);
    }
  } catch (error) {
    console.error('[Recordings] Public route error:', error);
    res.status(500).json({ error: 'Failed to serve recording' });
  }
});

// GET /api/recordings/:filename — serve recording files (auth required)
router.get('/:filename', authMiddleware, async (req, res) => {
  const filename = path.basename(req.params.filename); // prevent directory traversal

  // Extract vapiCallId from the filename so we can use the shared resolver
  const baseName = filename.replace(/\.enc$/i, '');
  const vapiCallId = baseName.replace(/\.(mp3|wav)$/i, '');

  const callLog = await req.prisma.callLog.findUnique({ where: { vapiCallId } });
  if (!callLog) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  // Allow if: user owns the call, or user is OWNER/AGENCY role
  const userRole = req.user.role;
  if (callLog.userId !== req.user.id && userRole !== 'OWNER' && userRole !== 'AGENCY') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const found = await resolveRecording(vapiCallId);
  if (!found) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const isEncrypted = found.filename.endsWith('.enc');
  const contentType = found.audioExt === '.mp3' ? 'audio/mpeg' : 'audio/wav';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${vapiCallId}${found.audioExt}"`);

  logAudit(req.prisma, {
    userId: req.user.id,
    actorId: req.user.id,
    actorType: 'user',
    action: 'phi.access.recording',
    resourceType: 'call_log',
    resourceId: callLog.id,
    details: { vapiCallId, filename: found.filename },
    req
  });

  if (found.source === 'remote') {
    await streamRemoteRecording(found.filename, isEncrypted, res);
    return;
  }
  if (isEncrypted) {
    const stream = decryptFileStream(found.filePath);
    stream.on('error', (err) => {
      console.error('[Recordings] Decryption error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to decrypt recording' });
      }
    });
    stream.pipe(res);
  } else {
    const stream = fs.createReadStream(found.filePath);
    stream.pipe(res);
  }
});

module.exports = router;
