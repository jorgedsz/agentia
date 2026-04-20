const express = require('express');
const router = express.Router();
const controller = require('../controllers/recurringPaymentController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/mark-paid', controller.markPaid);
router.post('/:id/fire-now', controller.fireNow);

module.exports = router;
