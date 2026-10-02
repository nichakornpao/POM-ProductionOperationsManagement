// upload.controller.js
const fs = require('fs');
const path = require('path');
const sql = require("mssql");
const { poolPromise } = require("../config/database");


// exports.FileUpload = async (req,res) => {
//   // console.log(req.body);
//   // console.log('fileupload:',req.files)
//   try {
//     if (!req.files || !req.files.file) {
//       return res.status(400).json({ message: " ไม่พบไฟล์ที่แนบ" });
//     }

//     const file = req.files.file;
//     const caseKey = req.body.caseKey; // 'JIG', 'MOLD', etc.

//     if (!caseKey) {
//       return res.status(400).json({ message: " ต้องระบุ Case_" });
//     }

//     const fileBuffer = file.data;
//     const fileName = file.name;
//     // const contentType = file.mimetype;

//     const pool = await poolPromise;

//     //  อัปเดตทุกแถวในตะกร้าที่ตรงกับเคสนั้น
//     const result = await pool.request()
//       .input('CASE', sql.NVarChar(50), caseKey)
//       .input('FileName', sql.NVarChar(255), fileName)
//       .input('FileData', sql.VarBinary(sql.MAX), fileBuffer)

//       .query(`
//         UPDATE tb_IssueCuttingTool_SendToCart
//         SET FileName = @FileName,
//             FileData = @FileData
//         WHERE [CASE] = @CASE
//       `);

//     res.status(200).json({ message: ` แนบไฟล์ให้ทุกแถวในเคส ${caseKey} แล้ว (${result.rowsAffected[0]} แถว)` });

//   } catch (error) {
//     console.error(" Error FileUploadByCase:", error);
//     res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
//   }
// };

// exports.GetImage = async (req, res) => {
//   // console.log("getimage called:", req.params.caseKey);
//   const caseKey = req.params.caseKey;

//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .input('CASE', sql.NVarChar(50), caseKey)
//       .query(`
//         SELECT TOP 1 FileData, FileName
//         FROM tb_IssueCuttingTool_SendToCart
//         WHERE [CASE] = @CASE AND FileData IS NOT NULL
//       `);

//     if (result.recordset.length === 0) {
//       return res.status(404).json({ message: 'ไม่พบภาพ' });
//     }

//     const image = result.recordset[0];

//     // แปลง Buffer เป็น base64
//     const base64Image = Buffer.from(image.FileData).toString('base64');
//     const mimeType = 'application/pdf'; // หรือ 'image/png'

//     res.json({
//       fileName: image.FileName,
//       imageData: `data:${mimeType};base64,${base64Image}`
//     });

//   } catch (error) {
//     console.error("Error executing GetImage:", error);
//     res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
//   }
// };

function normalizeFilePath(rawPath) {
  if (!rawPath) return '';
  let p = rawPath.toString().trim();
  p = p.replace(/^["']+|["']+$/g, '').trim();
  if (p.toLowerCase().startsWith('file:')) {
    p = decodeURIComponent(p.replace(/^file:[\\/]+/i, ''));
    p = '\\\\' + p.replace(/\//g, '\\');
  }
  return p;
}

exports.loadPdfFromPath = async (req, res) => {
  try {
    const rawPath = req.body.filePath;
    const filePath = normalizeFilePath(rawPath);

    if (!filePath || !fs.existsSync(filePath)) {
      console.warn(`[FileUpload loadPdfFromPath] File not found: "${rawPath}" -> "${filePath}"`);
      return res.status(404).json({ error: 'ไม่พบไฟล์ที่ระบุ' });
    }

    // Check if it is a directory
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path เป็นโฟลเดอร์ ไม่ใช่ไฟล์ (ไม่สามารถเปิดอ่านได้)' });
    }

    const fileData = fs.readFileSync(filePath);
    const base64Pdf = Buffer.from(fileData).toString('base64');

    // Auto-detect mime type or default to PDF (since likely PDF based on usage)
    const pdfUrl = `data:application/pdf;base64,${base64Pdf}`;

    res.json({ imageData: pdfUrl, fileName: path.basename(filePath) });
  } catch (err) {
    console.error('loadPdfFromPath error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message });
  }
};

// // ฟังก์ชันนี้จะถูกใช้หลัง multer ทำงานแล้ว (req.file พร้อมใช้งาน)
// exports.FileUpload = async (req, res) => {
//   try {
//     // 1. ตรวจสอบว่าไฟล์ถูกส่งมาจริง
//     if (!req.file) {
//       return res.status(400).json({ error: 'ไม่มีไฟล์ถูกอัปโหลด' });
//     }

//     const file = req.files.file; // multer เพิ่ม req.file เข้ามาให้

//     // 2. ตั้งชื่อไฟล์ใหม่
//     const saveName = `${Date.now()}-${file.originalname}`;

//     // 3. สร้าง path ปลายทาง
//     const savePath = path.join(BASE_UPLOAD_DIR, saveName);

//     // 4. ย้ายไฟล์จาก tmp path ของ multer → ไปยัง network path
//     fs.renameSync(file.path, savePath); // ใช้ renameSync เพื่อย้ายไฟล์

//     // 5. ส่งผลกลับ
//     return res.json({
//       success: true,
//       filename: saveName,
//       path: savePath
//     });
//   } catch (err) {
//     console.error(' Upload error:', err);
//     return res.status(500).json({ error: 'เกิดข้อผิดพลาดขณะอัปโหลด' });
//   }
// };