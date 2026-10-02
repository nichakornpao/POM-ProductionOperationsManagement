require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const result = await pool.request().query("SELECT TOP 3 * FROM [dbo].[TestPurchaseRequestList]");
  console.log(JSON.stringify(result.recordset, null, 2));
  process.exit(0);
}
run();
