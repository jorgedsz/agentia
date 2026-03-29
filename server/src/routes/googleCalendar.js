const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const googleCalendarController = require('../controllers/googleCalendarController');

// All routes require auth except the OAuth callback
router.get('/status', authMiddleware, googleCalendarController.getStatus);
router.get('/connect', authMiddleware, googleCalendarController.connect);
router.get('/callback', googleCalendarController.callback); // No auth — Google redirects here
router.post('/disconnect', authMiddleware, googleCalendarController.disconnect);
router.get('/events', authMiddleware, googleCalendarController.getEvents);
router.get('/events/client/:clientId', authMiddleware, googleCalendarController.getEventsForClient);

module.exports = router;
