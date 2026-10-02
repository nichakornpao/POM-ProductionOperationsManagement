const fs = require('fs');
let html = fs.readFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', 'utf8');
html = html.replace('[(ngModel)]="Division_" (change)="onFilter()"', '[(ngModel)]="Division_" (change)="onDivisionChange()"');
fs.writeFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', html);
console.log('Fixed');
