// นำเข้าไลบรารี express
const express = require('express');
const router = express.Router(); // สร้าง instance ของ Router

// นำเข้าคอนโทรเลอร์
const DetailPurchaseRequestlist = require('../controllers/DetailPurchaseRequestlist.controller');

// กำหนดเส้นทาง request
router.get('/Detail_Purchase', DetailPurchaseRequestlist.Detail_Purchase);
router.get('/Detail_Purchase_Setup', DetailPurchaseRequestlist.Detail_Purchase_Setup);
router.get('/Detail_CaseSetup', DetailPurchaseRequestlist.Detail_CaseSetup);
router.post('/Update_Status_Purchase', DetailPurchaseRequestlist.Update_Status_Purchase);

// เพิ่ม route สำหรับอัพเดตข้อมูลรายละเอียด
router.put('/Update_Request', DetailPurchaseRequestlist.Update_Request);

router.post('/Insert_Request_Bulk', DetailPurchaseRequestlist.Add_New_Request_Bulk);

router.delete('/Delete_Request/:id', DetailPurchaseRequestlist.DeleteItem);

router.get('/get_ItemNo', DetailPurchaseRequestlist.Get_ItemNo);

// router.post('/Send_Complete_Email', DetailPurchaseRequestlist.Send_Complete_Email);

// ส่งออก router สำหรับใช้งานในที่อื่น
module.exports = router;
