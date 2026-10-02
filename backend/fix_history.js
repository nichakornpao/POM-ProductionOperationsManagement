const fs = require('fs');

function fixHistory() {
  let c = fs.readFileSync('src/controllers/PurchaseHistory.controller.js', 'utf8');
  c = c.replace(/C\.AS400STATUS,\s*'' AS Stock_Location,/g, "C.AS400STATUS,\n              ISNULL(C.MAIN_LOCATION, '') AS Stock_Location,");
  fs.writeFileSync('src/controllers/PurchaseHistory.controller.js', c);
  console.log('Fixed History');
}

fixHistory();
