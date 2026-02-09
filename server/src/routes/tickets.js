const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', ticketController.listTickets);
router.get('/:id', ticketController.getTicket);
router.post('/', ticketController.createTicket);
router.put('/:id', ticketController.updateTicket);
router.patch('/:id/status', ticketController.updateStatus);
router.post('/:id/replies', ticketController.addReply);
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
