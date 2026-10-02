const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'app', 'pages', 'purchase', 'history-request', 'history-request.component.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace QTY || 0 with Math.abs logic
content = content.replace(
  /"Quantity": req\.QTY \|\| 0,/g,
  '"Quantity": req.QTY ? Math.abs(req.QTY) : 0,'
);

// Replace transYear, transMonth, transDay with d.getFullYear() etc
content = content.replace(
  /"TransactionYear": transYear,/g,
  '"TransactionYear": d.getFullYear().toString(),'
);
content = content.replace(
  /"TransactionMonth": transMonth,/g,
  '"TransactionMonth": (d.getMonth() + 1).toString().padStart(2, \'0\'),'
);
content = content.replace(
  /"TransactionDay": transDay,/g,
  '"TransactionDay": d.getDate().toString().padStart(2, \'0\'),'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
