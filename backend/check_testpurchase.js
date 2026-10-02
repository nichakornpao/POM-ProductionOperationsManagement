const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolRequestIndirrecPromise;
    const res = await pool.request().query("SELECT DocNo, ItemNo, Public_Id FROM TestPurchaseRequestList");
    console.log(res.recordset);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
