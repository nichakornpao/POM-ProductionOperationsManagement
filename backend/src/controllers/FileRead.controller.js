const fs = require('fs');
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
  const rawPath = req.body?.filePath || req.query?.filePath;
  const filePath = normalizeFilePath(rawPath);
  const requestNo = req.body?.requestNo || req.query?.requestNo;

  if (!filePath) {
    return res.status(400).json({ error: 'ต้องระบุ path ของไฟล์' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์ PDF' });
  }

  try {
    let pdfBytes = fs.readFileSync(filePath);

    const docType = (req.body?.docType || req.query?.docType || '').toUpperCase();
    const pdfFileName = path.basename(filePath).toUpperCase();
    const pdfFolderName = path.basename(path.dirname(filePath)).toUpperCase();

    const fullPathUpper = filePath.toUpperCase().replace(/\\/g, '/');
    const isLayoutFile = docType === 'LAYOUT' || 
                         pdfFileName.includes('LAYOUT') || 
                         pdfFileName.includes('LAY') || 
                         fullPathUpper.includes('CUTTING LAY-OUT') || 
                         fullPathUpper.includes('/LAYOUT/');

    let isDrawing = false;
    if (isLayoutFile) {
      isDrawing = false;
    } else if (docType === 'DWG' || docType === 'PATHDWG') {
      isDrawing = true;
    } else {
      isDrawing = fullPathUpper.includes('PROCESS DWG') || fullPathUpper.includes('/DWG/') || pdfFileName.includes('DWG');
    }

    if (requestNo && isDrawing) {
      try {
        const barcodeBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: String(requestNo),
          scale: 3,
          height: 10,
          includetext: true,
          textxalign: 'center',
        });

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        if (pages.length > 0) {
          const firstPage = pages[0];
          const { width, height } = firstPage.getSize();
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);

          const rotation = firstPage.getRotation().angle;
          const W = width;
          const H = height;

          const visualWidth = (rotation === 90 || rotation === 270) ? H : W;
          const visualHeight = (rotation === 90 || rotation === 270) ? W : H;

          const targetWidth = 88;
          const scaleFactor = targetWidth / barcodeImage.width;
          const targetHeight = barcodeImage.height * scaleFactor;

          // Position inside Drawing side box (below TEMPORARY : MAN RESULT MONITORING)
          const Vx = visualWidth - 125;
          const Vy = visualHeight - 395 - targetHeight;

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

          pdfBytes = await pdfDoc.save();
        }
      } catch (barcodeErr) {
        console.error('[FileRead loadPdfFromPath] Barcode stamp error:', barcodeErr);
      }
    }

    res.contentType('application/pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('[FileRead loadPdfFromPath Error]', err);
    res.status(500).json({ error: err.message });
  }
};

