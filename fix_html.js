const fs = require('fs');

function insertLoaderBeforeElement(file, beforeTag) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('uiverse-loader')) {
      const loaderHtml = `
  <!-- Loading UI -->
  <div class="uiverse-loader-container" *ngIf="isLoading">
    <div class="uiverse-loader"></div>
  </div>\n\n  `;
      
      // Inject loader
      content = content.replace(beforeTag, loaderHtml + `<ng-container *ngIf="!isLoading">\n  ` + beforeTag);
      // Close the container at the end of the file or before the closing </div> of page-layout
      content = content.replace(/<\/div>\s*$/, `  </ng-container>\n</div>\n`);
      
      fs.writeFileSync(file, content);
      console.log(`Patched ${file}`);
    } else {
      console.log(`Already patched ${file}`);
    }
  }
}

insertLoaderBeforeElement('frontend/src/app/pages/purchase/history-request/history-request.component.html', '<div class="table-wrapper">');

// For detail.component.html, let's see if it has table-wrapper or table-responsive
if (fs.existsSync('frontend/src/app/pages/purchase/detail/detail.component.html')) {
  let content = fs.readFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', 'utf8');
  if (!content.includes('uiverse-loader')) {
    const loaderHtml = `
  <!-- Loading UI -->
  <div class="uiverse-loader-container" *ngIf="isLoading">
    <div class="uiverse-loader"></div>
  </div>\n\n  `;
    content = content.replace(/<div class="table-wrapper">/, loaderHtml + `<div class="table-wrapper" *ngIf="!isLoading">`);
    content = content.replace(/<div class="table-responsive">/, loaderHtml + `<div class="table-responsive" *ngIf="!isLoading">`);
    fs.writeFileSync('frontend/src/app/pages/purchase/detail/detail.component.html', content);
    console.log(`Patched detail.component.html`);
  } else {
    console.log(`Already patched detail`);
  }
}
