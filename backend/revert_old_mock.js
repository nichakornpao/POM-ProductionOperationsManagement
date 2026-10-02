const sql = require('mssql');
const { poolRequestIndirrecPromise } = require('./src/config/database');

async function revertMockData() {
  try {
    const pool = await poolRequestIndirrecPromise;

    // Revert the old items back to 0 stock
    await pool.request().query(`
      UPDATE [dbo].[TestCaseSetupList]
      SET STOCK_ON_HAND = 0
      WHERE Public_Id LIKE 'TEST-CS-%' AND Public_Id NOT LIKE 'TEST-CS-NEW-%'
    `);
    
    console.log('✅ Successfully reverted old mock items to 0 ON HAND stock.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error reverting mock data:', err);
    process.exit(1);
  }
}

revertMockData();
