const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'app', 'pages', 'purchase', 'history-request', 'history-request.component.ts');
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  `        return Object.assign({}, (() => {
          const finalDocNo = req.DocNo || "";
          let transYear = d.getFullYear().toString();
          let transMonth = (d.getMonth() + 1).toString().padStart(2, '0');
          let transDay = d.getDate().toString().padStart(2, '0');
  
          if (finalDocNo.length >= 6) {
            const lastSix = finalDocNo.slice(-6);
            if (/^\\d{6}$/.test(lastSix)) {
              transYear = '20' + lastSix.substring(0, 2);
              transMonth = lastSix.substring(2, 4);
              transDay = lastSix.substring(4, 6);
            }
          }
  
          return {
            "ItemNo": req.ItemNo || "",
            "ItemRevision": "",
            "Quantity": req.QTY || 0,
            "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
            "DOCNo": finalDocNo,
            "TransactionYear": transYear,
            "TransactionMonth": transMonth,
            "TransactionDay": transDay,`,
  `        return Object.assign({}, (() => {
          const finalDocNo = req.DocNo || "";
  
          return {
            "ItemNo": req.ItemNo || "",
            "ItemRevision": "",
            "Quantity": req.QTY ? Math.abs(req.QTY) : 0,
            "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
            "DOCNo": finalDocNo,
            "TransactionYear": d.getFullYear().toString(),
            "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
            "TransactionDay": d.getDate().toString().padStart(2, '0'),`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
