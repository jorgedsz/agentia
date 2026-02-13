const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/authMiddleware');
const { decryptFileStream } = require('../utils/phiEncryption');
const { logAudit } = require('../utils/auditLog');

const prisma = new PrismaClient();
const recordingsDir = path.join(__dirname, '../../uploads/recordings');

// GET /api/recordings/public/:vapiCallId — serve recording without auth (for webhook consumers)
router.get('/public/:vapiCallId', async (req, res) => {
  try {
    const vapiCallId = req.params.vapiCallId;

    const callLog = await prisma.callLog.findUnique({
      where: { vapiCallId }
    });

    if (!callLog || !callLog.recordingUrl) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Try to find the file on disk by vapiCallId
    const extensions = ['.wav.enc', '.mp3.enc', '.wav', '.mp3'];
    let filePath = null;
    let isEncrypted = false;
    let audioExt = '';

    for (const ext of extensions) {
      const candidate = path.join(recordingsDir, `${vapiCallId}${ext}`);
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        isEncrypted = ext.endsWith('.enc');
        audioExt = ext.replace('.enc', '');
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'Recording file not found' });
    }

    const contentType = audioExt === '.mp3' ? 'audio/mpeg' : 'audio/wav';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${vapiCallId}${audioExt}"`);

    if (isEncrypted) {
      const stream = decryptFileStream(filePath);
      stream.on('error', (err) => {
        console.error('[Recordings] Public decryption error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to decrypt recording' });
        }
      });
      stream.pipe(res);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('[Recordings] Public route error:', error);
    res.status(500).json({ error: 'Failed to serve recording' });
  }
});

// GET /api/recordings/:filename — serve recording files (auth required)
router.get('/:filename', authMiddleware, async (req, res) => {
  const filename = path.basename(req.params.filename); // prevent directory traversal

  // Resolve file: try encrypted first, then fall back to unencrypted (backwards compat)
  let filePath = path.join(recordingsDir, filename);
  let isEncrypted = filename.endsWith('.enc');

  if (!fs.existsSync(filePath)) {
    // If requested without .enc, try the encrypted version
    if (!isEncrypted) {
      const encPath = path.join(recordingsDir, filename + '.enc');
      if (fs.existsSync(encPath)) {
        filePath = encPath;
        isEncrypted = true;
      } else {
        return res.status(404).json({ error: 'Recording not found' });
      }
    } else {
      return res.status(404).json({ error: 'Recording not found' });
    }
  }

  // Extract vapiCallId: strip .enc, then strip audio extension
  const baseName = isEncrypted ? filename.replace(/\.enc$/i, '') : filename;
  const vapiCallId = baseName.replace(/\.(mp3|wav)$/i, '');

  const callLog = await req.prisma.callLog.findUnique({
    where: { vapiCallId }
  });

  if (!callLog) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  // Allow if: user owns the call, or user is OWNER/AGENCY role
  const userRole = req.user.role;
  if (callLog.userId !== req.user.id && userRole !== 'OWNER' && userRole !== 'AGENCY') {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Determine content type from the original audio extension
  const audioExt = path.extname(baseName).toLowerCase();
  const contentType = audioExt === '.mp3' ? 'audio/mpeg' : 'audio/wav';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${baseName}"`);

  // Audit log: PHI recording access
  logAudit(req.prisma, {
    userId: req.user.id,
    actorId: req.user.id,
    actorType: 'user',
    action: 'phi.access.recording',
    resourceType: 'call_log',
    resourceId: callLog.id,
    details: { vapiCallId, filename: baseName },
    req
  });

  if (isEncrypted) {
    const stream = decryptFileStream(filePath);
    stream.on('error', (err) => {
      console.error('[Recordings] Decryption error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to decrypt recording' });
      }
    });
    stream.pipe(res);
  } else {
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
});

module.exports = router;
