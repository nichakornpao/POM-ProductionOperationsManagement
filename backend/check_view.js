const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolRequestIndirrecPromise;
    const res = await pool.request().query(`
      SELECT TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TestIssueAs400'
    `);
    console.log('Type:', res.recordset);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
