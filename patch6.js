const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'app', 'pages', 'purchase', 'history-request', 'history-request.component.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace Math.abs logic back to original
content = content.replace(
  /"Quantity": req\.QTY \? Math\.abs\(req\.QTY\) : 0,/g,
  '"Quantity": req.QTY || 0,'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
