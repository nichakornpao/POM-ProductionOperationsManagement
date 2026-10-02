const multer = require('multer');

// Configure storage (Memory Storage - keeps file in RAM)
const storage = multer.memoryStorage();

// File Filter (Accept only Excel and CSV)
const fileFilter = (req, file, cb) => {
    if (
        file.mimetype.includes('excel') ||
        file.mimetype.includes('spreadsheetml') ||
        file.mimetype.includes('csv') ||
        file.originalname.match(/\.(xlsx|xls|csv)$/)
    ) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // Limit 50MB
});

module.exports = upload;
