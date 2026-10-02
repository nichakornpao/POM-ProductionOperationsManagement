const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result1 = await pool.request().query(`
      SELECT 'Cutting' as type, DocNo, Process, Status
      FROM [dbo].[tb_IssueCuttingTool_Request_Document]
      WHERE Process LIKE 'TURNING%' OR Process LIKE 'MILLING%'
    `);
    const result2 = await pool.request().query(`
      SELECT 'Setup' as type, DocNo, Process, Status
      FROM [dbo].[tb_IssueSetupTool_Request_Document]
      WHERE Process LIKE 'TURNING%' OR Process LIKE 'MILLING%'
    `);
    console.log('Cutting:');
    console.table(result1.recordset);
    console.log('Setup:');
    console.table(result2.recordset);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
