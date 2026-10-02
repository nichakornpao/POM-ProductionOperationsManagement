const express = require('express');
const router = express.Router();
const enSyncController = require('../controllers/EnSync.controller');
const printPdfController = require('../controllers/PrintPdf.controller');

// POST /api/en-sync/now
router.post('/en-sync/now', enSyncController.syncNow);

// GET /api/engineer-history
router.get('/engineer-history', enSyncController.getHistory);

// POST /api/engineer-history/scan
router.post('/engineer-history/scan', enSyncController.scanBarcode);

// GET /api/engineer-history/stats
router.get('/engineer-history/stats', enSyncController.getStats);

// GET /api/engineer-history/monthly-stats
router.get('/engineer-history/monthly-stats', enSyncController.getMonthlyStats);

// GET /api/en-sync/auto-path?partNo=OT-1234  (auto-find PDF path in local uploads folder)
router.get('/en-sync/auto-path', enSyncController.autoFindPath);

// GET /api/en-files?file=...  (serve local PDF files from uploads/en-drawings/)
router.get('/en-files', enSyncController.serveLocalFile);

// GET /api/print-pdf?filePath=\\pbp083\... (proxy ดึงไฟล์ PDF จาก UNC share)
router.get('/print-pdf', printPdfController.printWithBarcode);

// ─────────────────────────────────────────────────────────────────────────────
// Engineer_Return Routes (Document Return & Issue)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/engineer-return
router.get('/engineer-return', enSyncController.getEngineerReturnList);

// GET /api/engineer-return/history
router.get('/engineer-return/history', enSyncController.getEngineerHistory);

// POST /api/engineer-return/process-return
router.post('/engineer-return/process-return', enSyncController.processBarcodeReturn);

// GET /api/engineer-return/barcode-image
router.get('/engineer-return/barcode-image', enSyncController.getBarcodeImage);

// GET /api/engineer-return/stats
router.get('/engineer-return/stats', enSyncController.getEngineerReturnStats);

// POST /api/engineer-return
router.post('/engineer-return', enSyncController.createEngineerReturn);

// DELETE /api/engineer-return/:id
router.delete('/engineer-return/:id', enSyncController.deleteEngineerReturn);

module.exports = router;

