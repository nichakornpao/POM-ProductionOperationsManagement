const { poolRequestIndirrecPromise } = require('./src/config/database');
async function fixNegatives() {
  const pool = await poolRequestIndirrecPromise;
  await pool.request().query(`
    UPDATE [dbo].[TestPurchaseRequestList] SET STOCK_ON_HAND = 0 WHERE STOCK_ON_HAND < 0;
    UPDATE [dbo].[TestCaseSetupList] SET STOCK_ON_HAND = 0 WHERE STOCK_ON_HAND < 0;
  `);
  console.log('Fixed negatives');
  process.exit(0);
}
fixNegatives();
