const { poolRequestIndirrecPromise } = require('./src/config/database');
async function check() {
  try {
    const pool = await poolRequestIndirrecPromise;
    const res = await pool.request().query(`
      SELECT Division, Status, AS400STATUS, COUNT(1) as cnt
      FROM TestPurchaseRequestList
      GROUP BY Division, Status, AS400STATUS
    `);
    console.log('=== TestPurchaseRequestList data ===');
    console.table(res.recordset);

    const res2 = await pool.request().query(`
      SELECT TOP 3 Public_Id, ItemNo, Division, Status, AS400STATUS, isMockTest
      FROM TestPurchaseRequestList
      WHERE Division = 'PMC'
    `);
    console.log('=== PMC items ===');
    console.table(res2.recordset);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
check();
