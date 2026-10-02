// นำเข้าไลบรารี express
const express = require('express');
const router = express.Router(); // สร้าง instance ของ Router

// นำเข้าคอนโทรเลอร์
const PurchaseHistory = require('../controllers/PurchaseHistory.controller');

// กำหนดเส้นทาง History
router.get('/Purchase_History', PurchaseHistory.Purchase_History);
router.put('/Purchase_History/update', PurchaseHistory.Update_History_Fields);

// ส่งออก router สำหรับใช้งานในที่อื่น
module.exports = router;
