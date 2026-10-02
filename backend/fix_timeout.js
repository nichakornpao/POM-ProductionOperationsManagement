const fs = require('fs');

function fixTimeout() {
  let c = fs.readFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', 'utf8');
  c = c.replace(/5-second delay/g, "3-second delay");
  c = c.replace(/5000\);\s*\/\/\s*5\s*seconds\s*delay/g, "3000); // 3 seconds delay");
  fs.writeFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', c);
  console.log('Fixed Timeout');
}

fixTimeout();
