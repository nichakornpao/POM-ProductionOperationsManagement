const { poolPromise } = require('./src/config/database');

async function checkDb() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT GroupId, Unique_Id, PlanDate, PartNo, Process, MC_No, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source, ReqStatus, PlanStatus
      FROM master.tb_PC_Plan
      WHERE PartNo LIKE '%7087%' OR CAST(PlanDate AS DATE) = '2026-09-24'
      ORDER BY PlanDate DESC
    `);
    console.log(`Found ${result.recordset.length} rows in master.tb_PC_Plan:`);
    console.table(result.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkDb();
