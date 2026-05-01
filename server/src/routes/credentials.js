const express = require('express');
const router = express.Router();
const credentialsController = require('../controllers/credentialsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', credentialsController.listCredentials);
router.get('/:id', credentialsController.getCredential);
router.post('/', credentialsController.createCredential);
router.put('/:id', credentialsController.updateCredential);
router.delete('/:id', credentialsController.deleteCredential);

module.exports = router;
