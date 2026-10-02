const enSync = require('./src/controllers/EnSync.controller.js');
console.log('Triggering performSync...');
enSync.performSync().then(() => {
    console.log('Done!');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
