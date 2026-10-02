const fs = require('fs');

let html = fs.readFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', 'utf8');

// The filter row is currently before the header row.
// We need to swap them.
const filterRowRegex = /<!-- Filters Row -->\s*<tr class="filter-row">[\s\S]*?<\/tr>\s*<!-- Headers Row -->/g;
const headerRowRegex = /<!-- Headers Row -->\s*<tr class="header-row">[\s\S]*?<\/tr>\s*<\/thead>/g;

let filterRowMatch = html.match(/<!-- Filters Row -->\s*<tr class="filter-row">[\s\S]*?<\/tr>/)[0];
let headerRowMatch = html.match(/<!-- Headers Row -->\s*<tr class="header-row">[\s\S]*?<\/tr>/)[0];

html = html.replace(filterRowMatch, '%%FILTER_ROW%%');
html = html.replace(headerRowMatch, '%%HEADER_ROW%%');

html = html.replace('%%FILTER_ROW%%', headerRowMatch);
html = html.replace('%%HEADER_ROW%%', filterRowMatch);

fs.writeFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', html);
console.log('Fixed history request layout');
