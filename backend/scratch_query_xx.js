const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result1 = await pool.request().query(`
      SELECT 'Cutting' as type, DocNo, Process, Status, [CASE]
      FROM [dbo].[tb_IssueCuttingTool_Request_Document]
      WHERE DocNo LIKE '%XX%'
    `);
    console.log('Cutting XX count:', result1.recordset.length);
    if(result1.recordset.length > 0) {
      console.table(result1.recordset.slice(0, 10));
    }

    const result2 = await pool.request().query(`
      SELECT 'Setup' as type, DocNo, Process, Status, [CASE]
      FROM [dbo].[tb_IssueSetupTool_Request_Document]
      WHERE DocNo LIKE '%XX%'
    `);
    console.log('Setup XX count:', result2.recordset.length);
    if (result2.recordset.length > 0) {
      console.table(result2.recordset.slice(0, 10));
    }
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
