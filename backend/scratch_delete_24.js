const { poolPromise } = require('./src/config/database');

async function deleteTestRows() {
  try {
    const pool = await poolPromise;
    
    // Deleting Plan_IDs 1626, 1628, 1629
    const result = await pool.request().query(`
      DELETE FROM master.tb_PC_Plan
      WHERE Plan_ID IN (1626, 1628, 1629)
         OR (Employee_ID IN ('Paopao03', 'PP') AND CONVERT(varchar, PlanDate, 120) LIKE '2026-09-24%')
    `);
    
    console.log('Successfully deleted test rows:', result.rowsAffected[0]);

    // Verify 0 rows remain for date 24 with Paopao03 / PP
    const checkRes = await pool.request().query(`
      SELECT Plan_ID, CONVERT(varchar, PlanDate, 120) as PlanDateStr, Employee_ID, PartNo, Comment
      FROM master.tb_PC_Plan
      WHERE CONVERT(varchar, PlanDate, 120) LIKE '2026-09-24%'
    `);
    console.log('Remaining rows on 2026-09-24:', checkRes.recordset);

  } catch(e) {
    console.error('Error during deletion:', e);
  } finally {
    process.exit();
  }
}

deleteTestRows();
