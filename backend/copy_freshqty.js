const sql = require('mssql');
require('dotenv').config({ path: 'd:/focastttt/ProductionOperationsManagement/ProductionOperationsManagement/backend/.env' });
const pbgm8gConfig = {
  user: process.env.DB_USER_APP || 'Cost_Team',
  password: process.env.DB_PASSWORD || 'Cost@User1',
  server: 'pbgm8g',
  database: 'RequestindirrecMaterial',
  options: { trustServerCertificate: true, encrypt: false }
};
const pbp155Config = {
  user: process.env.DB_USER_APP,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { trustServerCertificate: true, encrypt: false }
};

(async () => {
  try {
    const pool155 = await sql.connect(pbp155Config);
    const stockResult = await pool155.request().query(`
      SELECT ToolingName, SUM(FreshQty) as FreshQty
      FROM (
        SELECT ToolingName, FreshQty FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
        UNION ALL
        SELECT ToolingName, FreshQty FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] WITH (NOLOCK)
      ) S
      GROUP BY ToolingName
    `);
    const stockMap = {};
    stockResult.recordset.forEach(s => stockMap[s.ToolingName] = s.FreshQty);
    await pool155.close();

    const pool8g = await sql.connect(pbgm8gConfig);
    const mockItems = await pool8g.request().query('SELECT DISTINCT ItemNo FROM [dbo].[TestPurchaseRequestList]');
    
    for (let r of mockItems.recordset) {
      if (stockMap[r.ItemNo]) {
        await pool8g.request()
          .input('item', sql.NVarChar, r.ItemNo)
          .input('qty', sql.Int, stockMap[r.ItemNo])
          .query('UPDATE [dbo].[TestPurchaseRequestList] SET FreshQty = @qty WHERE ItemNo = @item');
      }
    }
    console.log('Copied FreshQty to PBGM8G Mock DB successfully');
    await pool8g.close();
  } catch(e) { console.log(e.message); }
  process.exit();
})();
