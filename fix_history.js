const fs = require('fs');

// Fix history-request.component.ts
let ts = fs.readFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.ts', 'utf8');

// 1. Remove isLoading from loadPurchaseHistory
ts = ts.replace(/this\.isLoading\s*=\s*true;\s*this\.purchasehistory\.Purchase_History\(\)\.subscribe/g, 'this.purchasehistory.Purchase_History().subscribe');
ts = ts.replace(/setTimeout\(\(\) => \{ this\.isLoading = false; this\.cdr\.markForCheck\(\); \}, 3000\);/g, '');

// 2. Add onDivisionChange()
if (!ts.includes('onDivisionChange()')) {
  ts = ts.replace('clearFilters() {', 'onDivisionChange() {\n    this.isLoading = true;\n    this.cdr.markForCheck();\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n      this.cdr.markForCheck();\n    }, 3000);\n  }\n\n  clearFilters() {');
}

fs.writeFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.ts', ts);
console.log('TS updated');

// Fix history-request.component.html
let html = fs.readFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', 'utf8');
html = html.replace(/<ng-select \[items\]="divisionList" bindLabel="label" bindValue="value" \[\(ngModel\)\]="Division_"[\s\S]*?\(change\)="onFilter\(\)"/, '<ng-select [items]="divisionList" bindLabel="label" bindValue="value" [(ngModel)]="Division_"\n          (change)="onDivisionChange()"');
fs.writeFileSync('frontend/src/app/pages/purchase/history-request/history-request.component.html', html);
console.log('HTML updated');
