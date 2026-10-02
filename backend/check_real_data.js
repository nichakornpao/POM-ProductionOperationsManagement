const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolPromise;
    const res = await pool.request().query("SELECT COUNT(*) as count FROM tb_IssueSetupTool_Request_Document WHERE DocNo = 'SETTN4260422'");
    console.log('SetupTool:', res.recordset[0].count);
    const res2 = await pool.request().query("SELECT COUNT(*) as count FROM tb_IssueCuttingTool_Request_Document WHERE DocNo = 'SETTN4260422'");
    console.log('CuttingTool:', res2.recordset[0].count);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
