const fs = require('fs');

// 1. Remove loader HTML
let html = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', 'utf8');
html = html.replace(/<div class="loader-container" \*ngIf="isLoading">\s*<div class="loader"><\/div>\s*<\/div>\s*<div class="table-responsive" \*ngIf="!isLoading">/g, '<div class="table-responsive">');
html = html.replace(/\(change\)="onDivisionChange\(\)"/g, '(change)="onFilter()"');
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html', html);
console.log('Fixed detailcasesetup HTML');

// 2. Remove loader TS
let ts = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', 'utf8');
ts = ts.replace(/isLoading: boolean = false;\s*/g, '');
ts = ts.replace(/onDivisionChange\(\) \{[\s\S]*?\}\s*toggleMockMode\(\)/, 'toggleMockMode()');
ts = ts.replace(/toggleMockMode\(\) \{ this\.isMockMode = !this\.isMockMode; this\.isLoading = true; setTimeout\(\(\) => \{ this\.onFilter\(\); this\.isLoading = false; \}, 3000\); \}/, 'toggleMockMode() { this.isMockMode = !this.isMockMode; this.onFilter(); }');
ts = ts.replace(/this\.isLoading = true;\s*/g, '');
ts = ts.replace(/setTimeout\(\(\) => \{ this\.isLoading = false; \}, 3000\);\s*/g, '');
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', ts);
console.log('Fixed detailcasesetup TS');
