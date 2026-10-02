const express = require('express');
const router = express.Router();
// นำเข้าคอนโทรเลอร์
const HistoryPrint = require('../controllers/HistoryPrint.controller')

// กำหนด endpoint
router.post('/SaveHistoryPrint', HistoryPrint.SaveHistoryPrint);


router.get('/EmpPrint', HistoryPrint.EmpPrint);

router.get('/check-print-permission', HistoryPrint.checkPrintPermission);

router.get('/HistoryPrint', HistoryPrint.HistoryPrint);

module.exports = router;