const fs = require('fs');
const path = require('path');
let PDFDocument, degrees;
try {
  ({ PDFDocument, degrees } = require('pdf-lib'));
} catch (e) {
  // pdf-lib will be used if installed via npm
}
let bwipjs;
try {
  bwipjs = require('bwip-js');
} catch (e) {
  // bwip-js will be used if installed via npm
}

/**
 * API: GET /api/print-pdf
 * ทำหน้าที่เป็น "Proxy" ดึงไฟล์ PDF จาก UNC share แล้วส่งให้ Browser
 * Browser จะจัดการปั๊ม Barcode เอง (ด้วย pdf-lib หรือ Canvas)
 * ไม่แก้ไขไฟล์ต้นฉบับเด็ดขาด
 */
/**
 * -----------------------------------------------------------------------------
 * CORE LOGIC FIX:
 * Path resolution for Drawing & Layout files using `Path_Layout` from database.
 * -----------------------------------------------------------------------------
 */
function resolveLegacyPdfPath(dbPath) {
    if (!dbPath) return null;
    let resolved = dbPath;
    
    if (resolved.toUpperCase().startsWith('P:\\') || resolved.toUpperCase().startsWith('P:/')) {
        let relativePath = resolved.substring(3).replace(/\\/g, '\\');
        console.log(`[PrintPdf] Resolving legacy path: ${dbPath}`);
        
        let pbp083Path = path.join('\\\\pbp083\\Public\\Process Engineer', relativePath);
        
        // Fix base path: Layouts (and possibly Drawings) should check \\pbgm06\D\PartEN PMC
        // If it was P:\Layout\..., we try appending it to \\pbgm06\D\PartEN PMC, or just strip Layout.
        // For safety, we just join it. If the exact path doesn't exist, PrintPdf's fallback logic will run.
        let pbgm06Path = path.join('\\\\pbgm06\\D\\PartEN PMC', relativePath);
        
        // If Layout path, we prioritize pbgm06
        if (relativePath.toUpperCase().includes('LAYOUT')) {
            resolved = pbgm06Path;
            console.log(`[PrintPdf] Layout mapped to: ${resolved}`);
        } else {
            // Drawing shares similar logic, prioritize pbp083 but check pbgm06
            resolved = pbp083Path;
            console.log(`[PrintPdf] Drawing mapped to: ${resolved}`);
        }
    }
    return resolved;
}

exports.printWithBarcode = async (req, res) => {
    const { filePath, requestNo, barcode } = req.query;

    if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
    }

    let pdfFilePath = resolveLegacyPdfPath(filePath);

    // Security: อนุญาตเฉพาะ path จากแชร์ไดรฟ์ที่กำหนด
    const allowedPrefixes = [
        '\\\\pbp083\\Public\\Process Engineer',
        '//pbp083/Public/Process Engineer',
        '\\\\pbgm06\\D\\PartEN PMC',
        '//pbgm06/D/PartEN PMC'
    ];
    const normalizedFilePath = pdfFilePath.toLowerCase().replace(/\\/g, '/');
    const isAllowed = allowedPrefixes.some(p => normalizedFilePath.startsWith(p.toLowerCase().replace(/\\/g, '/')));
    
    if (!isAllowed) {
        console.warn('[PrintPdf] Access denied for path:', filePath);
        return res.status(403).json({ error: 'Access to this path is not allowed', path: filePath });
    }

    try {
        let actualFolder = pdfFilePath;

        // Fallback: ถ้า path ที่ให้มาไม่มีอยู่จริง ให้ลองหาในโฟลเดอร์แม่
        if (!fs.existsSync(actualFolder)) {
            const parentDir = path.dirname(actualFolder);
            const baseName = path.basename(actualFolder);
            if (fs.existsSync(parentDir)) {
                if (baseName.toLowerCase().endsWith('.pdf')) {
                    // ถ้า path เดิมชี้ไปที่ไฟล์ PDF ที่ไม่มีอยู่จริง (เช่นพิมพ์ผิด หรือโดนย้ายไป \Old\)
                    // ให้ fallback กลับไปที่โฟลเดอร์แม่ เพื่อแสดงรายการไฟล์ทั้งหมดให้ user เลือก
                    actualFolder = parentDir;
                } else {
                    // ถ้าเป็นโฟลเดอร์ ให้ลองหาแบบ recursive เผื่อโดนย้ายไปซ้อนโฟลเดอร์อื่น
                    const found = findFolderRecursive(parentDir, baseName);
                    if (found) {
                        actualFolder = found;
                    } else {
                        // หาไม่เจอจริงๆ ก็ fallback ไปโฟลเดอร์แม่
                        actualFolder = parentDir;
                    }
                }
            }
        }

        // ถ้า path ชี้ไปที่ folder ให้หาไฟล์ PDF ข้างในแบบ recursive
        if (fs.existsSync(actualFolder) && fs.statSync(actualFolder).isDirectory()) {
            const allPdfs = findPdfsRecursive(actualFolder);
            
            if (allPdfs.length === 0) {
                const files = fs.readdirSync(actualFolder);
                return res.status(404).json({ 
                    error: 'ไม่พบไฟล์ PDF ในโฟลเดอร์',
                    path: actualFolder,
                    files: files 
                });
            }

            // ถ้ามีหลายไฟล์ ให้คืนรายการให้ User เลือก (แสดงไฟล์ทั้งหมดที่พบ)
            if (allPdfs.length > 1) {
                return res.status(300).json({ 
                    multipleFiles: true,
                    files: allPdfs.map(p => ({
                        name: path.basename(p),
                        fullPath: p,
                        folder: path.basename(path.dirname(p))
                    }))
                });
            }

            pdfFilePath = allPdfs[0];
        }

        if (!fs.existsSync(pdfFilePath)) {
            return res.status(404).json({ error: `ไม่พบไฟล์: ${pdfFilePath}` });
        }

        // อ่านไฟล์และส่งกลับ (ไม่แก้ไขไฟล์ต้นฉบับในดิสก์)
        let pdfBytes = fs.readFileSync(pdfFilePath);

        const fromTab = req.query.fromTab || 'Engineer';
        const docType = (req.query.docType || req.query.type || '').toUpperCase();
        const pdfFileName = path.basename(pdfFilePath).toUpperCase();
        const pdfFolderName = path.basename(path.dirname(pdfFilePath)).toUpperCase();

        const fullPathUpper = pdfFilePath.toUpperCase().replace(/\\/g, '/');
        const isLayoutFile = docType === 'LAYOUT' || 
                             pdfFileName.includes('LAYOUT') || 
                             pdfFileName.includes('LAY') || 
                             fullPathUpper.includes('CUTTING LAY-OUT') || 
                             fullPathUpper.includes('/LAYOUT/');

        // ปั๊มบาร์โค้ดเฉพาะไฟล์ DWG (Drawing) เท่านั้น! (ห้ามปั๊มลงไฟล์ LAYOUT เด็ดขาดทุกกรณี)
        let isDrawing = false;
        if (isLayoutFile) {
            isDrawing = false;
        } else if (fromTab === 'Engineer') {
            // หน้า Engineer (Tab 1): โชว์บาร์โค้ดตัวหลักอย่างเดียว (Process DWG ตัวหลัก)
            // ไม่ปั๊มบาร์โค้ดลงไฟล์ย่อย/ไฟล์ประกอบอื่นในรายการ
            const baseWithoutExt = path.parse(pdfFileName).name;
            const secondaryKeywords = ['TURNING', 'SETUP', 'REF', 'LAYOUT', 'CAM', 'TOOL', 'LIST', 'OP'];
            const hasSecondaryKeyword = secondaryKeywords.some(k => baseWithoutExt.includes(k));
            const isProcessDwgFolder = fullPathUpper.includes('PROCESS DWG') || fullPathUpper.includes('/DWG/');

            if (isProcessDwgFolder && !hasSecondaryKeyword) {
                isDrawing = true;
            } else {
                isDrawing = false;
            }
        } else {
            // หน้า Plan List EN (Tab 2): ปั๊มบาร์โค้ด PLAN-${Plan_ID} ลงบนไฟล์ DWG ในตำแหน่งกล่องขวา
            if (docType === 'DWG' || docType === 'PATHDWG') {
                isDrawing = true;
            } else {
                isDrawing = fullPathUpper.includes('PROCESS DWG') || fullPathUpper.includes('/DWG/') || pdfFileName.includes('DWG');
            }
        }

        let barcodeText = (barcode || requestNo || '').trim();
        // แปลงปี 2026 เป็น 26 และตัด '-' ออกเพื่อให้บาร์โค้ดสั้น สแกนติดง่าย (เช่น 260918|260930|BM165|666)
        if (barcodeText.includes('|')) {
            barcodeText = barcodeText.split('|').map((part, idx) => {
                if (idx <= 1) {
                    let p = part.replace(/-/g, '');
                    if (p.length === 8 && p.startsWith('20')) {
                        p = p.substring(2); // '20260918' -> '260918'
                    }
                    return p;
                }
                return part;
            }).join('|');
        }

        if (barcodeText && isDrawing) {
            try {
                // 1. สร้างภาพ 1D Barcode (Code 128) สไตล์สินค้าแบบมีข้อความด้านล่าง
                const barcodeBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',       // 1D Barcode
                    text: barcodeText,     // Text to encode (ค่าข้อมูลเดิม 100%)
                    scale: 3,              // 3x scaling factor สำหรับความคมชัดสูง
                    height: 13,            // Bar height in mm (แท่งสูง สแกนติดง่าย)
                    includetext: true,     // แสดงตัวหนังสือใต้บาร์โค้ด
                    textxalign: 'center',  // Centered
                    textsize: 8,           // Text font size
                    textmargin: 3,         // Spacing
                    paddingtop: 4,
                    paddingbottom: 4,
                    paddingleft: 8,
                    paddingright: 8,
                    backgroundcolor: 'ffffff'
                });

                // 2. โหลดไฟล์ PDF ด้วย pdf-lib
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const pages = pdfDoc.getPages();
                
                if (pages.length > 0) {
                    const firstPage = pages[0];
                    const { width, height } = firstPage.getSize();
                    
                    // 3. ฝังภาพ Barcode ลงใน PDF
                    const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
                    
                    const rotation = firstPage.getRotation().angle;
                    const W = width;
                    const H = height;
                    
                    const visualWidth = (rotation === 90 || rotation === 270) ? H : W;
                    const visualHeight = (rotation === 90 || rotation === 270) ? W : H;

                    // ปรับขนาดบาร์โค้ดให้กว้างคมชัด สแกนติดง่ายขึ้นสำหรับหัวอ่านสแกนเนอร์ทุกรุ่น (165 pt)
                    const targetWidth = 165;
                    const scaleFactor = targetWidth / barcodeImage.width;
                    const targetHeight = barcodeImage.height * scaleFactor;
                    
                    // พิกัดในระบบ Visual Screen: วางใต้ช่อง DATE
                    const Vx = visualWidth - 200;
                    const Vy = 2;
                    
                    // แปลงกลับเป็นพิกัด Raw เพื่อวาดภาพให้ถูกต้องตามการหมุนของไฟล์ PDF
                    let Rx, Ry, drawRotate;
                    if (rotation === 0) {
                        Rx = Vx;
                        Ry = Vy;
                        drawRotate = 0;
                    } else if (rotation === 90) {
                        Rx = W - Vy - targetHeight;
                        Ry = Vx;
                        drawRotate = 90;
                    } else if (rotation === 180) {
                        Rx = W - Vx - targetWidth;
                        Ry = H - Vy - targetHeight;
                        drawRotate = 180;
                    } else if (rotation === 270) {
                        Rx = Vy;
                        Ry = H - Vx;
                        drawRotate = 270;
                    }

                    firstPage.drawImage(barcodeImage, {
                        x: Rx,
                        y: Ry,
                        width: targetWidth,
                        height: targetHeight,
                        rotate: degrees(drawRotate)
                    });

                    // นำข้อมูล PDF ที่วาดเสร็จแล้วมาใช้ส่งกลับ
                    pdfBytes = await pdfDoc.save();
                }
            } catch (barcodeErr) {
                console.error('[PRINT PDF] Error stamping barcode:', barcodeErr);
                // ถ้าปั๊มล้มเหลว ก็ส่งไฟล์ PDF ต้นฉบับไปเหมือนเดิม ไม่ให้ระบบพัง
            }
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(pdfFilePath)}"`);
        res.setHeader('Content-Length', pdfBytes.length);
        // อนุญาตให้ iframe โหลดข้ามโดเมน/พอร์ตได้
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        res.removeHeader('X-Frame-Options');
        res.end(Buffer.from(pdfBytes));

        console.log(`[PRINT PDF] Served: ${path.basename(pdfFilePath)}`);

    } catch (err) {
        console.error('[PRINT PDF ERROR]', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * ค้นหาไฟล์ PDF แบบ recursive ในโฟลเดอร์
 * เรียงลำดับโดยเอา "PROCESS DWG" ขึ้นก่อน เพราะส่วนใหญ่อยู่ในนั้น
 */
function findPdfsRecursive(dir, depth = 0) {
    if (depth > 3) return []; // จำกัดความลึกสูงสุด 3 ชั้น
    
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        // เรียงให้ PROCESS DWG ขึ้นก่อน
        entries.sort((a, b) => {
            const priority = ['PROCESS DWG', 'Process DWG', 'DWG'];
            const aP = priority.findIndex(p => a.name.toUpperCase().includes(p.toUpperCase()));
            const bP = priority.findIndex(p => b.name.toUpperCase().includes(p.toUpperCase()));
            if (aP !== -1 && bP === -1) return -1;
            if (bP !== -1 && aP === -1) return 1;
            return 0;
        });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // ข้ามโฟลเดอร์ที่ไม่เกี่ยวข้อง
                const skip = ['OBSOLATE', 'Complete DWG', 'OUTSIDE', 'GM ECN', 'Pivot ECN', 'REWORK DWG'];
                if (skip.some(s => entry.name.toUpperCase().includes(s.toUpperCase()))) continue;
                results = results.concat(findPdfsRecursive(fullPath, depth + 1));
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                results.push(fullPath);
            }
        }
    } catch (e) {
        // ignore permission errors
    }
    return results;
}

/**
 * ค้นหาโฟลเดอร์ย่อยแบบ recursive (ค้นหาลึกสุด 2 ชั้น)
 * เช่น หา 'OT-7067A' ข้างใน 'PMC Parts/Process DWG/'
 */
function findFolderRecursive(dir, targetName, depth = 0) {
    if (depth > 2) return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dir, entry.name);
                if (entry.name.toUpperCase() === targetName.toUpperCase()) {
                    return fullPath;
                }
                const found = findFolderRecursive(fullPath, targetName, depth + 1);
                if (found) return found;
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
}
