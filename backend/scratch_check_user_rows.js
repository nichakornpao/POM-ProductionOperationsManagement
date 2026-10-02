const { poolPromise } = require('./src/config/database');

async function inspectUserRows() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, PlanDate, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE PlanDate >= '2026-09-24' AND PlanDate <= '2026-09-30'
      ORDER BY PlanDate DESC, Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} rows between 24/09/2026 and 30/09/2026:`);
    res.recordset.forEach(r => {
      console.log(`ID:${r.Plan_ID} Date:${r.PlanDate.toISOString().slice(0,10)} Part:${r.PartNo} Dwg:'${r.Path_Dwg}' Lay:'${r.Path_Layout}' DwgSrc:'${r.Path_Dwg_Source}' LaySrc:'${r.Path_Layout_Source}' Comment:'${r.Comment}'`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspectUserRows();
