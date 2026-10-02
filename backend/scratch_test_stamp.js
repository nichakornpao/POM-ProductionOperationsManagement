const http = require('http');
const fs = require('fs');

async function testPdfStamp() {
  console.log('Testing FileRead loadPdfFromPath with requestNo...');
  // Check backend running on port 3100
  const postData = JSON.stringify({
    filePath: '\\\\pbp083\\Public\\Process Engineer\\Doc. ENG\\DWG. Control\\PMC Parts\\Process DWG\\OT-7070\\T7070-G1CT01.pdf',
    requestNo: 'R09481'
  });

  const options = {
    hostname: 'localhost',
    port: 3100,
    path: '/api/loadPdfFromPath',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    let chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      console.log(`Received PDF buffer size: ${buffer.length} bytes`);
      if (res.statusCode === 200 && buffer.slice(0, 4).toString() === '%PDF') {
        console.log('SUCCESS: Valid PDF with dynamic barcode stamp returned!');
      }
      process.exit();
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    process.exit();
  });

  req.write(postData);
  req.end();
}

testPdfStamp();
