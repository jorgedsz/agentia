const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const pc = require('../controllers/playbookController');

router.get('/', authMiddleware, pc.listPlaybook);
router.post('/', authMiddleware, pc.createEntry);
router.patch('/:id', authMiddleware, pc.updateEntry);
router.delete('/:id', authMiddleware, pc.deleteEntry);

module.exports = router;
