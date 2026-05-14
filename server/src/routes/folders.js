const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', folderController.listFolders);
router.post('/', folderController.createFolder);
router.patch('/:id', folderController.renameFolder);
router.delete('/:id', folderController.deleteFolder);

module.exports = router;
