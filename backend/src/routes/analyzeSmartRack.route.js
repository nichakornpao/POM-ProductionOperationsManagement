const express = require('express');
const router = express.Router();

const analyzeSmartRack = require('../controllers/analyzeSmartRack.controller');



router.get('/getdatasmartrack', analyzeSmartRack.getdatasmartrack);

module.exports = router;
