const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 10 DocNo, Process, [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, DateTime_Record) AS NewDocNo 
      FROM [dbo].[tb_IssueCuttingTool_Request_Document] 
      WHERE DocNo LIKE '%XX%'
    `);
    console.table(result.recordset);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
