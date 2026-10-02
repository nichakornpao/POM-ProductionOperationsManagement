const fs = require('fs');

let html = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', 'utf8');
html = html.replace(/<ng-select \[items\]="divisionList" bindLabel="label" bindValue="value" \[\(ngModel\)\]="Division_"[\s\S]*?\(change\)="onFilter\(\)"/, '<ng-select [items]="divisionList" bindLabel="label" bindValue="value" [(ngModel)]="Division_"\n          (change)="onDivisionChange()"');
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', html);
console.log('Fixed HTML');

let ts = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', 'utf8');
if (!ts.includes('onDivisionChange()')) {
  ts = ts.replace('toggleMockMode()', 'isLoading: boolean = false;\n\n  onDivisionChange() {\n    this.isLoading = true;\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n    }, 3000);\n  }\n\n  toggleMockMode()');
} else {
  ts = ts.replace(/onDivisionChange\(\) \{[\s\S]*?\}\s*toggleMockMode\(\)/, 'onDivisionChange() {\n    this.isLoading = true;\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n    }, 3000);\n  }\n\n  toggleMockMode()');
}
if (!ts.includes('isLoading: boolean = false;')) {
  ts = ts.replace('export class DetailCaseSetupComponent implements OnInit {', 'export class DetailCaseSetupComponent implements OnInit {\n  isLoading: boolean = false;');
}
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', ts);
console.log('Fixed TS');
