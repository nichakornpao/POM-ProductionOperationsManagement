const { poolRequestIndirrecPromise } = require('./src/config/database');

async function fix() {
  const pool = await poolRequestIndirrecPromise;

  // Reset Waiting items that have AS400STATUS stuck as 'Pending' back to proper state
  // These items have Status='Waiting' but AS400STATUS='Pending' - they should be showable
  const r1 = await pool.request().query(`
    UPDATE [dbo].[TestPurchaseRequestList]
    SET AS400STATUS = NULL
    WHERE Status = 'Waiting' AND AS400STATUS = 'Pending'
  `);
  console.log('Fixed TestPurchaseRequestList stuck Pending rows:', r1.rowsAffected[0]);

  // Verify
  const check = await pool.request().query(`
    SELECT Status, AS400STATUS, COUNT(*) AS cnt 
    FROM [dbo].[TestPurchaseRequestList] 
    GROUP BY Status, AS400STATUS
    ORDER BY Status
  `);
  console.log('\nAfter fix:');
  console.table(check.recordset);

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
