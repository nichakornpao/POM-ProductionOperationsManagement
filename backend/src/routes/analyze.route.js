const express = require('express');
const router = express.Router();

const analyze = require('../controllers/analyze.controller'); // 👈 แก้ path

// กำหนด endpoint
router.get('/getdataall', analyze.getdataall);
router.get('/getcostanalyze', analyze.getcostanalyze);

module.exports = router;
