const fs = require('fs');

function fixFrontend() {
  const files = [
    'src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts',
    'src/app/pages/purchase/detail/detail.component.ts'
  ];

  files.forEach(file => {
    let c = fs.readFileSync(file, 'utf8');
    // We want to move row.SPEC = ''; row.ItemName = ''; inside if (!row.isMockTest)
    c = c.replace(/if \(!foundLocal\) \{ row\.SPEC = ''; row\.ItemName = ''; if \(!row\.isMockTest\) \{/g,
      "if (!foundLocal) { if (!row.isMockTest) { row.SPEC = ''; row.ItemName = '';");
    fs.writeFileSync(file, c);
    console.log('Fixed', file);
  });
}

fixFrontend();
