const { sql, poolPromise } = require('./src/config/database');

async function check() {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT Plan_ID, CONVERT(varchar, PlanDate, 103) as PlanDateStr, PartNo, GroupId, Is_EN_Completed, Path_Dwg, Path_Layout, Path_IIQC, Path_Dwg_Source, Path_Layout_Source FROM master.tb_PC_Plan WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25' ORDER BY Plan_ID`);
    console.log("24/09/2026 Plan Rows:");
    console.log(JSON.stringify(result.recordset, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
