const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const bwipjs = require('bwip-js');

async function testBoxStamp() {
  const samplePath = '\\\\pbp083\\Public\\Process Engineer\\Doc. ENG\\DWG. Control\\PMC Parts\\Process DWG\\OT-7099A\\T7099AM1A.pdf';
  if (!fs.existsSync(samplePath)) {
    console.log('Sample file not found at path:', samplePath);
    return;
  }

  const pdfBytes = fs.readFileSync(samplePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: 'PLAN-1635',
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });

  const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);

  const { width, height } = firstPage.getSize();
  let rotation = firstPage.getRotation().angle;

  let visualWidth = (rotation === 90 || rotation === 270) ? height : width;
  let visualHeight = (rotation === 90 || rotation === 270) ? width : height;

  console.log(`Original raw page: width=${width}, height=${height}, rotation=${rotation}`);
  console.log(`Visual dimensions: visualWidth=${visualWidth}, visualHeight=${visualHeight}`);

  // Barcode dimensions
  const targetWidth = 110;
  const scaleFactor = targetWidth / barcodeImage.width;
  const targetHeight = barcodeImage.height * scaleFactor;

  // Position in Visual coordinates: Right side column, in the blank box below "TEMPORARY : MAN RESULT MONITORING"
  // Margin from right edge: 25 points
  // Margin from top edge: 140 points (to land inside the white box shown in user's image)
  const Vx = visualWidth - targetWidth - 25;
  const Vy = visualHeight - targetHeight - 140;

  console.log(`Visual target barcode pos: Vx=${Vx}, Vy=${Vy}, targetWidth=${targetWidth}, targetHeight=${targetHeight}`);

  // Transform to Raw coordinates based on rotation
  let Rx, Ry, drawRotate;
  if (rotation === 0) {
    Rx = Vx; Ry = Vy; drawRotate = 0;
  } else if (rotation === 90) {
    Rx = width - Vy - targetHeight; Ry = Vx; drawRotate = 90;
  } else if (rotation === 180) {
    Rx = width - Vx - targetWidth; Ry = height - Vy - targetHeight; drawRotate = 180;
  } else if (rotation === 270) {
    Rx = Vy; Ry = height - Vx - targetWidth; drawRotate = 270;
  }

  console.log(`Raw target barcode pos: Rx=${Rx}, Ry=${Ry}, drawRotate=${drawRotate}`);

  firstPage.drawImage(barcodeImage, {
    x: Rx,
    y: Ry,
    width: targetWidth,
    height: targetHeight,
    rotate: degrees(drawRotate)
  });

  const modifiedPdf = await pdfDoc.save();
  const outputPath = path.join(__dirname, 'test_stamped_drawing.pdf');
  fs.writeFileSync(outputPath, modifiedPdf);
  console.log(`Saved test stamped PDF to: ${outputPath} (${modifiedPdf.length} bytes)`);
}

testBoxStamp();
