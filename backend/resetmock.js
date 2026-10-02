require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  const pool = await poolRequestIndirrecPromise;
  await pool.request().query("UPDATE [dbo].[TestPurchaseRequestList] SET Status = 'Waiting'");
  console.log('Restored mock data status to Waiting');
  process.exit(0);
}
run();
