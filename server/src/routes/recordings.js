const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const recordingsDir = path.join(__dirname, '../../uploads/recordings');

// GET /api/recordings/:filename — serve recording files (no auth)
router.get('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent directory traversal
  const filePath = path.join(recordingsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

module.exports = router;
