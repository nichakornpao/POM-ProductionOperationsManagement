const fs = require('fs');
let css = fs.readFileSync('frontend/src/app/uiverse-loader.css', 'utf8');
let styles = fs.readFileSync('frontend/src/styles.scss', 'utf8');
styles = styles.replace("@import 'app/uiverse-loader.css';", "");
styles = styles.replace("@import './app/uiverse-loader.css';", "");
fs.writeFileSync('frontend/src/styles.scss', styles + '\n' + css);
fs.unlinkSync('frontend/src/app/uiverse-loader.css');
console.log('Merged successfully');
