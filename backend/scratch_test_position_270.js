const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const bwipjs = require('bwip-js');

async function testStampPosition() {
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
  const rotation = firstPage.getRotation().angle;

  console.log(`Raw Page: width=${width}, height=${height}, rotation=${rotation}`);

  const visualWidth = (rotation === 90 || rotation === 270) ? height : width;
  const visualHeight = (rotation === 90 || rotation === 270) ? width : height;

  console.log(`Visual Page: visualWidth=${visualWidth}, visualHeight=${visualHeight}`);

  // Barcode target dimensions (in visual points)
  const targetWidth = 105;
  const scaleFactor = targetWidth / barcodeImage.width;
  const targetHeight = barcodeImage.height * scaleFactor;

  // Visual coordinates:
  // Right column: left margin ~ 140 points from right edge.
  // Visual X (Vx): center barcode in the 120pt wide column on right side
  // Right edge of visual page = visualWidth
  // Column is from (visualWidth - 145) to (visualWidth - 15).
  // Column width = 130. Barcode width = 105. Center = visualWidth - 145 + (130-105)/2 = visualWidth - 132.
  const Vx = visualWidth - 135;

  // Visual Y (Vy): inside the white box below "TEMPORARY : MAN RESULT MONITORING"
  // Top of drawing = visualHeight
  // Top text "TEMPORARY..." is around visualHeight - 325.
  // Box spans from visualHeight - 330 (top of box) to visualHeight - 455 (bottom of box).
  // Height of box = 125. Barcode height = targetHeight (~35).
  // Placing barcode inside box: top of barcode at visualHeight - 345, so Vy = (visualHeight - 345) - targetHeight
  // Or Vy = visualHeight - 345 - targetHeight;
  const Vy = visualHeight - 340 - targetHeight;

  console.log(`Visual Pos: Vx=${Vx}, Vy=${Vy}, targetW=${targetWidth}, targetH=${targetHeight}`);

  let Rx, Ry, drawRotate;
  if (rotation === 0) {
    Rx = Vx;
    Ry = Vy;
    drawRotate = 0;
  } else if (rotation === 90) {
    Rx = width - Vy - targetHeight;
    Ry = Vx;
    drawRotate = 90;
  } else if (rotation === 180) {
    Rx = width - Vx - targetWidth;
    Ry = height - Vy - targetHeight;
    drawRotate = 180;
  } else if (rotation === 270) {
    Rx = Vy;
    Ry = height - Vx - targetWidth;
    drawRotate = 270;
  }

  console.log(`Raw Pos: Rx=${Rx}, Ry=${Ry}, drawRotate=${drawRotate}`);

  firstPage.drawImage(barcodeImage, {
    x: Rx,
    y: Ry,
    width: targetWidth,
    height: targetHeight,
    rotate: degrees(drawRotate)
  });

  const outBuffer = await pdfDoc.save();
  const outFile = path.join(__dirname, 'test_output_dwg.pdf');
  fs.writeFileSync(outFile, outBuffer);
  console.log(`Saved test output to ${outFile} (${outBuffer.length} bytes)`);
}

testStampPosition();
