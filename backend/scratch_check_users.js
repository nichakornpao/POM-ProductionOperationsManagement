const { poolPromise } = require('./src/config/database');

async function checkUsers() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, PlanDate, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE UPPER(Comment) LIKE '%PAOPAO%' OR UPPER(Comment) LIKE '%PP%' OR UPPER(Comment) LIKE '%TEST%'
      ORDER BY Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} rows matching PAOPAO/PP/TEST:`);
    res.recordset.forEach(r => {
      console.log(`ID:${r.Plan_ID} Date:${r.PlanDate.toISOString().slice(0,10)} Part:${r.PartNo} DwgSrc:${r.Path_Dwg_Source} LaySrc:${r.Path_Layout_Source} Comment:'${r.Comment}'`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
