const fs = require('fs');

function fixFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(/if \(!foundLocal\) \{\s*row\.SPEC = '';\s*row\.ItemName = '';\s*row\.STOCK_ON_HAND = 0;\s*row\.ON_HAND = 0;/g, 
    "if (!foundLocal) { row.SPEC = ''; row.ItemName = ''; if (!row.isMockTest) { row.STOCK_ON_HAND = 0; row.ON_HAND = 0; }");
  fs.writeFileSync(filePath, c);
  console.log('Fixed', filePath);
}

fixFile('src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts');
fixFile('src/app/pages/purchase/detail/detail.component.ts');
