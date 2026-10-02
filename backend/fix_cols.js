const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'controllers', 'DetailPurchaseRequestlist.controller.js');
let code = fs.readFileSync(file, 'utf8');

// Fix 1: ISNULL(STOCK_ON_HAND, 0) AS STOCK_ON_HAND -> ISNULL(ON_HAND, 0) AS ON_HAND
code = code.replace(/ISNULL\(STOCK_ON_HAND, 0\) AS STOCK_ON_HAND/g, 'ISNULL(ON_HAND, 0) AS ON_HAND');

// Fix 2: Number(r.STOCK_ON_HAND) <= 0 -> Number(r.ON_HAND) <= 0
code = code.replace(/Number\(r\.STOCK_ON_HAND\) <= 0/g, 'Number(r.ON_HAND) <= 0');

// Fix 3: Stock_Location, MatLot, MFGOrderNo, MC6Digit -> MatLot, MFGOrderNo, MCNo6Digit
code = code.replace(/Stock_Location, MatLot, MFGOrderNo, MC6Digit/g, 'MatLot, MFGOrderNo, MCNo6Digit');

// Fix 4: req.STOCK_ON_HAND -> req.ON_HAND in mappedData
code = code.replace(/"ON_HAND": req\.STOCK_ON_HAND \|\| 0,/g, '"ON_HAND": req.ON_HAND || 0,');

// Fix 5: req.Stock_Location || "" -> "" in mappedData
code = code.replace(/"StockLocation": req\.Stock_Location \|\| "",/g, '"StockLocation": "",');

// Fix 6: req.MC6Digit || "" -> req.MCNo6Digit || "" in mappedData
code = code.replace(/"MCNo6Digit": req\.MC6Digit \|\| "",/g, '"MCNo6Digit": req.MCNo6Digit || "",');

fs.writeFileSync(file, code, 'utf8');
console.log('Fixed DB column names in patch!');
