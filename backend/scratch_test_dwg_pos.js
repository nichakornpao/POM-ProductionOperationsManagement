const fs = require('fs');
const path = require('path');
const { poolPromise } = require('./src/config/database');
const { PDFDocument, degrees } = require('pdf-lib');
const bwipjs = require('bwip-js');

async function testDwgStamp() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT TOP 5 Path_Dwg, PartNo FROM master.tb_PC_Plan WHERE Path_Dwg IS NOT NULL AND Path_Dwg != '-'
    `);
    console.log('Sample Drawing Paths:', res.recordset);

    if (res.recordset.length > 0) {
      const samplePath = res.recordset[0].Path_Dwg.replace(/^["']|["']$/g, '');
      console.log('Testing with sample path:', samplePath);

      if (fs.existsSync(samplePath)) {
        let pdfBytes = fs.readFileSync(samplePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        console.log(`Page dimensions: width=${width}, height=${height}, rotation=${firstPage.getRotation().angle}`);
      } else {
        console.log('File does not exist directly, checking local files...');
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

testDwgStamp();
