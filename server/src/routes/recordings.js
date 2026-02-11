const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');

const recordingsDir = path.join(__dirname, '../../uploads/recordings');

// GET /api/recordings/:filename — serve recording files (auth required)
router.get('/:filename', authMiddleware, async (req, res) => {
  const filename = path.basename(req.params.filename); // prevent directory traversal
  const filePath = path.join(recordingsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  // Verify ownership: extract vapiCallId from filename and check CallLog
  const vapiCallId = filename.replace(/\.(mp3|wav)$/i, '');
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

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

module.exports = router;
