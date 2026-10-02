const express = require('express');
const router = express.Router();
const controller = require('../controllers/PCPlan.controller'); // เช็ค path ให้ตรง

// 1. Route สำหรับดึง Division
// URL: /api/pc-plan/divisions
router.get('/divisions', controller.getDivisions);

// 2. Route สำหรับดึง Master Data ทั้งหมดในครั้งเดียว
// URL: /api/pc-plan/master-data/:divCode
router.get('/master-data/:divCode', controller.getMasterDataByDivision);

// 3. Route สำหรับบันทึกข้อมูล (Insert)
// URL: /api/pc-plan/insert
router.post('/insert', controller.insertPCPlan);

// 4. Route สำหรับดึงรายการ (Get List)
// URL: /api/pc-plan/list
router.get('/list', controller.getPlanList);

// 4.1 Route สำหรับดึงรายการสำหรับ PD tab (Get PD Plan List with ReqStatus)
// URL: /api/pc-plan/pd-list
router.get('/pd-list', controller.getPlanListPD);

// 4.2 Route สำหรับดึงรายการแบบ Server-Side Pagination
// URL: /api/pc-plan/paginated?page=1&pageSize=100&department=PC&subTab=Upcoming&...
router.get('/paginated', controller.getPlanListPaginated);

// 5. Route สำหรับลบข้อมูล (Delete)
// URL: /api/pc-plan/delete/:id
router.delete('/delete/:id', controller.deletePCPlan);

// 5.1 Route สำหรับลบข้อมูลทั้งกลุ่ม (Delete Group)
// URL: /api/pc-plan/delete-group/:groupId
router.delete('/delete-group/:groupId', controller.deletePCPlanGroup);

// 6. Route สำหรับดึงประวัติ (History)
// URL: /api/pc-plan/history/:groupId
router.get('/history/:groupId', controller.getPlanHistory);

// 7. Route สำหรับอัปเดต Path (ไม่เปลี่ยน Rev)
// URL: /api/pc-plan/update-paths
router.post('/update-paths', controller.updatePaths);

// 10. Route สำหรับ Cancel พร้อม Auto-Create Return to Store + Notify PD
// URL: /api/pc-plan/cancel-with-return
router.post('/cancel-with-return', controller.cancelWithReturn);

// 11. Route สำหรับ Validate Unique_Ids ก่อน Excel Upload (Check Complete status)
// URL: /api/pc-plan/check-complete-status
router.post('/check-complete-status', controller.checkCompleteStatus);

// 12. Route สำหรับ Export ประวัติ PC Plan ตามเดือนและปี
// URL: /api/pc-plan/export-history?month=&year=
router.get('/export-history', controller.exportHistory);

// 13. Route สำหรับให้ EN กด Marked Completed
// URL: /api/pc-plan/mark-en-completed
router.post('/mark-en-completed', controller.markEnCompleted);

module.exports = router;
