const fs = require('fs');

let html = fs.readFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', 'utf8');

// 1. Swap back the rows
const filterRowRegex = /<!-- Filters Row -->\s*<tr class="filter-row">[\s\S]*?<\/tr>\s*/g;
const headerRowRegex = /<!-- Headers Row -->\s*<tr class="header-row">[\s\S]*?<\/tr>\s*/g;

let filterRowMatch = html.match(/<!-- Filters Row -->\s*<tr class="filter-row">[\s\S]*?<\/tr>\s*/)[0];
let headerRowMatch = html.match(/<!-- Headers Row -->\s*<tr class="header-row">[\s\S]*?<\/tr>\s*/)[0];

html = html.replace(headerRowMatch, '%%HEADER_ROW%%');
html = html.replace(filterRowMatch, '%%FILTER_ROW%%');

html = html.replace('%%HEADER_ROW%%', filterRowMatch);
html = html.replace('%%FILTER_ROW%%', headerRowMatch);

// 2. Change table-responsive back to table-container
html = html.replace('<div class="table-responsive" *ngIf="!isLoading">', '<div class="table-container" *ngIf="!isLoading">');

fs.writeFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', html);
console.log('Restored layout');
