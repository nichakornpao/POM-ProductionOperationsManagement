// นำเข้าไลบรารี express
const express = require('express');
const router = express.Router(); // สร้าง instance ของ Router

// นำเข้าคอนโทรเลอร์
const ItemlistController = require('../controllers/Itemlist.controller');

// console.log("✅ Request.route.js loaded");




// Setup Tool Routes
router.get('/get_Setup_Division', ItemlistController.get_Setup_Division);
router.post('/get_Setup_Facility', ItemlistController.get_Setup_Facility);


// Case SET Routes (CuttingTool + SetupTool)
router.post('/get_CaseSET_CuttingTool_Detail', ItemlistController.get_CaseSET_CuttingTool_Detail);
router.post('/get_CaseSET_All', ItemlistController.get_CaseSET_All); // ✅ New Route


// Case SET Dropdown Routes
router.post('/get_CaseSET_Dropdown_PartNo', ItemlistController.get_CaseSET_Dropdown_PartNo);
router.post('/get_CaseSET_Dropdown_Process', ItemlistController.get_CaseSET_Dropdown_Process);
router.post('/get_CaseSET_Dropdown_MC', ItemlistController.get_CaseSET_Dropdown_MC);
router.post('/get_CaseSET_Dropdown_ItemNo', ItemlistController.get_CaseSET_Dropdown_ItemNo);

// Tooling Request by Unique_Id (for PlanList VIEW button)
router.post('/get_ToolingRequest_ByUniqueId', ItemlistController.getToolingRequestByUniqueId);

// ส่งออก router สำหรับใช้งานในที่อื่น
module.exports = router;
