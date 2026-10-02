const sql = require('mssql');
const config = require('./src/config/database');
async function run() {
  try {
    const pool = await config.poolRequestIndirrecPromise;
    await pool.request().query(`
      UPDATE [dbo].[TestIssueAs400] 
      SET STOCK_ON_HAND = 100, 
          AS400STATUS = 'Pending' 
      WHERE Public_Id LIKE 'TEST-%'
    `);
    console.log('✅ Successfully updated all mock items to 100 STOCK_ON_HAND and Pending status!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();
