const fs = require('fs');

function fixSeed(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  
  // Fix rlItems.push
  c = c.replace(/'INVRL\$\{i\}260828', NULL, NULL,/g, "'INVRL${i}260828', 'RACK-A${i}', 'LOT-RL${i}',");
  
  // Fix csItems.push
  // csItems.push(`( '${csId}', '${div}', '${partNo}', 'SETUP-ITEM ${i}', '${itemNo}', 'MT-CS${i}', 'INVCS${i}260828', NULL, ...
  c = c.replace(/'INVCS\$\{i\}260828', NULL,/g, "'INVCS${i}260828', 'LOT-CS${i}',");

  fs.writeFileSync(filePath, c);
  console.log('Fixed', filePath);
}

fixSeed('seed_robust.js');
