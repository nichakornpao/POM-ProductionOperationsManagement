const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolRequestIndirrecPromise;
    const res = await pool.request().query("SELECT COUNT(*) as count FROM TestIssueAs400 WHERE DocNo = 'SETTN4260422'");
    console.log('TestIssueAs400:', res.recordset[0].count);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
