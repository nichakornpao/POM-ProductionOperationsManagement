const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'app', 'pages', 'purchase', 'history-request', 'history-request.component.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace getEffectiveDocNo usage
content = content.replace(
  /DocNo: existing \? existing\.DocNo : this\.getEffectiveDocNo\(item\),/g,
  "DocNo: existing ? existing.DocNo : (item.DocNo || ''),"
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('File patched successfully');
