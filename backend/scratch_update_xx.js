const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const updateQuery = `
      UPDATE [dbo].[tb_IssueCuttingTool_Request_Document] 
      SET DocNo = [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, DateTime_Record) 
      WHERE DocNo LIKE '%XX%' AND (Process LIKE 'TURNING%' OR Process LIKE 'MILLING%');
      
      UPDATE [dbo].[tb_IssueSetupTool_Request_Document] 
      SET DocNo = [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, DateTime_Record) 
      WHERE DocNo LIKE '%XX%' AND (Process LIKE 'TURNING%' OR Process LIKE 'MILLING%');
    `;
    const result = await pool.request().query(updateQuery);
    console.log('Update rows affected:', result.rowsAffected);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
