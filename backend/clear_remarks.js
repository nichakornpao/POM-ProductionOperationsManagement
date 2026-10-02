const { poolRequestIndirrecPromise } = require('./src/config/database');

async function updateRemarks() {
  const pool = await poolRequestIndirrecPromise;
  await pool.request().query(`
    UPDATE [dbo].[TestPurchaseRequestList] SET Remark = '' WHERE Public_Id LIKE 'TEST-%';
    UPDATE [dbo].[TestCaseSetupList] SET Remark = '' WHERE Public_Id LIKE 'TEST-%';
  `);
  console.log('Remarks cleared!');
  process.exit(0);
}

updateRemarks();
