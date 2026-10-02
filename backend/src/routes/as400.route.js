const express = require('express');
const router = express.Router();
const AS400 = require('../controllers/as400.controller.js');

// router.get('/as400', AS400.getAS400); // Removed as it's no longer used
router.post('/as400/export', AS400.postAS400);
router.get('/as400/config', AS400.getAS400Config);
router.post('/as400/config/auto-fire', AS400.postAutoFireConfig);

module.exports = router;

