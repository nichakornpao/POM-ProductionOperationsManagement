const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query("SELECT TOP 5 Division FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-%'");
  console.log('Divisions:', res.recordset.map(r=>r.Division));
  process.exit(0);
}
run();
