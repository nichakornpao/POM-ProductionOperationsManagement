const sql = require('mssql');
const config = require('./src/config/database');

async function run() {
  try {
    const pool = await config.poolRequestIndirrecPromise;
    console.log('updating mock data locations...');
    await pool.request().query(`
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 20, MAIN_LOCATION = 'A01 Test' WHERE Public_Id = 'TEST-001';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 15, MAIN_LOCATION = 'A02 Test' WHERE Public_Id = 'TEST-002';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 10, MAIN_LOCATION = 'A03 Test' WHERE Public_Id = 'TEST-003';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 25, MAIN_LOCATION = 'B01 Test' WHERE Public_Id = 'TEST-004';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 50, MAIN_LOCATION = 'B02 Test' WHERE Public_Id = 'TEST-005';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 30, MAIN_LOCATION = 'C01 Test' WHERE Public_Id = 'TEST-006';
      UPDATE [dbo].[TestIssueAs400] SET STOCK_ON_HAND = 12, MAIN_LOCATION = 'C02 Test' WHERE Public_Id = 'TEST-007';
    `);
    console.log('update done');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
