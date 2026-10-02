// src/routes/Upload.route.js
const express = require('express');
const router = express.Router();

const FileUploadController = require('../controllers/FileUpload.controller');

router.post('/loadPdfFromPath', FileUploadController.loadPdfFromPath);

module.exports = router;