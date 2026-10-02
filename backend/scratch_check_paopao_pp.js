const { poolPromise } = require('./src/config/database');

async function checkPaopaoAndPP() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, PlanDate, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE Comment LIKE '%paopao%' OR Comment LIKE '%pp%' OR Comment LIKE '%test%'
      ORDER BY Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} rows with Paopao/PP/test in comment:`);
    res.recordset.forEach(r => {
      console.log(`ID:${r.Plan_ID} Part:${r.PartNo} DwgSrc:${r.Path_Dwg_Source} LaySrc:${r.Path_Layout_Source} Comment:'${r.Comment}'`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkPaopaoAndPP();
