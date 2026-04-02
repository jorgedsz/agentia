const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const followUpController = require('../controllers/followUpController');

router.get('/', authMiddleware, followUpController.listFollowUps);
router.patch('/:id', authMiddleware, followUpController.updateFollowUp);
router.delete('/:id', authMiddleware, followUpController.deleteFollowUp);

module.exports = router;
