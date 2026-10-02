require('dotenv').config();
const { poolPromise } = require('./src/config/database');
async function run() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    WITH AllStock AS (
      SELECT ToolingName, SUM(FreshQty) as FreshQty FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] WITH (NOLOCK) GROUP BY ToolingName
      UNION ALL
      SELECT ToolingName, SUM(FreshQty) as FreshQty FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] WITH (NOLOCK) GROUP BY ToolingName
    ),
    BaseStock AS (
      SELECT 
        ToolingName,
        SUM(FreshQty) as TotalQty,
        LEFT(ToolingName, LEN(ToolingName) - 1) as BaseName
      FROM AllStock
      WHERE LEN(ToolingName) > 5 AND RIGHT(ToolingName, 1) IN ('A', 'N', 'C', 'R', 'S')
      GROUP BY ToolingName
    )
    SELECT * FROM BaseStock
  `);
  
  const records = result.recordset;
  const groups = {};
  for (const r of records) {
    if (!groups[r.BaseName]) groups[r.BaseName] = [];
    groups[r.BaseName].push(r);
  }
  
  const targetPairs = [];
  for (const base in groups) {
    const items = groups[base];
    if (items.length > 1) {
      const withStock = items.find(i => i.TotalQty > 0);
      const withoutStock = items.find(i => i.TotalQty == 0);
      if (withStock && withoutStock && withStock.ToolingName !== withoutStock.ToolingName) {
        targetPairs.push({ zeroStock: withoutStock.ToolingName, hasStock: withStock.ToolingName });
      }
    }
  }
  
  console.log('Pairs found:', targetPairs);
  
  if (targetPairs.length > 0) {
    const fs = require('fs');
    fs.writeFileSync('mock-pairs.json', JSON.stringify(targetPairs.slice(0, 10)));
  }
  process.exit(0);
}
run();
