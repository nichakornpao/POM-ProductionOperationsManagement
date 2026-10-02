const { poolPromise } = require('./src/config/database');

async function testSelectAll() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT TOP 5 Plan_ID, RequestNo, PartNo, Process, MC_No, Path_Dwg, Path_Layout 
      FROM master.tb_PC_Plan 
      ORDER BY Plan_ID DESC
    `);
    console.log('QueryResult (SELECT TOP 5 with RequestNo):');
    console.table(res.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

testSelectAll();
