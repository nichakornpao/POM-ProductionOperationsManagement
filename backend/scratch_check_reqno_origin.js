const sql = require('mssql');
const { poolPromise, forecastProjectConfig } = require('./src/config/database');

async function checkReqNoOrigin() {
  try {
    const pool = await poolPromise;

    console.log('\n--- 1. Columns in master.tb_PC_Plan (db_Tooling) ---');
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_PC_Plan'
    `);
    console.log(cols.recordset.map(c => c.COLUMN_NAME));

    console.log('\n--- 2. Samples from master.tb_PC_Plan ---');
    const pcRes = await pool.request().query(`
      SELECT TOP 5 Plan_ID, GroupId, PartNo, Process, Employee_ID, Comment
      FROM master.tb_PC_Plan
      ORDER BY Plan_ID DESC
    `);
    console.log(pcRes.recordset);

    console.log('\n--- 3. Samples from ForecastProject database (Engineer History) ---');
    const fpPool = await sql.connect(forecastProjectConfig);
    const fpRes = await fpPool.request().query(`
      SELECT TOP 5 RequestNo, PartNo, Requestor, Process, Division, PathDwg
      FROM dbo.EngineerPMCpart 
      ORDER BY RequestDate DESC
    `);
    console.log(fpRes.recordset);

  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

checkReqNoOrigin();
