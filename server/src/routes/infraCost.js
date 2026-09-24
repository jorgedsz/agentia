const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/infraCostController');

router.use(authMiddleware);

// "me" first, so it is never read as an account id.
router.get('/me', controller.mine);
router.get('/', controller.list);
router.put('/:userId', controller.set);
router.post('/:userId/charge-now', controller.chargeNow);

module.exports = router;
