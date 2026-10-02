const { poolPromise } = require('./src/config/database');
async function test() {
  try {
    const pool = await poolPromise;
    const res1 = await pool.request().query("SELECT TOP 5 Public_Id, ItemNo, AS400STATUS, Status, QTY, ON_HAND FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE AS400STATUS = 'FAIL' ORDER BY ID_Request DESC");
    const res2 = await pool.request().query("SELECT TOP 5 Public_Id, ItemNo, AS400STATUS, Status, QTY, ON_HAND FROM [dbo].[tb_IssueSetupTool_Request_Document] WHERE AS400STATUS = 'FAIL' ORDER BY ID_RequestSetupTool DESC");
    
    console.log('Cutting FAILS:', res1.recordset);
    console.log('Setup FAILS:', res2.recordset);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
test();
