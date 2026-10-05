const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const controller = require('../controllers/billingProfileController');

router.use(authMiddleware);

// OWNER only, both ways: this is the tax charged on top of every client payment
// under a partner and the numbering sequence its invoices come from, plus the
// partner's own bank details. A partner does not configure that about itself,
// and nothing below a partner may read it.
router.get('/:userId', requireRole(ROLES.OWNER), controller.get);
router.put('/:userId', requireRole(ROLES.OWNER), controller.set);

module.exports = router;
