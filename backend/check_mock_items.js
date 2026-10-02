require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  const result = await pool.request().query("SELECT ItemNo, QTY, STOCK_ON_HAND FROM [dbo].[TestPurchaseRequestList]");
  console.log('Total mock items:', result.recordset.length);
  process.exit(0);
}
run();
