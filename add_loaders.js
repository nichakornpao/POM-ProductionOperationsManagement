const fs = require('fs');

const filesToPatch = [
  {
    ts: 'frontend/src/app/pages/purchase/history-request/history-request.component.ts',
    html: 'frontend/src/app/pages/purchase/history-request/history-request.component.html',
    apiCall: 'this.purchasehistory.Purchase_History().subscribe({',
    tableTarget: '<div class="table-responsive"'
  },
  {
    ts: 'frontend/src/app/pages/purchase/detail/detail.component.ts',
    html: 'frontend/src/app/pages/purchase/detail/detail.component.html',
    apiCall: 'this.detailService.Detail_Purchase().subscribe({',
    tableTarget: '<div class="table-responsive"'
  },
  {
    html: 'frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.html',
    tableTarget: '<div class="table-responsive"'
  }
];

filesToPatch.forEach(file => {
  // Patch HTML
  if (file.html && fs.existsSync(file.html)) {
    let content = fs.readFileSync(file.html, 'utf8');
    if (!content.includes('uiverse-loader')) {
      const targetStr = file.tableTarget;
      const loaderHtml = `
  <!-- Loading UI -->
  <div class="uiverse-loader-container" *ngIf="isLoading">
    <div class="uiverse-loader"></div>
  </div>\n\n  `;
      
      const newDivTag = targetStr + ` *ngIf="!isLoading"`;
      
      // We only want to modify the main table wrapper, which usually has *ngIf already
      // Let's use a regex to inject !isLoading into existing *ngIf or add it.
      
      content = content.replace(/<div class="table-responsive" \*ngIf="([^"]+)">/g, `<div class="table-responsive" *ngIf="$1 && !isLoading">`);
      content = content.replace(/<div class="table-responsive">/g, `<div class="table-responsive" *ngIf="!isLoading">`);
      
      content = content.replace(/<div class="table-responsive"/, loaderHtml + `<div class="table-responsive"`);
      
      fs.writeFileSync(file.html, content);
      console.log(`Patched ${file.html}`);
    }
  }

  // Patch TS
  if (file.ts && fs.existsSync(file.ts)) {
    let content = fs.readFileSync(file.ts, 'utf8');
    let changed = false;
    
    if (!content.includes('isLoading: boolean = false;')) {
      content = content.replace('export class ', 'export class '); // Just a marker
      content = content.replace(/(export class \w+ implements OnInit \{)/, `$1\n  isLoading: boolean = false;`);
      changed = true;
    }
    
    if (file.apiCall) {
      if (content.includes(file.apiCall)) {
        content = content.replace(file.apiCall, `this.isLoading = true;\n    ${file.apiCall}`);
        
        // Find next: (response
        content = content.replace(/(next:\s*\([^)]*\)\s*=>\s*\{)/g, `$1\n          this.isLoading = false;`);
        // Find error: 
        content = content.replace(/(error:\s*\([^)]*\)\s*=>\s*\{?)/g, `$1\n          this.isLoading = false;`);
        changed = true;
      }
    }
    
    if (changed) {
      fs.writeFileSync(file.ts, content);
      console.log(`Patched ${file.ts}`);
    }
  }
});
console.log('Done!');
