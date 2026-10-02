const { poolRequestIndirrecPromise } = require('./src/config/database');
async function test() {
  try {
    const pool = await poolRequestIndirrecPromise;
    const res1 = await pool.request().query("SELECT COUNT(*) as count FROM [dbo].[TestPurchaseRequestList] WHERE Status IN ('Waiting', 'Hold', 'In Progress')");
    let res2 = { recordset: [{ count: -1 }] };
    try {
      res2 = await pool.request().query("SELECT COUNT(*) as count FROM [dbo].[TestCaseSetupList] WHERE Status IN ('Waiting', 'Hold', 'In Progress')");
    } catch(e) {
      console.log('TestCaseSetupList error:', e.message);
    }
    console.log('Request List Mocks:', res1.recordset[0].count);
    console.log('Case Setup Mocks:', res2.recordset[0].count);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
test();
