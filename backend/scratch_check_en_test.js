const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function checkEngineerTestRows() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT RequestNo, PartNo, Process, Requestor, Status
      FROM dbo.EngineerPMCpart
      WHERE RequestNo LIKE '%test%' OR PartNo LIKE '%test%' OR Requestor LIKE '%test%'
    `);
    console.log(`EngineerPMCpart test records: ${result.recordset.length}`);
    if (result.recordset.length > 0) {
      console.log(result.recordset);
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkEngineerTestRows();
