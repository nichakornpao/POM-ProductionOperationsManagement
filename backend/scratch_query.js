const sql = require('mssql');
const { poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolRequestIndirrecPromise;
    const result = await pool.request().query(`
      SELECT Public_Id, DocNo, Process, Status
      FROM [dbo].[TestPurchaseRequestList]
      WHERE Process LIKE 'TURNING%' OR Process LIKE 'MILLING%'
    `);
    console.table(result.recordset);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
