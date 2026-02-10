const express = require('express');
const router = express.Router();
const vapiKeyPoolController = require('../controllers/vapiKeyPoolController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

router.use(authMiddleware);
router.use(requireRole(ROLES.OWNER));

// GET /api/vapi-key-pool - List all pool entries
router.get('/', vapiKeyPoolController.listKeys);

// POST /api/vapi-key-pool - Add a new key pair
router.post('/', vapiKeyPoolController.addKey);

// DELETE /api/vapi-key-pool/:id - Remove an unassigned key pair
router.delete('/:id', vapiKeyPoolController.removeKey);

module.exports = router;
