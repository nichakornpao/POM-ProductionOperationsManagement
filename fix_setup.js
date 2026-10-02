const fs = require('fs');

// Fix HTML for detailcasesetup
let html = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', 'utf8');
html = html.replace(/<ng-select \[items\]="divisionList" bindLabel="label" bindValue="value" \[\(ngModel\)\]="Division_"[\s\S]*?\(change\)="onFilter\(\)"/, '<ng-select [items]="divisionList" bindLabel="label" bindValue="value" [(ngModel)]="Division_"\n          (change)="onDivisionChange()"');
if (!html.includes('loader-container')) {
  html = html.replace(/<div class="table-responsive">/, '<div class="loader-container" *ngIf="isLoading">\n    <div class="loader"></div>\n  </div>\n\n  <div class="table-responsive" *ngIf="!isLoading">');
}
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', html);
console.log('detailcasesetup HTML fixed');

// Fix TS for detailcasesetup
let ts = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', 'utf8');
if (!ts.includes('onDivisionChange()')) {
  ts = ts.replace('toggleMockMode()', 'onDivisionChange() {\n    this.isLoading = true;\n    this.cdr.markForCheck();\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n      this.cdr.markForCheck();\n    }, 3000);\n  }\n\n  toggleMockMode()');
}
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', ts);
console.log('detailcasesetup TS fixed');
