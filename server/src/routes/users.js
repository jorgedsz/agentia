const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Dashboard stats (all roles)
router.get('/stats', userController.getDashboardStats);

// Dashboard overview (all roles)
router.get('/overview', userController.getDashboardOverview);

// Get all users (OWNER only)
router.get('/', requireRole(ROLES.OWNER), userController.getAllUsers);

// Create whitelabel (OWNER only)
router.post('/whitelabels', requireRole(ROLES.OWNER), userController.createWhitelabel);

// Get all agencies (OWNER and WHITELABEL)
router.get('/agencies', requireRole(ROLES.OWNER, ROLES.WHITELABEL), userController.getAllAgencies);

// Create agency (OWNER and WHITELABEL)
router.post('/agencies', requireRole(ROLES.OWNER, ROLES.WHITELABEL), userController.createAgency);

// Get agency's clients (AGENCY gets own clients, OWNER/WHITELABEL can see scoped clients)
router.get('/clients', requireRole(ROLES.AGENCY, ROLES.OWNER, ROLES.WHITELABEL), userController.getAgencyClients);
router.get('/clients/:agencyId', requireRole(ROLES.OWNER, ROLES.WHITELABEL), userController.getAgencyClients);

// Create client (AGENCY creates under themselves, OWNER/WHITELABEL can specify agency)
router.post('/clients', requireRole(ROLES.AGENCY, ROLES.OWNER, ROLES.WHITELABEL), userController.createClient);

// Update user role (OWNER only)
router.patch('/:id/role', requireRole(ROLES.OWNER), userController.updateUserRole);

// Update user billing - credits and rates (OWNER and WHITELABEL)
router.patch('/:id/billing', requireRole(ROLES.OWNER, ROLES.WHITELABEL), userController.updateUserBilling);

// Delete user/client (OWNER, WHITELABEL, AGENCY)
router.delete('/:id', requireRole(ROLES.AGENCY, ROLES.OWNER, ROLES.WHITELABEL), userController.deleteUser);

module.exports = router;
