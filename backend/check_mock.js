const { poolRequestIndirrecPromise } = require('./src/config/database');

async function checkMocks() {
  try {
    const pool = await poolRequestIndirrecPromise;
    const result = await pool.request().query(`
      SELECT Public_Id, Status, Remark, STOCK_ON_HAND 
      FROM [RequestindirrecMaterial].[dbo].[TestPurchaseRequestList]
      WHERE Public_Id LIKE 'TEST-%'
    `);
    console.log(result.recordset);
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
}

checkMocks();
