const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/invoiceController');

// Every invoice belongs to somebody; nothing here is public.
router.use(authMiddleware);

router.get('/', controller.listMine);

// Literal path first, or '/:id' swallows it and "by-purchase" is parsed as an
// invoice id.
router.get('/by-purchase/:purchaseId', controller.getByPurchase);

router.get('/:id', controller.getOne);

module.exports = router;
