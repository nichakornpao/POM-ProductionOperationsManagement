const fs = require('fs');
const path = './src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /try\s*\{\s*const stockRequest = pool\.request\(\);\s*const itemNoListStr = itemNos\.map\(\(no, idx\) => \{\s*const paramName = \itemNo\$\{idx\}\;\s*stockRequest\.input\(paramName, sql\.NVarChar, no\);\s*return \@\$\{paramName\}\;\s*\}\)\.join\(\',\',\);\s*const stockResult = await stockRequest\.query\(\\s*SELECT ToolingName, SUM\(FreshQty\) as FreshQty\s*FROM \(\s*SELECT ToolingName, FreshQty FROM \[db_SmartCuttingTool_PMA\]\.\[viewer\]\.\[ToolingStockOnRack\] WHERE ToolingName IN \(\$\{itemNoListStr\}\)\s*UNION ALL\s*SELECT ToolingName, FreshQty FROM \[db_ToolingSmartRack\]\.\[viewer\]\.\[ToolingStockOnRack\] WHERE ToolingName IN \(\$\{itemNoListStr\}\)\s*\) S\s*GROUP BY ToolingName;\s*\\);/g;

const replacement = \	ry {
          // Optimize: Fetch all rows directly without IN clause to avoid compilation delay on 1500+ parameters
          const stockResult = await pool.request().query(\\\
            SELECT ToolingName, SUM(FreshQty) as FreshQty
            FROM (
              SELECT ToolingName, FreshQty FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
              UNION ALL
              SELECT ToolingName, FreshQty FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
            ) S
            GROUP BY ToolingName;
          \\\);\;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log('Replaced.');
