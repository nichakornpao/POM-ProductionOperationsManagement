const { sql, poolPromise } = require('./backend/src/config/db');

async function check() {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT Plan_ID, PlanDate, PartNo, GroupId, Is_EN_Completed, Path_Dwg, Path_Layout, Path_IIQC, Path_Dwg_Source, Path_Layout_Source FROM trans.tb_PCPlan WHERE CONVERT(varchar, PlanDate, 103) = '24/09/2026' ORDER BY Plan_ID`);
    console.log("24/09/2026 Plan Rows:");
    console.log(JSON.stringify(result.recordset, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
