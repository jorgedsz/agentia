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

// Get all agencies (OWNER only)
router.get('/agencies', requireRole(ROLES.OWNER), userController.getAllAgencies);

// Create agency (OWNER only)
router.post('/agencies', requireRole(ROLES.OWNER), userController.createAgency);

// Get agency's clients (AGENCY gets own clients, OWNER can specify agencyId)
router.get('/clients', requireRole(ROLES.AGENCY, ROLES.OWNER), userController.getAgencyClients);
router.get('/clients/:agencyId', requireRole(ROLES.OWNER), userController.getAgencyClients);

// Create client (AGENCY creates under themselves, OWNER can specify agency)
router.post('/clients', requireRole(ROLES.AGENCY, ROLES.OWNER), userController.createClient);

// Update user role (OWNER only)
router.patch('/:id/role', requireRole(ROLES.OWNER), userController.updateUserRole);

// Update user billing - credits and rates (OWNER only)
router.patch('/:id/billing', requireRole(ROLES.OWNER), userController.updateUserBilling);

// Delete user/client (OWNER can delete any, AGENCY can delete their clients)
router.delete('/:id', requireRole(ROLES.AGENCY, ROLES.OWNER), userController.deleteUser);

module.exports = router;
