const fs = require('fs');

function fixFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(/if \(!partNo \|\| !qty \|\| !mcType \|\| !mcNo \|\| !declaration\) \{[\s\S]*?validationLogs\.push\(\{ ItemNo: r\.ItemNo, Status: 'FAIL \(Missing required fields: partNo\/qty\/mcType\/mcNo\/declaration\)' \}\);\s*\}/, 
    "const mainLocation = (r.MAIN_LOCATION || '').trim();\n              if (!partNo || !qty || !mcType || !mcNo || !declaration || !mainLocation) {\n                invalidIds.push(r.Public_Id);\n                validationLogs.push({ ItemNo: r.ItemNo, Status: 'FAIL (Missing required fields: partNo/qty/mcType/mcNo/declaration/stk_loc)' });\n              }");
  fs.writeFileSync(filePath, c);
  console.log('Fixed', filePath);
}

fixFile('src/controllers/DetailPurchaseRequestlist.controller.js');
