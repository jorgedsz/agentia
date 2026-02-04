const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const phoneNumberController = require('../controllers/phoneNumberController');

// All routes require authentication
router.use(authMiddleware);

// List user's imported phone numbers
router.get('/', phoneNumberController.listPhoneNumbers);

// List available numbers from user's Twilio account
router.get('/available', phoneNumberController.listAvailableNumbers);

// Import a phone number from Twilio to VAPI
router.post('/import', phoneNumberController.importPhoneNumber);

// Assign/unassign phone number to agent
router.patch('/:id/assign', phoneNumberController.assignToAgent);

// Remove a phone number
router.delete('/:id', phoneNumberController.removePhoneNumber);

module.exports = router;
