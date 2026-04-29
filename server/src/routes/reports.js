const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', reportsController.listReports);
router.post('/', reportsController.createReport);
router.get('/:id', reportsController.getReport);
router.delete('/:id', reportsController.deleteReport);

module.exports = router;
