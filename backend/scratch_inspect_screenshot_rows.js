const { poolPromise } = require('./src/config/database');

async function inspectScreenshotRows() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, PlanDate, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source, IsActive, PlanStatus
      FROM [master].[tb_PC_Plan]
      WHERE PlanDate IN ('2026-09-24', '2026-09-30')
        AND UPPER(ISNULL(Comment,'')) LIKE '%TEST%'
      ORDER BY PlanDate DESC, Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} test rows from screenshot:`);
    res.recordset.forEach(r => {
      console.log(`ID:${r.Plan_ID} Date:${r.PlanDate.toISOString().slice(0,10)} Part:${r.PartNo} Comment:'${r.Comment}' DwgSrc:'${r.Path_Dwg_Source}' LaySrc:'${r.Path_Layout_Source}' Active:${r.IsActive} Status:${r.PlanStatus}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspectScreenshotRows();
