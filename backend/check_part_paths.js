const { poolPromise } = require('./src/config/database');
const fs = require('fs');

async function checkPaths() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Plan_ID, PartNo, MC_Type, Path_Dwg, Path_Layout, Path_IIQC
      FROM [master].[tb_PC_Plan]
      WHERE PartNo LIKE '%T7070-G1CT01%'
    `);

    console.log(`Found ${result.recordset.length} rows for PartNo T7070-G1CT01:`);
    for (const row of result.recordset) {
      console.log('----------------------------------------------------');
      console.log(`Plan_ID: ${row.Plan_ID}`);
      console.log(`PartNo: ${row.PartNo}`);
      console.log(`Path_Dwg: ${row.Path_Dwg}`);
      console.log(`  Path_Dwg exists? ${row.Path_Dwg ? fs.existsSync(row.Path_Dwg) : false}`);
      console.log(`Path_Layout: ${row.Path_Layout}`);
      console.log(`  Path_Layout exists? ${row.Path_Layout ? fs.existsSync(row.Path_Layout) : false}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error checking paths:', err);
    process.exit(1);
  }
}

checkPaths();
