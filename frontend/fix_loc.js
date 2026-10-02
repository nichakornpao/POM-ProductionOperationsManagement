const fs = require('fs');

function fixFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(/if \(!row\.isMockTest\) \{ row\.STOCK_ON_HAND = 0; row\.ON_HAND = 0; \}\s*row\.MAIN_LOCATION = '';\s*row\.MAIN_LOCATION_Name = '';/g, 
    "if (!row.isMockTest) { row.STOCK_ON_HAND = 0; row.ON_HAND = 0; row.MAIN_LOCATION = ''; row.MAIN_LOCATION_Name = ''; }");
  fs.writeFileSync(filePath, c);
  console.log('Fixed', filePath);
}

fixFile('src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts');
fixFile('src/app/pages/purchase/detail/detail.component.ts');
