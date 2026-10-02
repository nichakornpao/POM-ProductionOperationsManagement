const express = require('express');
const router = express.Router();
const EmailController = require('../controllers/Email.controller');

// Send receiver email
// Postman use post and json {"receiver": "email you want to send"}
router.post('/email/send', EmailController.sendEmailNotification);

// Preview email template
// Open browser and go to http://localhost:3000/api/email/preview
router.get('/email/preview', EmailController.previewEmailTemplate);

module.exports = router;
