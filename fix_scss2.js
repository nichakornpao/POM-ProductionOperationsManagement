const fs = require('fs');
const files = [
  'frontend/src/app/components/sidebar/sidebar.component.scss',
  'frontend/src/app/pages/purchase/detail/detail.component.scss',
  'frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.scss',
  'frontend/src/app/pages/purchase/history-request/history-request.component.scss',
  'frontend/src/app/pages/purchase/returnlist/returnlist.component.scss'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace("@import 'app/uiverse-loader.css';", "");
    fs.writeFileSync(f, c);
    console.log('Fixed', f);
  }
});
