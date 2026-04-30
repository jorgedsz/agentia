const express = require('express');
const router = express.Router();
const chatbotGhlController = require('../controllers/chatbotGhlController');

// Public — chatbot tools call these endpoints (no auth required)
router.post('/create-note', chatbotGhlController.createNote);
router.post('/create-opportunity', chatbotGhlController.createOpportunity);
router.post('/update-opportunity', chatbotGhlController.updateOpportunity);
router.post('/upsert-opportunity', chatbotGhlController.upsertOpportunity);
router.post('/set-contact-field', chatbotGhlController.setContactField);
router.post('/add-tags', chatbotGhlController.addTags);
router.post('/add-to-workflow', chatbotGhlController.addToWorkflow);

module.exports = router;
