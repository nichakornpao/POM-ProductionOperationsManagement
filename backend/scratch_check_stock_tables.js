const { poolPromise } = require('./src/config/database');
poolPromise.then(async pool => {
  try {
    const res1 = await pool.request().query("SELECT TOP 5 * FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]");
    console.log("PMA columns:", Object.keys(res1.recordset[0] || {}));
    console.log("PMA sample:", res1.recordset[0]);
  } catch (e) {
    console.error("PMA error:", e.message);
  }
  
  try {
    const res2 = await pool.request().query("SELECT TOP 5 * FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]");
    console.log("PH columns:", Object.keys(res2.recordset[0] || {}));
    console.log("PH sample:", res2.recordset[0]);
  } catch (e) {
    console.error("PH error:", e.message);
  }
  
  process.exit(0);
});
