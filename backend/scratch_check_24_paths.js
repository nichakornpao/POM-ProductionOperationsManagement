const { sql, poolPromise } = require('./src/config/database');

async function check24() {
  try {
    const pool = await poolPromise;
    const res24 = await pool.request().query(`
      SELECT Plan_ID, CONVERT(varchar, PlanDate, 103) as PlanDateStr, PartNo, MC_No, Facility, GroupId, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source, Is_EN_Completed
      FROM master.tb_PC_Plan
      WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25'
      ORDER BY Plan_ID
    `);
    console.log("24/09/2026 All Rows:");
    console.log(JSON.stringify(res24.recordset, null, 2));

    // Also search for auto paths for T7025JG3A and T7070-G1CT01 in master.tb_PC_Plan across other dates
    const resParts = await pool.request().query(`
      SELECT PartNo,
             MAX(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' THEN Path_Dwg END) as Known_Dwg,
             MAX(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' THEN Path_Layout END) as Known_Layout
      FROM master.tb_PC_Plan
      WHERE PartNo IN ('T7025JG3A', 'T7070-G1CT01')
      GROUP BY PartNo
    `);
    console.log("\nKnown paths for these parts in DB:");
    console.log(JSON.stringify(resParts.recordset, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check24();
