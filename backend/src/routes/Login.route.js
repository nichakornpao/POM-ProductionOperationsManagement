const express = require('express');
const LoginController = require('../controllers/Login.controller');
const router = express.Router();


router.post('/login', LoginController.Login);
router.post('/auth/heartbeat', LoginController.Heartbeat);
router.post('/auth/logout', LoginController.Logout);

module.exports = router;