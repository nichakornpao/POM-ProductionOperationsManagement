const fs = require('fs');
let html = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', 'utf8');
html = html.replace(/<ng-select \[items\]="divisionList" bindLabel="label" bindValue="value" \[\(ngModel\)\]="Division_"[\s\S]*?\(change\)="onFilter\(\)"/, '<ng-select [items]="divisionList" bindLabel="label" bindValue="value" [(ngModel)]="Division_"\n          (change)="onDivisionChange()"');
fs.writeFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', html);
console.log('Fixed detail HTML');
