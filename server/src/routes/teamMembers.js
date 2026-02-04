const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const teamMemberController = require('../controllers/teamMemberController');

// Public route - Team member login
router.post('/login', teamMemberController.teamMemberLogin);

// Protected routes - require authentication
router.use(authMiddleware);

// CRUD operations
router.get('/', teamMemberController.getTeamMembers);
router.post('/', teamMemberController.createTeamMember);
router.put('/:id', teamMemberController.updateTeamMember);
router.delete('/:id', teamMemberController.deleteTeamMember);

module.exports = router;
