const fs = require('fs');
const pathFrontend = 'd:/focastttt/ProductionOperationsManagement/ProductionOperationsManagement/frontend/src/app/pages/PC/PlanList/PlanList.component.ts';
const pathBackend = 'd:/focastttt/ProductionOperationsManagement/ProductionOperationsManagement/backend/src/controllers/EnSync.controller.js';

let contentFrontend = fs.readFileSync(pathFrontend, 'utf8');
contentFrontend = contentFrontend.replace(
    "this.editData.drawingSource = row.drawingSource || 'manual';",
    "this.editData.drawingSource = row.drawingSource || (this.editData.pathDwg ? 'auto' : 'manual');"
);
contentFrontend = contentFrontend.replace(
    "this.editData.layoutSource = row.layoutSource || 'manual';",
    "this.editData.layoutSource = row.layoutSource || (this.editData.pathLayout ? 'auto' : 'manual');"
);
fs.writeFileSync(pathFrontend, contentFrontend);
console.log('Frontend updated');

let contentBackend = fs.readFileSync(pathBackend, 'utf8');
contentBackend = contentBackend.replace(
    /autoMapSql \+= `UPDATE \[master\]\.\[tb_PC_Plan\] SET Path_Dwg = '\$\{safeDwg\}', Path_Layout = '\$\{safeLayout\}' WHERE PartNo = '\$\{searchKey\.replace\(\/\\'\/\g, "''"\)\}';\\n`;/,
    "autoMapSql += `UPDATE [master].[tb_PC_Plan] SET Path_Dwg = '${safeDwg}', Path_Layout = '${safeLayout}', Path_Dwg_Source = 'auto', Path_Layout_Source = 'auto' WHERE PartNo = '${searchKey.replace(/'/g, \"''\")}';\\n`;"
);
fs.writeFileSync(pathBackend, contentBackend);
console.log('Backend updated');
