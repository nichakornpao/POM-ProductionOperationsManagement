const { poolPromise } = require('./src/config/database');
async function run() {
  const pool = await poolPromise;
  const result = await pool.request().query("SELECT ItemNo, DueMonth, BalanceQty FROM [db_Cost_Data_Centralized].[master].[tb_MRP_POBalance_71DZ_2] WHERE ItemNo = 'P111006A'");
  console.log(result.recordset);
  process.exit(0);
}
run();
