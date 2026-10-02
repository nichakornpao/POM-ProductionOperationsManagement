require('dotenv').config();
const { poolPromise } = require('./src/config/database');
async function run() {
  const pool = await poolPromise;
  const count1 = await pool.request().query("SELECT COUNT(*) as cnt FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]");
  const count2 = await pool.request().query("SELECT COUNT(*) as cnt FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]");
  console.log('Count1:', count1.recordset[0].cnt);
  console.log('Count2:', count2.recordset[0].cnt);
  process.exit(0);
}
run();
