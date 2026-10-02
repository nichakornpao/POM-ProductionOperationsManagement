const fs = require('fs');

// Fix DetailComponent
let detailTs = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.ts', 'utf8');
if (!detailTs.includes('isLoading: boolean = false;')) {
  detailTs = detailTs.replace('export class DetailComponent implements OnInit, OnDestroy {', 'export class DetailComponent implements OnInit, OnDestroy {\n  isLoading: boolean = false;');
  fs.writeFileSync('frontend/src/app/pages/purchase/detail/detail.component.ts', detailTs);
  console.log('Fixed DetailComponent');
}

// Fix DetailCaseSetupComponent
let setupTs = fs.readFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', 'utf8');
if (!setupTs.includes('isLoading: boolean = false;')) {
  setupTs = setupTs.replace('export class DetailCaseSetupComponent implements OnInit {', 'export class DetailCaseSetupComponent implements OnInit {\n  isLoading: boolean = false;');
}
setupTs = setupTs.replace(/this\.cdr\.markForCheck\(\);/g, '');
fs.writeFileSync('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', setupTs);
console.log('Fixed DetailCaseSetupComponent');
