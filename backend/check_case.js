const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query('SELECT TOP 5 [CASE] FROM [dbo].[TestCaseSetupList] WHERE STOCK_ON_HAND = 0');
  console.log('Old CASE values:', res.recordset.map(r => r.CASE).join(', '));
  process.exit(0);
}
run();
