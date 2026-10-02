const sql = require('mssql');
const { poolPromise, poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    await pool.request().query(`
      UPDATE [dbo].[tb_IssueCuttingTool_Request_Document]
      SET DocNo = [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, DateTime_Record)
      WHERE DocNo LIKE '%XX%' AND (Process LIKE 'turning%' OR Process LIKE 'milling%');
    `);
    await pool.request().query(`
      UPDATE [dbo].[tb_IssueSetupTool_Request_Document]
      SET DocNo = [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, DateTime_Record)
      WHERE DocNo LIKE '%XX%' AND (Process LIKE 'turning%' OR Process LIKE 'milling%');
    `);
    console.log('Real tables updated.');

    const pool2 = await poolRequestIndirrecPromise;
    if (pool2) {
      await pool2.request().query(`
        UPDATE [dbo].[TestPurchaseRequestList]
        SET DocNo = 'INVTN' + RIGHT(DocNo, 6)
        WHERE DocNo LIKE 'INVXX%' AND (Process LIKE 'turning%' OR Process LIKE 'milling%');
      `).catch(e => console.log('Test table update failed:', e.message));
      console.log('Test tables updated.');
    }
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
run();
