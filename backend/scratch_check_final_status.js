const { poolPromise } = require('./src/config/database');

async function checkFinalStatus() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT GroupId, PlanDate, PartNo, MC_No, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM master.tb_PC_Plan
      WHERE PartNo IN ('T7071-G1ET02', 'OT-7087A', 'T7025JG3A') OR Comment LIKE '%test%'
      ORDER BY PlanDate DESC
    `);
    console.log(`Current rows in master.tb_PC_Plan:`);
    console.table(result.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

checkFinalStatus();
