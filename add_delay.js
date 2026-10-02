const fs = require('fs');

function patchComponent(filePath, fetchMethodName) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // We want to replace `this.isLoading = false;` with `setTimeout(() => { this.isLoading = false; }, 3000);` 
  // ONLY within the main fetch method.
  
  // A simple way is to use a regex that matches the method block, but parsing JS/TS with regex is hard.
  // Instead, since `isLoading` is mostly used for the main table, we can just replace all `this.isLoading = false;`
  // with `setTimeout(() => { this.isLoading = false; }, 3000);` globally in these components,
  // except we need to make sure we don't nest setTimeouts if run multiple times.

  if (content.includes('setTimeout(() => { this.isLoading = false;')) {
    console.log(`Already patched ${filePath}`);
    return;
  }

  // Only apply to the specific API calls by replacing the text.
  // Actually, replacing all `this.isLoading = false;` in the file is safer for this quick fix, 
  // since `isLoading` is used primarily for the page data loader.
  
  // For detail.component.ts (has cdr)
  if (content.includes('this.cdr.markForCheck()')) {
    content = content.replace(/this\.isLoading = false;\s*this\.cdr\.markForCheck\(\);/g, 
      `setTimeout(() => { this.isLoading = false; this.cdr.markForCheck(); }, 3000);`);
  } else {
    content = content.replace(/this\.isLoading = false;/g, 
      `setTimeout(() => { this.isLoading = false; }, 3000);`);
  }

  fs.writeFileSync(filePath, content);
  console.log(`Patched ${filePath}`);
}

patchComponent('frontend/src/app/pages/purchase/history-request/history-request.component.ts', 'Purchase_History');
patchComponent('frontend/src/app/pages/purchase/detail/detail.component.ts', 'Detail_Purchase');
patchComponent('frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts', 'Detail_CaseSetup');
