const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function checkTestRows() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Unique_Id, GroupId, PlanDate, PartNo, MC_No, Comment, PlanStatus, Revision
      FROM master.tb_PC_Plan
      WHERE Comment LIKE '%test%' OR Comment LIKE '%TEST%' OR Comment LIKE '%Test%'
         OR PartNo LIKE '%test%'
      ORDER BY PlanDate DESC
    `);
    console.log(`Found ${result.recordset.length} test records:`);
    console.log(result.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkTestRows();
