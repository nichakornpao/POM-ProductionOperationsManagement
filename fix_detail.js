const fs = require('fs');

// Fix HTML
let html = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', 'utf8');
html = html.replace('[(ngModel)]="Division_" (change)="onFilter()"', '[(ngModel)]="Division_" (change)="onDivisionChange()"');
fs.writeFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', html);
console.log('HTML fixed');

// Fix TS
let ts = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.ts', 'utf8');
ts = ts.replace(/toggleMockMode\(\) \{[\s\S]*?this\.onFilter\(\);\s*\}/, 'toggleMockMode() {\n    this.isMockMode = !this.isMockMode;\n    this.isLoading = true;\n    this.cdr.markForCheck();\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n      this.cdr.markForCheck();\n    }, 3000);\n  }');
if (!ts.includes('onDivisionChange()')) {
  ts = ts.replace('toggleMockMode()', 'onDivisionChange() {\n    this.isLoading = true;\n    this.cdr.markForCheck();\n    setTimeout(() => {\n      this.onFilter();\n      this.isLoading = false;\n      this.cdr.markForCheck();\n    }, 3000);\n  }\n\n  toggleMockMode()');
}
fs.writeFileSync('frontend/src/app/pages/purchase/detail/detail.component.ts', ts);
console.log('TS fixed');
