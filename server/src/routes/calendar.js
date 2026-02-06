const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const calendarController = require('../controllers/calendarController');

// Public routes (called by VAPI tools - no auth required)
router.post('/check-availability', calendarController.checkAvailability);
router.post('/book-appointment', calendarController.bookAppointment);

// OAuth callbacks (public - browser redirect from provider)
router.get('/oauth/:provider/callback', calendarController.oauthCallback);

// Protected routes (require authentication)
router.use(authMiddleware);

// OAuth authorize (protected - initiates flow)
router.get('/oauth/:provider/authorize', calendarController.oauthAuthorize);

// List all connected integrations
router.get('/integrations', calendarController.listIntegrations);

// List calendars for a specific integration
router.get('/integrations/:id/calendars', calendarController.getCalendars);

// Connect a provider (API key for Cal.com)
router.post('/integrations/:provider/connect', calendarController.connectProvider);

// Disconnect a specific integration account
router.delete('/integrations/:id/disconnect', calendarController.disconnectIntegration);

module.exports = router;
