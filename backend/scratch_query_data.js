const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout, Path_IIQC, Revision, IsActive
      FROM [master].[tb_PC_Plan]
      WHERE PartNo = 'T7070-G1CT01'
    `);
    console.table(result.recordset);
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    process.exit();
  }
}
run();
