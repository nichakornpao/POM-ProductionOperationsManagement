require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query("SELECT DISTINCT Division FROM [dbo].[TestPurchaseRequestList]");
  console.log('Divisions in Mock:', res.recordset);
  process.exit(0);
}
run();
