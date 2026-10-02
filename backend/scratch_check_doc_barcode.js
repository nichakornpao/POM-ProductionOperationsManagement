const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function test() {
  try {
    const pool = await poolPromise;
    console.log('--- 1. Checking sample data from tb_PC_Plan ---');
    const sample = await pool.request().query("SELECT TOP 5 Plan_ID, Unique_Id, RequestNo, PartNo, Process, Division, Facility FROM master.tb_PC_Plan WHERE RequestNo IS NOT NULL OR Unique_Id IS NOT NULL");
    console.log('Sample tb_PC_Plan rows:', sample.recordset);

    console.log('\n--- 2. Checking request detail tables (tb_Request_List, tb_Purchase_Request_Detail, etc.) ---');
    try {
      const reqList = await pool.request().query("SELECT TOP 5 * FROM master.tb_Request_List");
      console.log('tb_Request_List sample:', reqList.recordset);
    } catch (e) {
      console.log('tb_Request_List error:', e.message);
    }

    try {
      const reqDet = await pool.request().query("SELECT TOP 5 * FROM master.tb_Purchase_Request_Detail");
      console.log('tb_Purchase_Request_Detail sample:', reqDet.recordset);
    } catch (e) {
      console.log('tb_Purchase_Request_Detail error:', e.message);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}
test();
