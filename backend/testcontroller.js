require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');
async function run() {
  let testRecords = [];
  try {
    const poolIndirrec = await poolRequestIndirrecPromise;
    console.log('Got pool');
    const countResult = await poolIndirrec.request().query(\
      IF OBJECT_ID('[dbo].[TestPurchaseRequestList]', 'U') IS NOT NULL 
        SELECT COUNT(*) AS cnt FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-REQ-%' AND Status = 'Waiting'
      ELSE 
        SELECT -1 AS cnt
    \);
    console.log('Count:', countResult.recordset[0].cnt);
    if (countResult.recordset[0].cnt > 0) {
      const testResult = await poolIndirrec.request().query(\
        SELECT TOP 1 * FROM [dbo].[TestPurchaseRequestList] WHERE Status = 'Waiting'
      \);
      console.log('Sample test row:', testResult.recordset[0].Public_Id);
    }
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
