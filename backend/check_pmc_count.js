const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query("SELECT COUNT(*) as cnt FROM [dbo].[TestCaseSetupList] WHERE Division = 'PMC' AND Status IN ('Waiting', 'Hold', 'In Progress')");
  console.log('PMC count:', res.recordset[0].cnt);
  process.exit(0);
}
run();
