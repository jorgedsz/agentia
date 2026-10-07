const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const controller = require('../controllers/billingProfileController');

router.use(authMiddleware);

// This is the tax charged on top of every client payment under a partner, the
// numbering sequence its invoices come from, and its own bank details.
//
// The role gate here is the coarse half of the rule: authenticated, and a role
// that can own an issuer at all — so a CLIENT is refused by role before it ever
// reaches a handler, whatever id it asks for. The other half, WHICH account
// each role may touch (the OWNER any, a partner only itself), lives in
// canConfigureBillingProfile and is checked inside the handlers, ahead of the
// upsert — the write is keyed on the :userId in the path, so that check has to
// be in the same place as the write and not only out here.
const ROLES_WITH_AN_ISSUER = [ROLES.OWNER, ROLES.WHITELABEL, ROLES.AGENCY];

router.get('/:userId', requireRole(...ROLES_WITH_AN_ISSUER), controller.get);
router.put('/:userId', requireRole(...ROLES_WITH_AN_ISSUER), controller.set);

module.exports = router;
