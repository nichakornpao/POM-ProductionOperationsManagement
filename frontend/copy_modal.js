const fs = require('fs');

const planListHtmlPath = 'd:/focastttt/ProductionOperationsManagement/ProductionOperationsManagement/frontend/src/app/pages/PC/PlanList/PlanList.component.html';
const targetHtmlPath = 'd:/focastttt/ProductionOperationsManagement/ProductionOperationsManagement/frontend/src/app/pages/EN/engineer-history/engineer-history.component.html';

const planListHtml = fs.readFileSync(planListHtmlPath, 'utf8');
const targetHtml = fs.readFileSync(targetHtmlPath, 'utf8');

const startIndex = planListHtml.indexOf('<!-- ===== Tooling Request Details Modal (PD Tab) ===== -->');
const endIndex = planListHtml.indexOf('<!-- Print Modal -->');

if (startIndex !== -1 && endIndex !== -1) {
    const modalHtml = planListHtml.substring(startIndex, endIndex);
    
    // Check if it already exists
    if (targetHtml.indexOf('<!-- ===== Tooling Request Details Modal (PD Tab) ===== -->') === -1) {
        fs.writeFileSync(targetHtmlPath, targetHtml + '\n\n' + modalHtml, 'utf8');
        console.log('Successfully appended modal HTML!');
    } else {
        console.log('Modal already exists in target HTML.');
    }
} else {
    console.log('Could not find modal HTML bounds.');
}
