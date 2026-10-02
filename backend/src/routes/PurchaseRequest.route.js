// นำเข้าไลบรารี express
const express = require('express');
const router = express.Router(); // สร้าง instance ของ Router

// นำเข้าคอนโทรเลอร์
const PurchaseRequest = require('../controllers/PurchaseRequest.controller');


// กำหนดเส้นทาง request
router.get('/Purchase_Request', PurchaseRequest.Purchase_Request);

// ส่งออก router สำหรับใช้งานในที่อื่น
module.exports = router;