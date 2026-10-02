const express = require('express');
const router = express.Router();
const controller = require('../controllers/MasterPH.controller');
// Routes
// Routes
const upload = require('../config/multer.config');

// router.post('/master-ph/import-master-tooling-pmc', controller.importMasterToolingPMC);
// router.post('/master-ph/import-master-tooling-gm', controller.importMasterToolingGM);
router.post('/master-ph/import-master-tooling-pmc', upload.single('file'), controller.importMasterToolingPMC);
router.post('/master-ph/import-master-tooling-gm', upload.single('file'), controller.importMasterToolingGM);
router.post('/master-ph/sync-gm', controller.syncMasterToolingGM);
router.post('/master-ph/import-ireport', upload.single('file'), controller.importIReport);
router.post('/master-ph/import-part-item-2', upload.single('file'), controller.importPartItem2);
router.delete('/master-ph/purge-part-item-2', controller.purgePartItem2);
router.get('/master-ph/part-item-2', controller.getPartItem2);

module.exports = router;
