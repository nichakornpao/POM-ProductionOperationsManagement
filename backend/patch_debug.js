const fs = require('fs');
const path = './src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

const oldMock = \      const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
      const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);\;

const newMock = \      const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
      const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);
      console.log('[DEBUG] poolIndirrec is null?', poolIndirrec === null);\;

content = content.replace(oldMock, newMock);
fs.writeFileSync(path, content, 'utf8');
