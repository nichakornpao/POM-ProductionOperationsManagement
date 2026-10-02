const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'src', 'controllers', 'PurchaseHistory.controller.js');
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  /if \(mockResult\.rowsAffected\[0\] > 0\) \{\s*return res\.json\(\{ success: true, message: "Mock data updated successfully" \}\);\s*\}/,
  `if (mockResult.rowsAffected[0] > 0) {
        historyCacheData = null; // Invalidate cache
        return res.json({ success: true, message: "Mock data updated successfully" });
      }`
);

content = content.replace(
  /if \(result\.rowsAffected\[0\] > 0\) \{\s*res\.json\(\{ success: true, message: "Updated successfully" \}\);\s*\}/,
  `if (result.rowsAffected[0] > 0) {
      historyCacheData = null; // Invalidate cache
      res.json({ success: true, message: "Updated successfully" });
    }`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
