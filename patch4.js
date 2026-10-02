const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'src', 'controllers', 'PurchaseHistory.controller.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Find the end of Update_History_Fields where it sends res.json({ success: true... })
content = content.replace(
  /return res\.json\(\{ success: true, message: "Update successful" \}\);/g,
  'historyCacheData = null; // Invalidate cache\n      return res.json({ success: true, message: "Update successful" });'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
