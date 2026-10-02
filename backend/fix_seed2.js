const fs = require('fs');

function fixSeed(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  
  // Fix column list for Case Setup
  c = c.replace(/DocNo, MatLot,/, 'DocNo, MAIN_LOCATION, MatLot,');
  
  // Fix data for Case Setup
  // It was previously replaced to 'INVCS${i}260828', 'LOT-CS${i}',
  c = c.replace(/'INVCS\$\{i\}260828', 'LOT-CS\$\{i\}',/g, "'INVCS${i}260828', 'RACK-B${i}', 'LOT-CS${i}',");

  // Fix the SQL Query in DetailPurchaseRequestlist.controller.js to SELECT MAIN_LOCATION for CaseSetup!
  let c2 = fs.readFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', 'utf8');
  c2 = c2.replace(/ISNULL\(T\.MatLot, ''\) AS MatLot,/, "ISNULL(T.MAIN_LOCATION, '') AS MAIN_LOCATION,\n              ISNULL(T.MatLot, '') AS MatLot,");
  fs.writeFileSync('src/controllers/DetailPurchaseRequestlist.controller.js', c2);

  fs.writeFileSync(filePath, c);
  console.log('Fixed', filePath);
}

fixSeed('seed_robust.js');
