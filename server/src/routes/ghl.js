const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ghlController = require('../controllers/ghlController');

// Public routes (called by VAPI tools - no auth required)
// These use userId in request body to identify the user
router.post('/check-availability', ghlController.checkAvailability);
router.post('/book-appointment', ghlController.bookAppointment);

// OAuth callback (public - browser redirect from GHL)
router.get('/oauth/callback', ghlController.oauthCallback);

// Protected routes (require authentication)
router.use(authMiddleware);

// OAuth authorize (protected - initiates flow)
router.get('/oauth/authorize', ghlController.oauthAuthorize);

// Connect to GHL with private token (legacy)
router.post('/connect', ghlController.connect);

// Get current connection status
router.get('/status', ghlController.getStatus);

// Disconnect GHL integration
router.delete('/disconnect', ghlController.disconnect);

// Get calendars from GHL
router.get('/calendars', ghlController.getCalendars);

module.exports = router;
