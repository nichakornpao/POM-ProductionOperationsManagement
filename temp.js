const fs = require('fs');
const content = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.ts', 'utf8');
const lines = content.split('\n');
const matchLineIndex = lines.findIndex(l => l.includes('executeStatusUpdate'));
if (matchLineIndex !== -1) {
    console.log(lines.slice(matchLineIndex - 5, matchLineIndex + 10).join('\n'));
} else {
    console.log('Not found');
}
