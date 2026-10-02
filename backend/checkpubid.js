require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const res = await pool.request().query("SELECT Public_Id FROM [dbo].[TestPurchaseRequestList]");
  console.log('Public_Ids:', res.recordset);
  process.exit(0);
}
run();
