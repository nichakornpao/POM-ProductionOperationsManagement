const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query("SELECT COUNT(*) as c FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-%'");
  console.log('Mock PurchaseRequestlist count:', res.recordset[0].c);
  process.exit(0);
}
run();
