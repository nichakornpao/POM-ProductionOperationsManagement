const express = require('express');
const router = express.Router();
const FileReadController = require('../controllers/FileRead.controller');

router.post('/loadPdfFromPath', FileReadController.loadPdfFromPath);

module.exports = router;