const { poolPromise } = require('./src/config/database');

async function checkAllPaopaoAnd24() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, CONVERT(varchar, PlanDate, 120) as PlanDateStr, Employee_ID, PartNo, MC_No, QTY, Comment
      FROM master.tb_PC_Plan
      WHERE Employee_ID LIKE '%Paopao%' 
         OR Employee_ID LIKE '%PP%'
         OR CONVERT(varchar, PlanDate, 120) LIKE '2026-09-24%'
    `);
    console.log('All matching rows:', res.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

checkAllPaopaoAnd24();
