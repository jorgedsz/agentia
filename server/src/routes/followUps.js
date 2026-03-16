const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const followUpController = require('../controllers/followUpController');

router.get('/', authMiddleware, followUpController.listFollowUps);
router.delete('/:id', authMiddleware, followUpController.cancelFollowUp);

module.exports = router;
