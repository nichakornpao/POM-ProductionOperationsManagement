const { poolPromise } = require('./src/config/database');

async function check() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT Plan_ID, PartNo, Comment, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg <> '-'
        AND Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout <> '-'
    `);
    console.log('Total rows with both DWG and Layout:', res.recordset.length);
    res.recordset.slice(0, 15).forEach(r => {
      console.log(`ID:${r.Plan_ID} Part:${r.PartNo} DwgSrc:${r.Path_Dwg_Source} LaySrc:${r.Path_Layout_Source} Comment:${r.Comment}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
