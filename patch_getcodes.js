const fs = require('fs');
const path = './frontend/src/app/pages/purchase/detail/detail.component.ts';
let content = fs.readFileSync(path, 'utf8');

const target = \
    const originalItemNo = String(item.Req_ItemNo || '').trim().toUpperCase();
    available = available.filter(x => {
      const xItemNo = String(x.ItemNo).trim().toUpperCase();
      const hasStock = Number(x.ON_HAND || 0) > 0;
      const isOriginal = (xItemNo === originalItemNo);
      return hasStock || isOriginal;
    });\;

const repl = \
    // We now allow ALL alternatives regardless of stock > 0, as per user request
    const originalItemNo = String(item.Req_ItemNo || '').trim().toUpperCase();\;

content = content.replace(target, repl);
fs.writeFileSync(path, content, 'utf8');
