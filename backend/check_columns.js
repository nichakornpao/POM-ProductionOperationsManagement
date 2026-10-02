const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query('EXEC trans.Stored_Detail_CaseSetup');
  console.log('Columns:', Object.keys(res.recordset[0] || {}).join(', '));
  process.exit(0);
}
run();
