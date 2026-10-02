const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolRequestIndirrecPromise;
    await pool.request().query("DELETE FROM TestIssueAs400 WHERE Public_Id NOT LIKE 'TEST-%'");
    console.log('Cleaned TestIssueAs400 of non-test data');
    await pool.request().query("DELETE FROM TestPurchaseRequestList WHERE Public_Id NOT LIKE 'TEST-%'");
    console.log('Cleaned TestPurchaseRequestList of non-test data');
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
