const mssql = require('mssql');
const config = require('./src/config/database');
async function run() {
  const pool = await mssql.connect(config.configRequestIndirrec);
  const res = await pool.request().query("SELECT ItemNo, Status FROM [dbo].[TestPurchaseRequestList]");
  console.log(res.recordset);
  process.exit(0);
}
run();
