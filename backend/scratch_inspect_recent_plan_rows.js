const { poolPromise } = require('./src/config/database');

async function inspectRows() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT TOP 10 Plan_ID, PartNo, MC_No, Process, Comment, Path_Dwg, Path_Layout, Path_IIQC, Path_Dwg_Source, Path_Layout_Source, DateTime_Record
      FROM master.tb_PC_Plan
      ORDER BY Plan_ID DESC
    `);
    console.log('Top 10 rows in master.tb_PC_Plan:');
    console.log(JSON.stringify(res.recordset, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

inspectRows();
