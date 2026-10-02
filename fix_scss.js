const fs = require('fs');
const path = require('path');
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.scss')) {
      let c = fs.readFileSync(p, 'utf8');
      if (c.includes("@import 'app/uiverse-loader.css';")) {
        fs.writeFileSync(p, c.replace(/@import 'app\/uiverse-loader\.css';\s*/g, ''));
        console.log('Fixed', p);
      }
    }
  });
}
walk('frontend/src/app');
